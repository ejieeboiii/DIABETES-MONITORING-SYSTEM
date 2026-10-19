"""Add nullable Step 4 metadata without assigning invented historical provenance."""
import argparse
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
import sqlite3
from sqlalchemy import inspect
from backup_database import backup_database
from migrate_sensor_configuration import quote_identifier
from migrate_simulation import schema_current as simulation_schema_current

ADDED_COLUMNS = {"preprocessing_version": "TEXT", "preprocessing_metadata": "JSON",
                 "calibration_version": "TEXT", "model_version": "TEXT",
                 "estimation_status": "TEXT", "estimation_reason": "TEXT"}


def schema_current(db) -> bool:
    return set(ADDED_COLUMNS).issubset({row[1] for row in db.execute("PRAGMA table_info(readings)")})


def migrate_database(source: Path, backup: Path) -> bool:
    source = source.resolve(strict=True)
    with closing(sqlite3.connect(source.as_uri()+"?mode=rw", uri=True, timeout=5)) as db:
        db.execute("PRAGMA foreign_keys=ON")
        db.execute("BEGIN IMMEDIATE")
        try:
            if schema_current(db):
                db.rollback()
                return False
            if not simulation_schema_current(db):
                raise RuntimeError("Run Step 3 migration first.")
            if set(ADDED_COLUMNS) & {row[1] for row in db.execute("PRAGMA table_info(readings)")}:
                raise RuntimeError("Partial preprocessing schema; manual review required.")
            if db.execute("PRAGMA integrity_check").fetchone()[0] != "ok" or db.execute("PRAGMA foreign_key_check").fetchone():
                raise RuntimeError("Existing integrity inconsistency; migration stopped.")
            backup_database(source, backup)
            for column, sql_type in ADDED_COLUMNS.items():
                db.execute(f"ALTER TABLE readings ADD COLUMN {column} {sql_type}")
            db.execute("ATTACH DATABASE ? AS previous", (backup.resolve().as_uri()+"?mode=ro",))
            tables = [row[0] for row in db.execute("SELECT name FROM previous.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
            for table in tables:
                table_sql = quote_identifier(table)
                fields = ','.join(quote_identifier(row[1]) for row in db.execute(f"PRAGMA previous.table_info({table_sql})"))
                for left, right in (("main", "previous"), ("previous", "main")):
                    if db.execute(f"SELECT {fields} FROM {left}.{table_sql} EXCEPT SELECT {fields} FROM {right}.{table_sql} LIMIT 1").fetchone():
                        raise RuntimeError("Original values changed; transaction rolled back.")
                if db.execute(f"SELECT COUNT(*) FROM main.{table_sql}").fetchone() != db.execute(f"SELECT COUNT(*) FROM previous.{table_sql}").fetchone():
                    raise RuntimeError("Original row counts changed; transaction rolled back.")
            if db.execute("PRAGMA main.integrity_check").fetchone()[0] != "ok" or db.execute("PRAGMA main.foreign_key_check").fetchone():
                raise RuntimeError("Final integrity check failed; transaction rolled back.")
            db.commit()
            return True
        except Exception:
            db.rollback()
            raise


def require_preprocessing_schema(engine):
    if not set(ADDED_COLUMNS).issubset({col["name"] for col in inspect(engine).get_columns("readings")}):
        raise RuntimeError("Step 4 migration required. Stop the API and run migrate_preprocessing.py; see STEP4_PREPROCESSING_ESTIMATION_REPORT.md.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=Path(__file__).with_name("diabetes_monitoring.db"))
    parser.add_argument("--backup", type=Path)
    args = parser.parse_args()
    directory = Path(__file__).with_name("backups")
    directory.mkdir(exist_ok=True)
    backup = args.backup or directory / ("before-preprocessing-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ") + ".db")
    try:
        changed = migrate_database(args.source, backup)
    except (RuntimeError, ValueError, OSError, sqlite3.Error) as exc:
        reason = str(exc) if isinstance(exc, (RuntimeError, ValueError)) else type(exc).__name__
        raise SystemExit(f"Migration stopped; transaction rolled back: {reason}") from None
    print("Preprocessing schema migrated; original data verified; private backup retained." if changed else "Preprocessing schema already current; no changes made.")
