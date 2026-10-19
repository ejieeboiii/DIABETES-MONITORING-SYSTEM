from pathlib import Path
import sqlite3
import tempfile
import unittest
from contextlib import closing

from backup_database import backup_database


class DatabaseBackupTests(unittest.TestCase):
    def test_consistent_backup_and_no_overwrite(self):
        root = Path(__file__).resolve().parent
        with tempfile.TemporaryDirectory(dir=root, prefix="backup-test-") as folder:
            directory = Path(folder).resolve()
            self.assertEqual(directory.parent, root)
            source, destination = directory / "synthetic.db", directory / "backup.db"
            with closing(sqlite3.connect(source)) as db:
                db.execute("CREATE TABLE sample (value TEXT)")
                db.execute("INSERT INTO sample VALUES ('synthetic')")
                db.commit()
            backup_database(source, destination)
            with closing(sqlite3.connect(destination)) as db:
                self.assertEqual(db.execute("SELECT value FROM sample").fetchone()[0], "synthetic")
                self.assertEqual(db.execute("PRAGMA integrity_check").fetchone()[0], "ok")
            with self.assertRaises(FileExistsError):
                backup_database(source, destination)
            with self.assertRaises(ValueError):
                backup_database(source, source)
