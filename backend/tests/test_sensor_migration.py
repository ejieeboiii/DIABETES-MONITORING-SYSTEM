"""Migration preservation, backup, rollback and compatibility on private fixtures."""

from contextlib import closing
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from migrate_sensor_configuration import migrate_database, nullable_reading_sql


class SensorMigrationTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(dir=Path(__file__).parent)
        self.addCleanup(self.directory.cleanup)
        self.source = Path(self.directory.name) / "synthetic.db"
        self.backup = Path(self.directory.name) / "backup.db"
        with closing(sqlite3.connect(self.source)) as db:
            db.executescript("""
                CREATE TABLE medical_personnel (id INTEGER PRIMARY KEY, full_name TEXT);
                CREATE TABLE patients (id INTEGER PRIMARY KEY, medical_personnel_id INTEGER REFERENCES medical_personnel(id));
                CREATE TABLE readings (id INTEGER PRIMARY KEY AUTOINCREMENT, patient_id INTEGER NOT NULL REFERENCES patients(id),
                    acetone_ppm FLOAT NOT NULL, temperature FLOAT NOT NULL, humidity FLOAT NOT NULL,
                    diabetes_level VARCHAR(12) NOT NULL, raw_sensor_value INTEGER, suggestion TEXT,
                    taken_at DATETIME, predicted_bgl FLOAT, extra_legacy_note TEXT);
                CREATE INDEX preserved_reading_index ON readings(patient_id, taken_at);
                CREATE TABLE audit_fixture (reading_id INTEGER);
                CREATE TRIGGER preserved_reading_trigger AFTER INSERT ON readings BEGIN INSERT INTO audit_fixture VALUES (new.id); END;
                INSERT INTO medical_personnel VALUES (1, 'Synthetic provider');
                INSERT INTO patients VALUES (1, 1);
                INSERT INTO readings VALUES (7, 1, 2.125, 25.5, 62.3, 'PRE_DIABETIC', 1800, 'Legacy note', '2026-01-01 00:00:00', 123.4, 'Retain extra column');
                INSERT INTO readings(id, patient_id, acetone_ppm, temperature, humidity, diabetes_level) VALUES (99,1,1,25,50,'NORMAL');
                DELETE FROM readings WHERE id=99;
            """)
            self.original_reading = db.execute("SELECT * FROM readings").fetchall()
            self.original_schema = db.execute("SELECT sql FROM sqlite_master WHERE name='readings'").fetchone()[0]
            db.commit()

    def test_preserves_history_patients_extra_columns_indexes_triggers_sequence_and_backup(self):
        self.assertTrue(migrate_database(self.source, self.backup))
        with closing(sqlite3.connect(self.backup)) as backup, closing(sqlite3.connect(self.source)) as db:
            self.assertEqual(backup.execute("SELECT * FROM readings").fetchall(), self.original_reading)
            self.assertEqual(backup.execute("SELECT sql FROM sqlite_master WHERE name='readings'").fetchone()[0], self.original_schema)
            for table in ("patients", "medical_personnel", "audit_fixture"):
                self.assertEqual(db.execute(f"SELECT * FROM {table}").fetchall(), backup.execute(f"SELECT * FROM {table}").fetchall())
            columns = [row[1] for row in backup.execute("PRAGMA table_info(readings)")]
            self.assertEqual(db.execute(f"SELECT {','.join(columns)} FROM readings").fetchall(), self.original_reading)
            self.assertEqual(db.execute("SELECT sensor_configuration, calibration_status, tgs822_raw_adc FROM readings").fetchall(), [("mq138_legacy", "legacy_unverified", None)])
            self.assertEqual(db.execute("SELECT COUNT(*) FROM sqlite_master WHERE name IN ('preserved_reading_index','preserved_reading_trigger')").fetchone()[0], 2)
            db.execute("INSERT INTO readings(patient_id, temperature, humidity, sensor_configuration, tgs822_raw_adc, tgs2620_raw_adc, calibration_status) VALUES (1,28,65,'tgs822_tgs2620',1200,1500,'unverified')")
            self.assertEqual(db.execute("SELECT max(id) FROM readings").fetchone()[0], 100)
            self.assertEqual(db.execute("SELECT acetone_ppm,diabetes_level FROM readings WHERE id=100").fetchone(), (None,None))
            self.assertEqual(db.execute("SELECT reading_id FROM audit_fixture ORDER BY rowid DESC LIMIT 1").fetchone()[0], 100)
            self.assertEqual(db.execute("PRAGMA integrity_check").fetchone()[0], "ok")
            self.assertEqual(db.execute("PRAGMA foreign_key_check").fetchall(), [])

    def test_idempotent_without_second_backup_or_mutation(self):
        migrate_database(self.source, self.backup)
        unused_backup = self.backup.with_name("unused.db")
        self.assertFalse(migrate_database(self.source, unused_backup))
        self.assertFalse(unused_backup.exists())

    def test_rebuild_failure_rolls_back_all_changes_and_retains_original_backup(self):
        with patch("migrate_sensor_configuration.nullable_reading_sql", side_effect=RuntimeError("Synthetic failure")):
            with self.assertRaises(RuntimeError): migrate_database(self.source, self.backup)
        with closing(sqlite3.connect(self.source)) as db:
            self.assertEqual(db.execute("SELECT * FROM readings").fetchall(), self.original_reading)
            self.assertEqual(db.execute("SELECT sql FROM sqlite_master WHERE name='readings'").fetchone()[0], self.original_schema)
        self.assertTrue(self.backup.exists())

    def test_existing_backup_is_never_overwritten(self):
        self.backup.write_text("Do not overwrite", encoding="utf-8")
        with self.assertRaises(FileExistsError): migrate_database(self.source, self.backup)
        self.assertEqual(self.backup.read_text(), "Do not overwrite")

    def test_partial_or_referenced_schema_refused_without_changes(self):
        with closing(sqlite3.connect(self.source)) as db:
            db.execute("CREATE TABLE unknown_dependency (reading_id INTEGER REFERENCES readings(id))")
            db.commit()
        with self.assertRaises(RuntimeError): migrate_database(self.source, self.backup)
        self.assertFalse(self.backup.exists())
        with closing(sqlite3.connect(self.source)) as db:
            db.execute("DROP TABLE unknown_dependency")
            db.execute("ALTER TABLE readings ADD COLUMN tgs822_raw_adc INTEGER")
            db.commit()
        with self.assertRaises(RuntimeError): migrate_database(self.source, self.backup)
        self.assertFalse(self.backup.exists())

    def test_quoted_table_and_columns_supported(self):
        sql = 'CREATE TABLE "readings" ("id" INTEGER PRIMARY KEY, "acetone_ppm" FLOAT NOT NULL, "diabetes_level" VARCHAR(12) NOT NULL)'
        result = nullable_reading_sql(sql)
        self.assertIn('"readings_tgs_migration"', result)
        self.assertNotIn("NOT NULL", result)
