"""Complete hardware-free scan flow with synthetic readings and private keys."""

from datetime import timedelta
import os
import secrets
import unittest
from unittest.mock import AsyncMock, patch
from uuid import UUID, uuid4
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

from test_api_contracts import ApiContractFixture
import models
from listener_session import utc_now, expire_sessions
from routes_readings import socket_manager


class ScanWorkflowFixture(ApiContractFixture):
    def setUp(self):
        super().setUp()
        self.key = secrets.token_urlsafe(48)
        self.environment = patch.dict(os.environ, {
            "BREATHDX_DEVICE_KEY": self.key, "BREATHDX_DEVICE_MEDICAL_ID": "1",
            "BREATHDX_DEVICE_ID": "simulated-esp32", "BREATHDX_TGS_PROFILE_ID": "",
        })
        self.environment.start(); self.addCleanup(self.environment.stop)
        self.device = {"X-Device-Key": self.key}

    def start(self, **overrides):
        response = self.client.post("/readings/scans", headers=self.headers(),
                                    json={"patient_id": 1, **overrides})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def packet(self, session_id=None, **overrides):
        return {"patient_id": 1, "scan_session_id": session_id or self.start()["session_id"],
                "acquisition_id": uuid4().hex, "tgs822_raw_adc": 1200, "tgs2620_raw_adc": 1800,
                "temperature": 28.5, "humidity": 65.0, **overrides}

    def submit(self, packet, headers=None):
        return self.client.post("/readings/sensor", json=packet, headers=self.device if headers is None else headers)

    def status(self, session_id, headers=None):
        response = self.client.get(f"/readings/scans/{session_id}", headers=headers or self.headers())
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()


class ScanWorkflowTests(ScanWorkflowFixture, unittest.TestCase):
    def test_start_monitor_collect_complete_and_rest_consumers(self):
        scan = self.start()
        self.assertEqual(scan["status"], "pending")
        self.assertEqual(scan["device_connection"], "unknown")
        poll = self.client.get("/readings/listener/armed-patient", headers=self.device).json()
        self.assertEqual(poll["session_id"], scan["session_id"])
        self.assertEqual(poll["device_id"], "simulated-esp32")
        heartbeat = self.client.post(f"/readings/scans/{scan['session_id']}/heartbeat", headers=self.device)
        self.assertEqual(heartbeat.json()["status"], "collecting")
        self.assertEqual(heartbeat.json()["device_connection"], "connected")
        packet = self.packet(scan["session_id"], tgs822_baseline_adc=1400, tgs2620_baseline_adc=500)
        result = self.submit(packet)
        self.assertEqual(result.status_code, 200, result.text)
        reading = result.json()["reading"]
        for field in ("patient_id", "scan_session_id", "acquisition_id", "tgs822_raw_adc", "tgs2620_raw_adc", "tgs822_baseline_adc", "tgs2620_baseline_adc", "temperature", "humidity"):
            self.assertEqual(reading[field], packet[field])
        self.assertEqual(reading["medical_personnel_id"], 1)
        self.assertEqual(reading["device_id"], "simulated-esp32")
        self.assertEqual(reading["calibration_status"], "unverified")
        for field in ("acetone_ppm", "predicted_bgl", "diabetes_level"):
            self.assertIsNone(reading[field])
        self.mock_estimate.assert_not_called()
        completed = self.status(scan["session_id"])
        self.assertEqual(completed["status"], "completed")
        self.assertEqual(completed["reading_id"], reading["id"])
        self.assertEqual(completed["acquisition_id"], packet["acquisition_id"])
        self.assertEqual(completed["expires_at"], scan["expires_at"])
        self.assertFalse(self.client.get("/readings/listener/armed-patient", headers=self.device).json()["armed"])
        for path, headers in (("/readings/all", self.headers()), ("/readings/patient/1", self.headers()), ("/readings/my", self.headers(role="patient"))):
            self.assertEqual(self.client.get(path, headers=headers).json()[0], reading)

    def test_identical_retry_is_idempotent_and_broadcasts_only_once(self):
        packet = self.packet()
        with patch.object(socket_manager, "broadcast_reading", new=AsyncMock()) as broadcast:
            first = self.submit(packet)
            replay = self.submit(packet)
            self.assertEqual(first.status_code, 200)
            self.assertEqual(replay.status_code, 200)
            self.assertFalse(first.json()["duplicate"])
            self.assertTrue(replay.json()["duplicate"])
            self.assertEqual(first.json()["reading"], replay.json()["reading"])
            self.assertEqual(broadcast.await_count, 1)
        self.assertEqual(len(self.remaining_ids()), 3)
        self.assertEqual(self.submit({**packet, "tgs2620_raw_adc": 1801}).status_code, 409)
        self.assertEqual(self.submit({**packet, "acquisition_id": uuid4().hex}).status_code, 409)
        hyphenated = {**packet, "acquisition_id": str(UUID(packet["acquisition_id"]))}
        self.assertTrue(self.submit(hyphenated).json()["duplicate"])

    def test_cancel_expire_and_replace_reject_late_new_acquisitions(self):
        for terminal in ("cancelled", "expired", "replaced"):
            with self.subTest(terminal=terminal):
                packet = self.packet()
                session_id = packet["scan_session_id"]
                if terminal == "cancelled":
                    self.client.post(f"/readings/scans/{session_id}/cancel", headers=self.headers())
                elif terminal == "expired":
                    with self.sessions() as db:
                        db.get(models.ScanSession, session_id).expires_at = utc_now() - timedelta(seconds=1)
                        db.commit()
                else:
                    self.start() # Same patient, new ID: old scan must still be rejected.
                self.assertEqual(self.submit(packet).status_code, 409)
                self.assertEqual(self.status(session_id)["status"], terminal)
                self.assertEqual(self.client.post(f"/readings/scans/{session_id}/heartbeat", headers=self.device).status_code, 409)
        self.assertEqual(self.remaining_ids(), [1, 2])

    def test_authorization_patient_device_and_session_bindings(self):
        packet = self.packet()
        session_id = packet["scan_session_id"]
        self.assertEqual(self.submit(packet, {}).status_code, 401)
        self.assertEqual(self.submit(packet, self.headers(role="patient")).status_code, 403)
        self.assertEqual(self.submit(packet, self.headers(provider=2)).status_code, 404)
        self.assertEqual(self.client.get(f"/readings/scans/{session_id}", headers=self.headers(provider=2)).status_code, 404)
        self.assertEqual(self.client.post(f"/readings/scans/{session_id}/cancel", headers=self.headers(provider=2)).status_code, 404)
        self.assertEqual(self.client.post(f"/readings/scans/{session_id}/cancel", headers=self.device).status_code, 401)
        self.assertEqual(self.client.post(f"/readings/scans/{session_id}/heartbeat", headers=self.headers()).status_code, 403)
        self.assertEqual(self.submit(packet, self.headers()).status_code, 409) # Provider cannot impersonate device.
        self.assertEqual(self.submit({**packet, "patient_id": 2}).status_code, 404)
        with patch.dict(os.environ, {"BREATHDX_DEVICE_ID": "another-device"}):
            self.assertEqual(self.submit(packet).status_code, 404)
            self.assertEqual(self.client.get(f"/readings/scans/{session_id}", headers=self.device).status_code, 404)
        self.assertEqual(self.submit({**packet, "device_id": "spoofed"}).status_code, 422)
        self.assertEqual(self.remaining_ids(), [1, 2])

    def test_invalid_and_missing_values_leave_session_active_without_records(self):
        packet = self.packet()
        cases = []
        for field in ("temperature", "humidity", "tgs822_raw_adc", "tgs2620_raw_adc", "acquisition_id", "scan_session_id"):
            missing = dict(packet); missing.pop(field); cases.append(missing)
        cases.extend([{**packet, "tgs822_raw_adc": 0}, {**packet, "tgs2620_raw_adc": 4095},
                      {**packet, "tgs822_baseline_adc": -1}, {**packet, "humidity": 101},
                      {**packet, "temperature": "28"}, {**packet, "acquisition_id": "invalid"},
                      {**packet, "tgs2620_baseline_adc": True}])
        for invalid in cases:
            self.assertEqual(self.submit(invalid).status_code, 422)
        self.assertEqual(self.status(packet["scan_session_id"])["status"], "pending")
        self.assertEqual(self.remaining_ids(), [1, 2])
        with self.sessions() as db: self.assertEqual(db.query(models.SensorAcquisition).count(), 0)

    def test_manual_compatibility_and_explicit_manual_scan_do_not_fake_device(self):
        listener = self.start()
        packet = self.packet(listener["session_id"])
        packet.pop("scan_session_id")
        response = self.submit(packet, self.headers())
        self.assertEqual(response.status_code, 200)
        reading = response.json()["reading"]
        self.assertEqual(reading["device_id"], "manual-provider-1")
        self.assertEqual(self.status(reading["scan_session_id"])["status"], "completed")
        self.assertEqual(self.status(listener["session_id"])["status"], "pending")
        self.assertTrue(self.submit(packet, self.headers()).json()["duplicate"])
        manual = self.start(source="manual")
        self.assertEqual(self.submit(self.packet(manual["session_id"]), self.headers()).status_code, 200)

    def test_disconnection_report_and_heartbeat_never_extend_deadline(self):
        scan = self.start()
        with self.sessions() as db:
            db.get(models.ScanSession, scan["session_id"]).last_device_seen_at = utc_now() - timedelta(seconds=61)
            db.commit()
        self.assertEqual(self.status(scan["session_id"])["device_connection"], "disconnected")
        heartbeat = self.client.post(f"/readings/scans/{scan['session_id']}/heartbeat", headers=self.device).json()
        self.assertEqual(heartbeat["device_connection"], "connected")
        self.assertEqual(heartbeat["expires_at"], scan["expires_at"])
        self.assertEqual(self.remaining_ids(), [1, 2])

    def test_receipt_survives_reading_deletion_and_blocks_recreation(self):
        packet = self.packet()
        result = self.submit(packet).json()
        self.assertEqual(self.client.delete(f"/readings/{result['reading']['id']}", headers=self.headers()).status_code, 200)
        self.assertEqual(self.submit(packet).status_code, 410)
        self.assertEqual(self.client.get(f"/readings/acquisitions/{packet['acquisition_id']}", headers=self.device).status_code, 410)
        with self.sessions() as db:
            self.assertEqual(db.query(models.SensorAcquisition).count(), 1)
            self.assertIsNone(db.get(models.SensorAcquisition, packet["acquisition_id"]).reading_id)
        self.assertEqual(self.remaining_ids(), [1, 2])

    def test_commit_failure_rolls_back_receipt_reading_and_completion(self):
        packet = self.packet()
        with patch.object(Session, "commit", side_effect=SQLAlchemyError("Sensitive query must not be returned")):
            response = self.submit(packet)
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("Sensitive", response.text)
        self.assertEqual(self.status(packet["scan_session_id"])["status"], "pending")
        self.assertEqual(self.remaining_ids(), [1, 2])
        self.assertEqual(self.submit(packet).status_code, 200)

    def test_commit_acknowledgement_loss_is_recoverable_by_same_id(self):
        packet = self.packet()
        original_commit = Session.commit
        def lost_ack(session):
            original_commit(session)
            raise SQLAlchemyError("Synthetic response interruption after persistence")
        with patch.object(Session, "commit", new=lost_ack):
            response = self.submit(packet)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(response.json()["duplicate"])
        recovered = self.client.get(f"/readings/acquisitions/{packet['acquisition_id']}", headers=self.device)
        self.assertEqual(recovered.json()["reading"], response.json()["reading"])
        self.assertEqual(self.status(packet["scan_session_id"])["status"], "completed")
        self.assertEqual(len(self.remaining_ids()), 3)

    def test_completed_scan_remains_completed_after_late_cancel_and_stale_stop(self):
        packet = self.packet(); self.submit(packet)
        cancelled = self.client.post(f"/readings/scans/{packet['scan_session_id']}/cancel", headers=self.headers()).json()
        self.assertEqual(cancelled["status"], "completed")
        newer = self.start()
        self.client.post("/readings/listener/stop", headers=self.headers(), json={"session_id": packet["scan_session_id"]})
        self.assertEqual(self.status(newer["session_id"])["status"], "pending")

    def test_unknown_receipt_and_cross_provider_recovery_are_private(self):
        packet = self.packet(); self.submit(packet)
        path = f"/readings/acquisitions/{packet['acquisition_id']}"
        self.assertEqual(self.client.get(path, headers=self.headers(provider=2)).status_code, 404)
        self.assertEqual(self.client.get(path, headers=self.headers(role="patient")).status_code, 403)
        with patch.dict(os.environ, {"BREATHDX_DEVICE_ID": "another-device"}):
            self.assertEqual(self.client.get(path, headers=self.device).status_code, 404)
        self.assertEqual(self.client.get(f"/readings/acquisitions/{uuid4().hex}", headers=self.device).status_code, 404)

    def test_exact_expiry_boundary_cannot_complete(self):
        packet = self.packet()
        with self.sessions() as db:
            boundary = db.get(models.ScanSession, packet["scan_session_id"]).expires_at
        with patch("listener_session.utc_now", return_value=boundary), patch("routes_readings.utc_now", return_value=boundary):
            self.assertEqual(self.submit(packet).status_code, 409)
        self.assertEqual(self.status(packet["scan_session_id"])["status"], "expired")

    def test_patient_scan_history_cannot_be_orphaned_by_deletion(self):
        with self.sessions() as db:
            db.query(models.Reading).filter_by(patient_id=1).delete(); db.commit()
        scan = self.start()
        self.client.post(f"/readings/scans/{scan['session_id']}/cancel", headers=self.headers())
        self.assertEqual(self.client.delete("/patients/1", headers=self.headers()).status_code, 409)

    def test_storage_error_is_sanitized_instead_of_empty_success(self):
        scan = self.start()
        headers = self.headers()
        with patch.object(Session, "get", side_effect=SQLAlchemyError("Private database diagnostics")):
            response = self.client.get(f"/readings/scans/{scan['session_id']}", headers=headers)
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("Private", response.text)
        self.assertEqual(self.status(scan["session_id"])["status"], "pending")

    def test_expiry_is_rechecked_after_waiting_for_the_write_lock(self):
        scan = self.start()
        with self.sessions() as db:
            model = db.get(models.ScanSession, scan["session_id"])
            boundary = model.expires_at
            with patch("listener_session.utc_now", side_effect=[boundary - timedelta(seconds=1), boundary]):
                expire_sessions(db, 1)
            db.commit()
        self.assertEqual(self.status(scan["session_id"])["status"], "expired")
        self.assertEqual(self.submit(self.packet(scan["session_id"])).status_code, 409)
