"""Create a consistent SQLite backup without overwriting any existing file."""

import argparse
from pathlib import Path
import sqlite3
from contextlib import closing


def backup_database(source: Path, destination: Path) -> None:
    source = source.resolve(strict=True)
    destination = destination.resolve()
    if source == destination:
        raise ValueError("Backup destination must differ from the source.")
    # Exclusive creation rejects accidental replacement of an existing backup.
    with destination.open("xb"):
        pass
    with closing(sqlite3.connect(source.as_uri() + "?mode=ro", uri=True)) as original:
        with closing(sqlite3.connect(destination)) as backup:
            original.backup(backup)
            if backup.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise RuntimeError("Backup integrity check failed; do not use this backup.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=Path(__file__).with_name("diabetes_monitoring.db"))
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    backup_database(args.source, args.output)
    print("Backup created and integrity checked. Keep the file private.")
