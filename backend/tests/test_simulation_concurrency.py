"""Durable simulation state across competing HTTP workers and engine restarts."""
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from pathlib import Path
from threading import Barrier
import tempfile
import unittest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from test_simulation import SimulationFixture
from listener_session import utc_now
import models


class PersistentSimulationTests(SimulationFixture, unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory(dir=Path(__file__).parent)
        self.addCleanup(directory.cleanup)
        self.test_database_url = f"sqlite:///{Path(directory.name) / 'synthetic-simulation.db'}"
        super().setUp()

    def compete(self, functions):
        barrier = Barrier(len(functions))
        def run(function):
            barrier.wait(timeout=10)
            return function()
        with ThreadPoolExecutor(max_workers=len(functions)) as workers:
            return list(workers.map(run, functions))

    def test_same_start_id_under_concurrent_requests_creates_one_run(self):
        from uuid import uuid4
        data = {"session_id": uuid4().hex, "patient_id": 1}
        headers = self.headers()
        outcomes = self.compete([lambda: self.client.post("/readings/simulations", json=data, headers=headers) for _ in range(3)])
        self.assertTrue(all(item.status_code == 200 for item in outcomes), [item.status_code for item in outcomes])
        self.assertEqual(len({item.json()["acquisition_id"] for item in outcomes}), 1)
        with self.sessions() as db:
            self.assertEqual(db.query(models.SimulationRun).count(), 1)
            self.assertEqual(db.query(models.ScanSession).count(), 1)

    def processing_scan(self):
        scan, _ = self.start_simulation()
        for _ in range(4): self.advance(scan)
        with self.sessions() as db:
            db.get(models.SimulationRun, scan["session_id"]).stage_started_at = utc_now() - timedelta(seconds=1)
            db.commit()
        return scan

    def test_concurrent_completion_creates_exactly_one_saved_synthetic_reading(self):
        scan = self.processing_scan()
        headers = self.headers()
        url = f'/readings/simulations/{scan["session_id"]}/advance'
        outcomes = self.compete([lambda: self.client.post(url, headers=headers) for _ in range(3)])
        self.assertTrue(all(item.status_code == 200 for item in outcomes), [item.text for item in outcomes])
        self.assertEqual(len({item.json()["reading"]["id"] for item in outcomes}), 1)
        with self.sessions() as db:
            self.assertEqual(db.query(models.Reading).filter_by(is_simulated=True).count(), 1)
            self.assertEqual(db.query(models.SensorAcquisition).count(), 1)

    def test_completion_cancel_race_is_consistent(self):
        scan = self.processing_scan()
        headers = self.headers()
        self.compete([
            lambda: self.client.post(f'/readings/simulations/{scan["session_id"]}/advance', headers=headers),
            lambda: self.client.post(f'/readings/scans/{scan["session_id"]}/cancel', headers=headers),
        ])
        final = self.client.get(f'/readings/simulations/{scan["session_id"]}', headers=headers).json()
        self.assertIn(final["stage"], ("completed", "cancelled"))
        with self.sessions() as db:
            self.assertEqual(db.query(models.Reading).filter_by(is_simulated=True).count(), 1 if final["stage"] == "completed" else 0)

    def test_client_and_engine_restart_resume_same_payload_and_identity(self):
        scan, _ = self.start_simulation()
        self.advance(scan)
        with self.sessions() as db:
            payload = db.get(models.SimulationRun, scan["session_id"]).payload_json
        self.engine.dispose()
        self.engine = create_engine(self.test_database_url, connect_args={"check_same_thread": False})
        self.sessions = sessionmaker(bind=self.engine)
        restored = self.client.get(f'/readings/simulations/{scan["session_id"]}', headers=self.headers()).json()
        self.assertEqual(restored["stage"], "waiting")
        self.assertEqual(restored["acquisition_id"], scan["acquisition_id"])
        for _ in range(4): response = self.advance(scan)
        self.assertEqual(response.json()["stage"], "completed")
        with self.sessions() as db:
            self.assertEqual(db.get(models.SimulationRun, scan["session_id"]).payload_json, payload)
