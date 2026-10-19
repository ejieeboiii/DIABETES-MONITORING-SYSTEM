"""Add synthetic-data provenance and durable simulation state without rewriting history."""
import argparse
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
import sqlite3
from sqlalchemy import inspect
from sqlalchemy.dialects.sqlite import dialect
from sqlalchemy.schema import CreateTable
from backup_database import backup_database
from migrate_sensor_configuration import quote_identifier
from migrate_scan_workflow import schema_current as scan_schema_current
from models import SimulationRun


def schema_current(db) -> bool:
    columns = {row[1] for row in db.execute("PRAGMA table_info(readings)")}
    tables = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    if "is_simulated" not in columns or "simulation_runs" not in tables:
        return False
    if {row[1] for row in db.execute("PRAGMA table_info(simulation_runs)")} != {col.name for col in SimulationRun.__table__.columns}:
        raise RuntimeError("Unexpected simulation schema; manual compatibility review required.")
    indexes = db.execute("PRAGMA index_list(simulation_runs)").fetchall()
    for fields in (["session_id"], ["acquisition_id"]):
        if not any(index[2] and [row[2] for row in db.execute(f"PRAGMA index_info({quote_identifier(index[1])})")] == fields for index in indexes):
            raise RuntimeError("Simulation uniqueness constraints are missing.")
    return True


def migrate_database(source: Path, backup: Path) -> bool:
    source = source.resolve(strict=True)
    with closing(sqlite3.connect(source.as_uri() + "?mode=rw", uri=True, timeout=5)) as db:
        db.execute("PRAGMA foreign_keys=ON")
        db.execute("BEGIN IMMEDIATE")
        try:
            if schema_current(db):
                db.rollback()
                return False
            if not scan_schema_current(db):
                raise RuntimeError("Run Steps 1 and 2 migrations first.")
            if "is_simulated" in {row[1] for row in db.execute("PRAGMA table_info(readings)")} or db.execute("SELECT 1 FROM sqlite_master WHERE name='simulation_runs'").fetchone():
                raise RuntimeError("Partial simulation schema; migration stopped.")
            if db.execute("PRAGMA integrity_check").fetchone()[0] != "ok" or db.execute("PRAGMA foreign_key_check").fetchone():
                raise RuntimeError("Existing integrity inconsistency; migration stopped.")
            backup_database(source, backup)
            db.execute("ALTER TABLE readings ADD COLUMN is_simulated BOOLEAN NOT NULL DEFAULT 0")
            db.execute(str(CreateTable(SimulationRun.__table__).compile(dialect=dialect())))
            db.execute("ATTACH DATABASE ? AS before_simulation", (backup.resolve().as_uri() + "?mode=ro",))
            # Verify every pre-existing table/column, including scan and receipt history.
            tables = [row[0] for row in db.execute("SELECT name FROM before_simulation.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
            for table in tables:
                table_sql = quote_identifier(table)
                fields = ','.join(quote_identifier(row[1]) for row in db.execute(f"PRAGMA before_simulation.table_info({table_sql})"))
                for left, right in (("main", "before_simulation"), ("before_simulation", "main")):
                    if db.execute(f"SELECT {fields} FROM {left}.{table_sql} EXCEPT SELECT {fields} FROM {right}.{table_sql} LIMIT 1").fetchone():
                        raise RuntimeError("Original values changed; transaction rolled back.")
                if db.execute(f"SELECT COUNT(*) FROM main.{table_sql}").fetchone() != db.execute(f"SELECT COUNT(*) FROM before_simulation.{table_sql}").fetchone():
                    raise RuntimeError("Original row counts changed; transaction rolled back.")
            if not schema_current(db) or db.execute("PRAGMA main.integrity_check").fetchone()[0] != "ok" or db.execute("PRAGMA main.foreign_key_check").fetchone():
                raise RuntimeError("Final integrity check failed; transaction rolled back.")
            db.commit()
            return True
        except Exception:
            db.rollback()
            raise


def require_simulation_schema(engine) -> None:
    inspector = inspect(engine)
    if not inspector.has_table("simulation_runs") or "is_simulated" not in {column["name"] for column in inspector.get_columns("readings")}:
        raise RuntimeError("Simulation migration required. Stop the API and run migrate_simulation.py; see STEP3_SIMULATION_REPORT.md in the repository root.")
    if {column["name"] for column in inspector.get_columns("simulation_runs")} != {column.name for column in SimulationRun.__table__.columns}:
        raise RuntimeError("Simulation schema is incomplete; review before startup.")
    if not any(item["column_names"] == ["acquisition_id"] for item in inspector.get_unique_constraints("simulation_runs")):
        raise RuntimeError("Simulation acquisition uniqueness is missing.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=Path(__file__).with_name("diabetes_monitoring.db"))
    parser.add_argument("--backup", type=Path)
    args = parser.parse_args()
    directory = Path(__file__).with_name("backups")
    directory.mkdir(exist_ok=True)
    backup = args.backup or directory / ("before-simulation-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ") + ".db")
    try:
        changed = migrate_database(args.source, backup)
    except (RuntimeError, ValueError, OSError, sqlite3.Error) as exc:
        reason = str(exc) if isinstance(exc, (RuntimeError, ValueError)) else type(exc).__name__
        raise SystemExit(f"Migration stopped; transaction rolled back: {reason}") from None
    print("Simulation schema migrated; original data verified; private backup retained." if changed else "Simulation schema already current; no changes made.")
