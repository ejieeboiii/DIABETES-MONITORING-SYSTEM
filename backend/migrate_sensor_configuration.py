"""Backed-up, transactional SQLite migration for the dual TGS configuration.

Stop the API before running this command. No patient table is rewritten. The
original reading columns/values, indexes, triggers and foreign keys are retained.
"""

import argparse
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
import re
import sqlite3

from backup_database import backup_database


ADDED_COLUMNS = {
    "sensor_configuration": "TEXT NOT NULL DEFAULT 'mq138_legacy'",
    "tgs822_raw_adc": "INTEGER",
    "tgs2620_raw_adc": "INTEGER",
    "tgs822_baseline_adc": "INTEGER",
    "tgs2620_baseline_adc": "INTEGER",
    "calibration_status": "TEXT NOT NULL DEFAULT 'legacy_unverified'",
    "calibration_profile_id": "TEXT",
}


def quote_identifier(value: str) -> str:
    return '"' + value.replace('"', '""') + '"'


def migration_needed(columns: list) -> bool:
    fields = {row[1]: row for row in columns}
    present = set(ADDED_COLUMNS).intersection(fields)
    if present and present != set(ADDED_COLUMNS):
        raise RuntimeError("Partial sensor schema found. Review it before migrating.")
    for name in ("id", "patient_id", "acetone_ppm", "diabetes_level"):
        if name not in fields:
            raise RuntimeError("Unsupported readings schema; migration was not applied.")
    return not present or bool(fields["acetone_ppm"][3]) or bool(fields["diabetes_level"][3])


def nullable_reading_sql(sql: str) -> str:
    sql, count = re.subn(r'^(CREATE\s+TABLE\s+)(?:"readings"|`readings`|\[readings\]|readings)(?=\s|\()',
                        r'\1"readings_tgs_migration"', sql, count=1, flags=re.IGNORECASE)
    if count != 1:
        raise RuntimeError("Unsupported table definition; migration was not applied.")
    for column in ("acetone_ppm", "diabetes_level"):
        pattern = rf'((?:"{column}"|`{column}`|\[{column}\]|\b{column}\b)\s+[^,]+)'
        def remove_required(match):
            return re.sub(r'\s+NOT\s+NULL\b', '', match.group(1), flags=re.IGNORECASE)
        sql, count = re.subn(pattern, remove_required, sql, count=1, flags=re.IGNORECASE)
        if count != 1:
            raise RuntimeError("Unsupported derived-field definition; migration was not applied.")
    return sql


def migrate_database(source: Path, backup: Path) -> bool:
    source = source.resolve(strict=True)
    backup = backup.resolve()
    with closing(sqlite3.connect(source.as_uri() + "?mode=rw", uri=True, timeout=5)) as db:
        # SQLite requires FK checks off during a table rebuild. Check before and
        # after; foreign-key declarations themselves remain in the original SQL.
        db.execute("PRAGMA foreign_keys=OFF")
        db.execute("BEGIN IMMEDIATE")
        try:
            original_columns = db.execute('PRAGMA table_info("readings")').fetchall()
            if not migration_needed(original_columns):
                db.rollback()
                return False
            if db.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise RuntimeError("Database integrity failed; no migration applied.")
            if db.execute("PRAGMA foreign_key_check").fetchone():
                raise RuntimeError("Existing foreign-key inconsistency; no migration applied.")
            tables = db.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
            if any(name == "readings_tgs_migration" for (name,) in tables):
                raise RuntimeError("Migration staging table already exists; no changes applied.")
            # Refuse unknown relationships rather than risk rewriting dependent tables.
            for (name,) in tables:
                if name != "readings" and any(row[2] == "readings" for row in db.execute(
                        f"PRAGMA foreign_key_list({quote_identifier(name)})")):
                    raise RuntimeError("A table references readings; review migration compatibility first.")
            objects = db.execute("SELECT sql FROM sqlite_master WHERE tbl_name='readings' "
                                 "AND type IN ('index','trigger') AND sql IS NOT NULL").fetchall()
            sequence = None
            if any(name == "sqlite_sequence" for (name,) in tables):
                sequence = db.execute("SELECT seq FROM sqlite_sequence WHERE name='readings'").fetchone()
            # A separate read-only connection can back up while this connection
            # holds the reserved write lock, preventing intervening writes.
            backup_database(source, backup)
            existing = {row[1] for row in original_columns}
            for name, definition in ADDED_COLUMNS.items():
                if name not in existing:
                    db.execute(f"ALTER TABLE readings ADD COLUMN {name} {definition}")
            table_sql = db.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='readings'").fetchone()[0]
            db.execute(nullable_reading_sql(table_sql))
            columns = ', '.join(quote_identifier(row[1]) for row in db.execute('PRAGMA table_info("readings")'))
            db.execute(f"INSERT INTO readings_tgs_migration ({columns}) SELECT {columns} FROM readings")
            # Compare every column, not merely row counts. Existing values and IDs
            # must remain exactly equal before the original table can be replaced.
            for left, right in (("readings", "readings_tgs_migration"), ("readings_tgs_migration", "readings")):
                if db.execute(f"SELECT {columns} FROM {left} EXCEPT SELECT {columns} FROM {right} LIMIT 1").fetchone():
                    raise RuntimeError("History comparison failed; migration rolled back.")
            if db.execute("SELECT COUNT(*) FROM readings").fetchone() != db.execute("SELECT COUNT(*) FROM readings_tgs_migration").fetchone():
                raise RuntimeError("History count comparison failed; migration rolled back.")
            db.execute("DROP TABLE readings")
            db.execute("ALTER TABLE readings_tgs_migration RENAME TO readings")
            for (sql,) in objects:
                db.execute(sql)
            if sequence is not None:
                db.execute("UPDATE sqlite_sequence SET seq=? WHERE name='readings'", sequence)
            if migration_needed(db.execute('PRAGMA table_info("readings")').fetchall()):
                raise RuntimeError("Schema verification failed; migration rolled back.")
            if db.execute("PRAGMA foreign_key_check").fetchone() or db.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise RuntimeError("Post-migration integrity failed; migration rolled back.")
            db.commit()
            return True
        except Exception:
            db.rollback()
            raise


def require_sensor_schema(engine) -> None:
    from sqlalchemy import inspect
    columns = inspect(engine).get_columns("readings")
    fields = {column["name"]: column for column in columns}
    if not set(ADDED_COLUMNS).issubset(fields) or any(not fields[name]["nullable"] for name in ("acetone_ppm", "diabetes_level")):
        raise RuntimeError("Sensor schema migration required. Stop the API and run migrate_sensor_configuration.py; see SENSOR_CONFIGURATION.md.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=Path(__file__).with_name("diabetes_monitoring.db"))
    parser.add_argument("--backup", type=Path, help="New private backup path; existing files are never overwritten.")
    args = parser.parse_args()
    backup = args.backup
    if backup is None:
        directory = Path(__file__).with_name("backups")
        directory.mkdir(exist_ok=True)
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        backup = directory / f"before-tgs-{timestamp}.db"
    try:
        changed = migrate_database(args.source, backup)
    except (RuntimeError, ValueError, OSError, sqlite3.Error) as exc:
        # Never print rows, health payloads or connection strings.
        raise SystemExit(f"Migration stopped ({type(exc).__name__}); database transaction rolled back. Inspect schema/backup and retry after resolving the cause.") from None
    print("Sensor schema migrated; original data verified and private backup retained." if changed else "Sensor schema already current; no changes made.")
