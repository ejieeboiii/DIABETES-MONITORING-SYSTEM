"""Add durable scans/acquisition receipts after the Step 1 sensor migration.

Stop the API and other writers first. Every original column is compared with a
verified, exclusive private backup before the additive transaction commits.
"""

import argparse
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
import sqlite3

from sqlalchemy import inspect
from sqlalchemy.dialects.sqlite import dialect
from sqlalchemy.schema import CreateTable, CreateIndex
from backup_database import backup_database
from migrate_sensor_configuration import quote_identifier, ADDED_COLUMNS as SENSOR_COLUMNS
import models

ADDED_COLUMNS = {
    "medical_personnel_id": "INTEGER REFERENCES medical_personnel(id)",
    "device_id": "TEXT",
    "scan_session_id": "TEXT REFERENCES scan_sessions(id)",
    "acquisition_id": "TEXT",
}
NEW_TABLES = (models.ScanSession.__table__, models.SensorAcquisition.__table__)
REQUIRED_INDEXES = {
    "readings": {"ux_readings_acquisition_id": ["acquisition_id"]},
    "scan_sessions": {"ux_scan_active_provider": ["active_provider_id"]},
    "sensor_acquisitions": {"ux_acquisition_session": ["scan_session_id"]},
}


def schema_current(db) -> bool:
    tables = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    columns = {row[1] for row in db.execute("PRAGMA table_info(readings)")}
    if not set(ADDED_COLUMNS).issubset(columns) or not {table.name for table in NEW_TABLES}.issubset(tables):
        return False
    for table in NEW_TABLES:
        if {col.name for col in table.columns} != {row[1] for row in db.execute(f"PRAGMA table_info({quote_identifier(table.name)})")}:
            raise RuntimeError("Unexpected scan table columns; manual compatibility review required.")
    for table, indexes in REQUIRED_INDEXES.items():
        actual = {row[1]: row[2] for row in db.execute(f"PRAGMA index_list({quote_identifier(table)})")}
        for name, fields in indexes.items():
            if not actual.get(name) or [row[2] for row in db.execute(f"PRAGMA index_info({quote_identifier(name)})")] != fields:
                return False
    return True


def migrate_database(source: Path, backup: Path) -> bool:
    source = source.resolve(strict=True)
    with closing(sqlite3.connect(source.as_uri() + "?mode=rw", uri=True, timeout=5)) as db:
        db.execute("PRAGMA foreign_keys=ON")
        db.execute("BEGIN IMMEDIATE")
        try:
            if schema_current(db):
                db.rollback(); return False
            existing_tables = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            original_columns = {row[1] for row in db.execute("PRAGMA table_info(readings)")}
            if not set(SENSOR_COLUMNS).issubset(original_columns):
                raise RuntimeError("Run the Step 1 sensor migration first.")
            if set(ADDED_COLUMNS).intersection(original_columns) or any(table.name in existing_tables for table in NEW_TABLES):
                raise RuntimeError("Partial scan schema found; manual compatibility review required.")
            if db.execute("PRAGMA integrity_check").fetchone()[0] != "ok" or db.execute("PRAGMA foreign_key_check").fetchone():
                raise RuntimeError("Existing integrity/relationship inconsistency; migration stopped.")
            backup_database(source, backup)
            for table in NEW_TABLES:
                db.execute(str(CreateTable(table).compile(dialect=dialect())))
                for index in table.indexes:
                    db.execute(str(CreateIndex(index).compile(dialect=dialect())))
            for name, sql in ADDED_COLUMNS.items():
                db.execute(f"ALTER TABLE readings ADD COLUMN {name} {sql}")
            db.execute("CREATE UNIQUE INDEX ux_readings_acquisition_id ON readings(acquisition_id)")
            db.execute("ATTACH DATABASE ? AS before_scans", (backup.resolve().as_uri() + "?mode=ro",))
            for table in ("medical_personnel", "patients", "readings"):
                fields = ','.join(quote_identifier(row[1]) for row in db.execute(f"PRAGMA before_scans.table_info({quote_identifier(table)})"))
                for left, right in (("main", "before_scans"), ("before_scans", "main")):
                    if db.execute(f"SELECT {fields} FROM {left}.{table} EXCEPT SELECT {fields} FROM {right}.{table} LIMIT 1").fetchone():
                        raise RuntimeError("Original data comparison failed; transaction rolled back.")
                if db.execute(f"SELECT COUNT(*) FROM main.{table}").fetchone() != db.execute(f"SELECT COUNT(*) FROM before_scans.{table}").fetchone():
                    raise RuntimeError("Original row count comparison failed; transaction rolled back.")
            if not schema_current(db) or db.execute("PRAGMA main.integrity_check").fetchone()[0] != "ok" or db.execute("PRAGMA main.foreign_key_check").fetchone():
                raise RuntimeError("Final schema/integrity verification failed; transaction rolled back.")
            db.commit()
            return True
        except Exception:
            db.rollback()
            raise


def require_scan_schema(engine) -> None:
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    if not {"scan_sessions", "sensor_acquisitions"}.issubset(tables) or not set(ADDED_COLUMNS).issubset({col["name"] for col in inspector.get_columns("readings")}):
        raise RuntimeError("Scan workflow migration required. Stop the API and run migrate_scan_workflow.py; see SCAN_WORKFLOW.md.")
    for table, indexes in REQUIRED_INDEXES.items():
        actual = {index["name"]: index for index in inspector.get_indexes(table)}
        if any(name not in actual or not actual[name]["unique"] or actual[name]["column_names"] != fields for name, fields in indexes.items()):
            raise RuntimeError("Scan uniqueness constraints are missing. Review scan schema before startup.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=Path(__file__).with_name("diabetes_monitoring.db"))
    parser.add_argument("--backup", type=Path)
    args = parser.parse_args()
    backup = args.backup
    if backup is None:
        directory = Path(__file__).with_name("backups"); directory.mkdir(exist_ok=True)
        backup = directory / ("before-scans-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ") + ".db")
    try:
        changed = migrate_database(args.source, backup)
    except (RuntimeError, ValueError, OSError, sqlite3.Error) as exc:
        reason = str(exc) if isinstance(exc, (RuntimeError, ValueError)) else type(exc).__name__
        raise SystemExit(f"Migration stopped; transaction rolled back: {reason}") from None
    print("Scan schema migrated; original data verified and private backup retained." if changed else "Scan schema already current; no changes made.")
