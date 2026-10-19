"""Step 2 additive upgrade preserves the Step 1 schema and legacy history."""

from contextlib import closing
import sqlite3
import unittest
from unittest.mock import patch
from sqlalchemy import create_engine

import test_sensor_migration as legacy
from migrate_scan_workflow import migrate_database, schema_current, require_scan_schema


class ScanMigrationTests(unittest.TestCase):
    def setUp(self):
        legacy.SensorMigrationTests.setUp(self)
        legacy.migrate_database(self.source, self.backup)
        self.backup = self.backup.with_name("before-scans.db")

    def test_additive_backup_history_indexes_triggers_and_foreign_keys(self):
        self.assertTrue(migrate_database(self.source, self.backup))
        with closing(sqlite3.connect(self.source)) as db, closing(sqlite3.connect(self.backup)) as backup:
            self.assertTrue(schema_current(db))
            for table in ("medical_personnel", "patients", "readings", "audit_fixture"):
                columns = ','.join(row[1] for row in backup.execute(f"PRAGMA table_info({table})"))
                self.assertEqual(db.execute(f"SELECT {columns} FROM {table}").fetchall(), backup.execute(f"SELECT * FROM {table}").fetchall())
            self.assertEqual(db.execute("SELECT medical_personnel_id, device_id, scan_session_id, acquisition_id FROM readings").fetchall(), [(None, None, None, None)])
            self.assertEqual(db.execute("SELECT COUNT(*) FROM scan_sessions").fetchone()[0], 0)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM sensor_acquisitions").fetchone()[0], 0)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM sqlite_master WHERE name IN ('preserved_reading_index','preserved_reading_trigger')").fetchone()[0], 2)
            self.assertEqual(db.execute("PRAGMA foreign_key_check").fetchall(), [])
            self.assertEqual(db.execute("PRAGMA integrity_check").fetchone()[0], "ok")
        engine = create_engine(f"sqlite:///{self.source}")
        try: require_scan_schema(engine)
        finally: engine.dispose()

    def test_idempotent_upgrade_does_not_overwrite_backup(self):
        migrate_database(self.source, self.backup)
        original = self.backup.read_bytes()
        self.assertFalse(migrate_database(self.source, self.backup))
        self.assertEqual(self.backup.read_bytes(), original)

    def test_failure_after_table_ddl_rolls_back_and_keeps_verified_backup(self):
        with patch("migrate_scan_workflow.CreateIndex", side_effect=RuntimeError("Synthetic index failure")):
            with self.assertRaises(RuntimeError): migrate_database(self.source, self.backup)
        with closing(sqlite3.connect(self.source)) as db, closing(sqlite3.connect(self.backup)) as backup:
            self.assertEqual(db.execute("SELECT * FROM readings").fetchall(), backup.execute("SELECT * FROM readings").fetchall())
            self.assertIsNone(db.execute("SELECT name FROM sqlite_master WHERE name='scan_sessions'").fetchone())
            self.assertEqual(db.execute("PRAGMA table_info(readings)").fetchall(), backup.execute("PRAGMA table_info(readings)").fetchall())

    def test_partial_schema_and_existing_backup_are_refused(self):
        self.backup.write_text("preserve", encoding="utf-8")
        with self.assertRaises(FileExistsError): migrate_database(self.source, self.backup)
        self.assertEqual(self.backup.read_text(), "preserve")
        with closing(sqlite3.connect(self.source)) as db:
            db.execute("ALTER TABLE readings ADD COLUMN acquisition_id TEXT"); db.commit()
        with self.assertRaises(RuntimeError): migrate_database(self.source, self.backup.with_name("unused.db"))
        self.assertFalse(self.backup.with_name("unused.db").exists())

    def test_missing_uniqueness_blocks_startup_instead_of_silent_repair(self):
        migrate_database(self.source, self.backup)
        with closing(sqlite3.connect(self.source)) as db:
            db.execute("DROP INDEX ux_scan_active_provider"); db.commit()
        engine = create_engine(f"sqlite:///{self.source}")
        try:
            with self.assertRaises(RuntimeError): require_scan_schema(engine)
        finally: engine.dispose()
