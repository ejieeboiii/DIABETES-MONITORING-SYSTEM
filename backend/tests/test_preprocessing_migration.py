from contextlib import closing
import sqlite3
import unittest
from unittest.mock import patch
from sqlalchemy import create_engine
import test_simulation_migration
from migrate_simulation import migrate_database as migrate_simulation
from migrate_preprocessing import migrate_database, ADDED_COLUMNS, require_preprocessing_schema


class PreprocessingMigrationTests(unittest.TestCase):
    def setUp(self):
        test_simulation_migration.SimulationMigrationTests.setUp(self)
        migrate_simulation(self.source,self.backup)
        self.backup=self.backup.with_name('before-preprocessing.db')

    def test_preserves_every_original_table_and_leaves_historical_metadata_unknown(self):
        self.assertTrue(migrate_database(self.source,self.backup))
        with closing(sqlite3.connect(self.source)) as db, closing(sqlite3.connect(self.backup)) as previous:
            tables=[row[0] for row in previous.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
            for table in tables:
                fields=','.join(row[1] for row in previous.execute(f'PRAGMA table_info({table})'))
                self.assertEqual(db.execute(f'SELECT {fields} FROM {table}').fetchall(),previous.execute(f'SELECT * FROM {table}').fetchall())
            self.assertEqual(db.execute('SELECT '+','.join(ADDED_COLUMNS)+' FROM readings').fetchone(),(None,)*6)
            self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(),[])
        original=self.backup.read_bytes()
        self.assertFalse(migrate_database(self.source,self.backup))
        self.assertEqual(self.backup.read_bytes(),original)
        engine=create_engine(f'sqlite:///{self.source}')
        try: require_preprocessing_schema(engine)
        finally: engine.dispose()

    def test_partial_schema_and_unmigrated_startup_are_refused(self):
        engine=create_engine(f'sqlite:///{self.source}')
        try:
            with self.assertRaises(RuntimeError): require_preprocessing_schema(engine)
        finally: engine.dispose()
        with closing(sqlite3.connect(self.source)) as db:
            db.execute('ALTER TABLE readings ADD COLUMN model_version TEXT'); db.commit()
        with self.assertRaises(RuntimeError): migrate_database(self.source,self.backup)
        self.assertFalse(self.backup.exists())

    def test_post_ddl_failure_rolls_back_preserving_backup(self):
        # Force failure during the post-DDL comparison, after all ALTERs.
        with patch('migrate_preprocessing.quote_identifier',side_effect=RuntimeError('Synthetic failure')):
            with self.assertRaises(RuntimeError): migrate_database(self.source,self.backup)
        with closing(sqlite3.connect(self.source)) as db, closing(sqlite3.connect(self.backup)) as previous:
            self.assertEqual(db.execute('PRAGMA table_info(readings)').fetchall(),previous.execute('PRAGMA table_info(readings)').fetchall())
            self.assertEqual(db.execute('SELECT * FROM readings').fetchall(),previous.execute('SELECT * FROM readings').fetchall())
