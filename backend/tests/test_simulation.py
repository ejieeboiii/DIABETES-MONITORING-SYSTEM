"""Synthetic full workflow: isolated DB, real JWT dependencies, no physical hardware."""
from datetime import timedelta
import json
import unittest
from unittest.mock import AsyncMock, patch
from uuid import uuid4
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from test_scan_workflow import ScanWorkflowFixture
from listener_session import utc_now
from routes_readings import socket_manager
import models


class SimulationFixture(ScanWorkflowFixture):
    def start_simulation(self, **overrides):
        data = {"session_id": uuid4().hex, "patient_id": 1, "stage_seconds": 0.5, **overrides}
        response = self.client.post("/readings/simulations", json=data, headers=self.headers())
        self.assertEqual(response.status_code, 200, response.text)
        return response.json(), data

    def advance(self, scan):
        # Move only the scripted phase clock, never the absolute session deadline.
        with self.sessions() as db:
            db.get(models.SimulationRun, scan["session_id"]).stage_started_at = utc_now() - timedelta(seconds=1)
            db.commit()
        return self.client.post(f'/readings/simulations/{scan["session_id"]}/advance', headers=self.headers())

    def complete(self, scan):
        stages = ["waiting", "detecting", "capturing", "processing", "completed"]
        for stage in stages:
            response = self.advance(scan)
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.json()["stage"], stage)
        return response.json()


class SimulationTests(SimulationFixture, unittest.TestCase):
    def test_complete_once_visible_to_web_and_patient_with_null_derived_values(self):
        scan, data = self.start_simulation(tgs822={"minimum": 1234, "maximum": 1234})
        self.assertEqual(scan["stage"], "instructions")
        self.assertTrue(scan["is_simulated"])
        with patch.object(socket_manager, "broadcast_reading", new=AsyncMock()) as broadcast:
            completed = self.complete(scan)
            for _ in range(3):
                self.assertEqual(self.advance(scan).json()["reading"], completed["reading"])
            self.assertEqual(broadcast.await_count, 1)
        reading = completed["reading"]
        self.assertTrue(reading["is_simulated"])
        self.assertEqual(reading["tgs822_raw_adc"], 1234)
        self.assertIsNotNone(reading["tgs822_baseline_adc"])
        for field in ("acetone_ppm", "diabetes_level", "predicted_bgl", "calibration_profile_id"):
            self.assertIsNone(reading[field])
        self.assertIn("SIMULATED", reading["suggestion"])
        self.assertEqual(reading["scan_session_id"], scan["session_id"])
        self.assertEqual(reading["device_id"], "simulator-provider-1")
        self.assertEqual(reading["medical_personnel_id"], 1)
        self.assertEqual(reading["acquisition_id"], scan["acquisition_id"])
        for path, headers in (("/readings/all", self.headers()), ("/readings/patient/1", self.headers()),
                              ("/readings/my", self.headers(role="patient"))):
            self.assertEqual(self.client.get(path, headers=headers).json()[0], reading)
        self.assertEqual(self.client.get("/readings/my/latest", headers=self.headers(role="patient")).json(), reading)
        self.assertEqual(len(self.remaining_ids()), 3)
        # Repeating an acknowledged or interrupted start does not replace/create a session.
        replay = self.client.post("/readings/simulations", json=data, headers=self.headers()).json()
        self.assertEqual(replay["stage"], "completed")
        self.assertEqual(replay["reading"], reading)

    def test_instructions_do_not_auto_advance_and_phase_delay_is_enforced(self):
        scan, _ = self.start_simulation(stage_seconds=10.0)
        path = f'/readings/simulations/{scan["session_id"]}'
        self.assertEqual(self.client.get(path, headers=self.headers()).json()["stage"], "instructions")
        self.assertEqual(self.client.post(path + "/advance", headers=self.headers()).json()["stage"], "waiting")
        self.assertEqual(self.client.post(path + "/advance", headers=self.headers()).json()["stage"], "waiting")
        self.assertEqual(len(self.remaining_ids()), 2)

    def test_zero_baseline_ranges_follow_existing_ingestion_contract(self):
        scan, _ = self.start_simulation(tgs822_baseline={"minimum": 0, "maximum": 0},
                                        tgs2620_baseline={"minimum": 0, "maximum": 0})
        completed = self.complete(scan)
        self.assertEqual(completed["reading"]["tgs822_baseline_adc"], 0)
        self.assertEqual(completed["reading"]["tgs2620_baseline_adc"], 0)
        self.assertIsNone(completed["reading"]["acetone_ppm"])

    def test_cancel_timeout_and_replacement_never_save(self):
        for ending in ("cancelled", "timed_out", "replaced"):
            with self.subTest(ending=ending):
                scan, _ = self.start_simulation()
                self.advance(scan)
                if ending == "cancelled":
                    self.client.post(f'/readings/scans/{scan["session_id"]}/cancel', headers=self.headers())
                elif ending == "timed_out":
                    with self.sessions() as db:
                        db.get(models.ScanSession, scan["session_id"]).expires_at = utc_now() - timedelta(seconds=1)
                        db.commit()
                else:
                    self.start()
                self.assertEqual(self.advance(scan).json()["stage"], ending)
                self.assertEqual(len(self.remaining_ids()), 2)

    def test_authentication_and_ownership_all_operations(self):
        data = {"session_id": uuid4().hex, "patient_id": 1}
        self.assertEqual(self.client.post("/readings/simulations", json=data).status_code, 401)
        self.assertEqual(self.client.post("/readings/simulations", json=data, headers=self.headers(role="patient")).status_code, 403)
        self.assertEqual(self.client.post("/readings/simulations", json=data, headers=self.headers(provider=2)).status_code, 404)
        scan, _ = self.start_simulation()
        for method, path in (("get", ""), ("post", "/advance")):
            url = f'/readings/simulations/{scan["session_id"]}{path}'
            for headers, expected in (({}, 401), (self.headers(provider=2), 404), (self.headers(role="patient"), 403), (self.device, 401)):
                self.assertEqual(getattr(self.client, method)(url, headers=headers).status_code, expected)

    def test_ranges_and_missing_inputs_are_rejected_before_creation(self):
        for values in ({"tgs822": {"minimum": 0, "maximum": 1200}}, {"tgs2620": {"minimum": 1600, "maximum": 1500}},
                       {"humidity": {"minimum": 30, "maximum": 101}}, {"temperature": {"minimum": 20}},
                       {"stage_seconds": "2"}, {"tgs822": {"minimum": True, "maximum": 1200}}, {"is_simulated": False}):
            response = self.client.post("/readings/simulations", headers=self.headers(),
                                        json={"patient_id": 1, "session_id": uuid4().hex, **values})
            self.assertEqual(response.status_code, 422, response.text)
        self.assertEqual(self.client.post("/readings/simulations", headers=self.headers(), json={"patient_id": 1}).status_code, 422)
        with self.sessions() as db:
            self.assertEqual(db.query(models.SimulationRun).count(), 0)

    def test_simulation_cannot_be_ingested_or_armed_by_physical_or_manual_channel(self):
        scan, _ = self.start_simulation()
        with self.sessions() as db:
            payload = json.loads(db.get(models.SimulationRun, scan["session_id"]).payload_json)
        for headers in (self.device, self.headers()):
            self.assertEqual(self.submit(payload, headers).status_code, 409)
        self.assertFalse(self.client.get("/readings/listener/armed-patient", headers=self.device).json()["armed"])
        self.assertEqual(self.client.post(f'/readings/scans/{scan["session_id"]}/heartbeat', headers=self.device).status_code, 404)

    def test_corrupt_or_missing_sample_fails_without_saved_medical_values(self):
        for corrupt in ({"tgs822_raw_adc": 4095}, {"humidity": None}, {"tgs2620_raw_adc": None}):
            scan, _ = self.start_simulation()
            for _ in range(4): self.advance(scan)
            with self.sessions() as db:
                run = db.get(models.SimulationRun, scan["session_id"])
                run.payload_json = json.dumps({**json.loads(run.payload_json), **corrupt})
                db.commit()
            result = self.advance(scan).json()
            self.assertEqual(result["stage"], "failed")
            self.assertIn("No reading was saved", result["error"])
            self.assertEqual(len(self.remaining_ids()), 2)
        self.complete(self.start_simulation()[0])  # failure recovery via a fresh valid test

    def test_interrupted_completion_recovery_uses_same_payload_and_acquisition(self):
        scan, _ = self.start_simulation()
        for _ in range(4): self.advance(scan)
        with self.sessions() as db:
            original = db.get(models.SimulationRun, scan["session_id"]).payload_json
            db.get(models.SimulationRun, scan["session_id"]).stage_started_at = utc_now() - timedelta(seconds=1)
            db.commit()
        original_commit = Session.commit
        def lost_ack(db):
            original_commit(db)
            raise SQLAlchemyError("Synthetic lost acknowledgement")
        with patch.object(Session, "commit", lost_ack):
            self.client.post(f'/readings/simulations/{scan["session_id"]}/advance', headers=self.headers())
        recovered = self.client.get(f'/readings/simulations/{scan["session_id"]}', headers=self.headers()).json()
        self.assertEqual(recovered["stage"], "completed")
        self.assertEqual(self.advance(scan).json()["reading"], recovered["reading"])
        with self.sessions() as db:
            self.assertEqual(db.get(models.SimulationRun, scan["session_id"]).payload_json, original)
            self.assertEqual(db.query(models.Reading).filter_by(is_simulated=True).count(), 1)

    def test_storage_error_leaves_processing_retryable_without_duplicate(self):
        scan, _ = self.start_simulation()
        for _ in range(4): self.advance(scan)
        # Prepare the phase timestamp before patching the failed request commit.
        with self.sessions() as db:
            db.get(models.SimulationRun, scan["session_id"]).stage_started_at = utc_now() - timedelta(seconds=1)
            db.commit()
        with patch.object(Session, "commit", side_effect=SQLAlchemyError("Synthetic storage failure")):
            response = self.client.post(f'/readings/simulations/{scan["session_id"]}/advance', headers=self.headers())
        self.assertEqual(response.status_code, 503)
        with self.sessions() as db:
            self.assertEqual(db.get(models.SimulationRun, scan["session_id"]).stage, "processing")
        self.assertEqual(self.advance(scan).json()["stage"], "completed")
        self.assertEqual(len(self.remaining_ids()), 3)

    def test_completed_reading_deletion_is_not_recreated(self):
        scan, _ = self.start_simulation()
        completed = self.complete(scan)
        self.client.delete(f'/readings/{completed["reading"]["id"]}', headers=self.headers())
        replay = self.advance(scan).json()
        self.assertEqual(replay["stage"], "completed")
        self.assertIsNone(replay["reading"])
        self.assertEqual(len(self.remaining_ids()), 2)
