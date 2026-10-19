"""Validate and restore a SQLite backup to a NEW destination; never overwrite data.

Stop the API before switching databases. This command does not switch the active
database. Reconcile paths/backups manually after verifying the restored file.
"""
import argparse
from contextlib import closing
from pathlib import Path
import sqlite3
from backup_database import backup_database


def restore_database(source: Path, destination: Path) -> None:
    source = source.resolve(strict=True)
    with closing(sqlite3.connect(source.as_uri() + '?mode=ro', uri=True)) as db:
        if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise ValueError('Backup integrity validation failed.')
        if db.execute('PRAGMA foreign_key_check').fetchone() is not None:
            raise ValueError('Backup contains broken foreign-key references.')
        if not db.execute("SELECT 1 FROM sqlite_master WHERE type='table' LIMIT 1").fetchone():
            raise ValueError('Backup contains no application tables.')
    backup_database(source, destination)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    restore_database(args.source, args.output)
    print('Restored to a new file. Validate schema/history before switching; original was not replaced.')
