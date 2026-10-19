"""Competing workers on a real temporary SQLite file, never the patient DB."""

import asyncio
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import tempfile
from threading import Barrier
import unittest
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from test_scan_workflow import ScanWorkflowFixture
import models
import schemas
from routes_readings import receive_sensor_data, cancel_scan_session, start_scan
from sensor_auth import SensorActor


class PersistentScanTests(ScanWorkflowFixture, unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory(dir=Path(__file__).parent)
        self.addCleanup(directory.cleanup)
        self.test_database_url = f"sqlite:///{Path(directory.name) / 'synthetic-scans.db'}"
        super().setUp()

    def compete(self, functions):
        barrier = Barrier(len(functions))
        def run(function):
            barrier.wait(timeout=10)
            try: return function()
            except HTTPException as exc: return {"http_status": exc.status_code}
        with ThreadPoolExecutor(max_workers=len(functions)) as workers:
            return list(workers.map(run, functions))

    def acquire(self, packet):
        with self.sessions() as db:
            return asyncio.run(receive_sensor_data(schemas.SensorData(**packet), db, SensorActor(1, True, "simulated-esp32")))

    def test_concurrent_identical_requests_produce_one_record_and_receipt(self):
        packet = self.packet()
        outcomes = self.compete([lambda: self.acquire(packet), lambda: self.acquire(packet)])
        self.assertTrue(any("reading" in result for result in outcomes), outcomes)
        self.assertTrue(all(result.get("http_status", 200) in (200, 503) for result in outcomes), outcomes)
        with self.sessions() as db:
            self.assertEqual(db.query(models.SensorAcquisition).count(), 1)
            self.assertEqual(db.query(models.Reading).count(), 3)
        self.assertTrue(self.submit(packet).json()["duplicate"])

    def test_concurrent_different_ids_cannot_complete_one_scan_twice(self):
        packet = self.packet()
        second = {**packet, "acquisition_id": uuid4().hex}
        outcomes = self.compete([lambda: self.acquire(packet), lambda: self.acquire(second)])
        self.assertEqual(sum("reading" in result for result in outcomes), 1, outcomes)
        self.assertTrue(all(result.get("http_status", 200) in (200, 409, 503) for result in outcomes), outcomes)
        with self.sessions() as db:
            self.assertEqual(db.query(models.SensorAcquisition).count(), 1)
            self.assertEqual(db.query(models.Reading).count(), 3)
        self.assertEqual(self.status(packet["scan_session_id"])["status"], "completed")

    def test_cancellation_race_is_consistent_with_final_state(self):
        packet = self.packet()
        def cancel():
            with self.sessions() as db:
                return cancel_scan_session(packet["scan_session_id"], db, db.get(models.MedicalPersonnel, 1))
        outcomes = self.compete([lambda: self.acquire(packet), cancel])
        state = self.status(packet["scan_session_id"])["status"]
        self.assertIn(state, ("completed", "cancelled"), outcomes)
        for result in outcomes:
            if "status" in result:
                self.assertEqual(result["status"], state)
        with self.sessions() as db:
            self.assertEqual(db.query(models.SensorAcquisition).count(), 1 if state == "completed" else 0)
            self.assertEqual(db.query(models.Reading).count(), 3 if state == "completed" else 2)

    def test_replacement_race_is_consistent_with_final_state(self):
        packet = self.packet()
        def replace():
            with self.sessions() as db:
                return start_scan(schemas.ScanStartRequest(patient_id=1), db, db.get(models.MedicalPersonnel, 1))
        outcomes = self.compete([lambda: self.acquire(packet), replace])
        state = self.status(packet["scan_session_id"])["status"]
        self.assertIn(state, ("completed", "replaced"), outcomes)
        with self.sessions() as db:
            self.assertEqual(db.query(models.SensorAcquisition).count(), 1 if state == "completed" else 0)
            self.assertEqual(db.query(models.Reading).count(), 3 if state == "completed" else 2)

    def test_sessions_and_receipts_survive_reopening_the_database(self):
        packet = self.packet()
        self.engine.dispose()
        self.engine = create_engine(self.test_database_url, connect_args={"check_same_thread": False})
        self.sessions = sessionmaker(bind=self.engine)
        self.assertEqual(self.status(packet["scan_session_id"])["status"], "pending")
        first = self.submit(packet).json()
        self.engine.dispose()
        self.engine = create_engine(self.test_database_url, connect_args={"check_same_thread": False})
        self.sessions = sessionmaker(bind=self.engine)
        self.assertEqual(self.status(packet["scan_session_id"])["status"], "completed")
        self.assertEqual(self.submit(packet).json()["reading"], first["reading"])
