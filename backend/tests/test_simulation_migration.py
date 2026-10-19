from contextlib import closing
import sqlite3
import unittest
from unittest.mock import patch
from sqlalchemy import create_engine
import test_scan_migration
from migrate_scan_workflow import migrate_database as migrate_scans
from migrate_simulation import migrate_database, schema_current, require_simulation_schema


class SimulationMigrationTests(unittest.TestCase):
    def setUp(self):
        test_scan_migration.ScanMigrationTests.setUp(self)
        migrate_scans(self.source, self.backup)
        self.backup = self.backup.with_name("before-simulation.db")

    def test_backup_preserves_every_existing_column_and_private_history(self):
        self.assertTrue(migrate_database(self.source, self.backup))
        with closing(sqlite3.connect(self.source)) as db, closing(sqlite3.connect(self.backup)) as backup:
            self.assertTrue(schema_current(db))
            for table in ("medical_personnel", "patients", "readings", "scan_sessions", "sensor_acquisitions", "audit_fixture"):
                columns = ','.join(row[1] for row in backup.execute(f"PRAGMA table_info({table})"))
                self.assertEqual(db.execute(f"SELECT {columns} FROM {table}").fetchall(), backup.execute(f"SELECT * FROM {table}").fetchall())
            self.assertEqual(db.execute("SELECT is_simulated FROM readings").fetchall(), [(0,)])
            self.assertEqual(db.execute("PRAGMA foreign_key_check").fetchall(), [])
            self.assertEqual(db.execute("PRAGMA integrity_check").fetchone()[0], "ok")
        original_backup = self.backup.read_bytes()
        self.assertFalse(migrate_database(self.source, self.backup))
        self.assertEqual(self.backup.read_bytes(), original_backup)
        engine = create_engine(f"sqlite:///{self.source}")
        try: require_simulation_schema(engine)
        finally: engine.dispose()

    def test_failed_ddl_rolls_back_and_preserves_verified_backup(self):
        with patch("migrate_simulation.CreateTable", side_effect=RuntimeError("Synthetic failure")):
            with self.assertRaises(RuntimeError): migrate_database(self.source, self.backup)
        with closing(sqlite3.connect(self.source)) as db, closing(sqlite3.connect(self.backup)) as backup:
            self.assertEqual(db.execute("PRAGMA table_info(readings)").fetchall(), backup.execute("PRAGMA table_info(readings)").fetchall())
            self.assertEqual(db.execute("SELECT * FROM readings").fetchall(), backup.execute("SELECT * FROM readings").fetchall())
            self.assertFalse(schema_current(db))

    def test_existing_backup_and_partial_schema_are_refused(self):
        self.backup.write_text("retain", encoding="utf-8")
        with self.assertRaises(FileExistsError): migrate_database(self.source, self.backup)
        self.assertEqual(self.backup.read_text(), "retain")
        with closing(sqlite3.connect(self.source)) as db:
            db.execute("ALTER TABLE readings ADD COLUMN is_simulated BOOLEAN NOT NULL DEFAULT 0")
            db.commit()
        with self.assertRaises(RuntimeError): migrate_database(self.source, self.backup.with_name("unused.db"))

    def test_unmigrated_schema_blocks_startup(self):
        engine = create_engine(f"sqlite:///{self.source}")
        try:
            with self.assertRaises(RuntimeError): require_simulation_schema(engine)
        finally: engine.dispose()
