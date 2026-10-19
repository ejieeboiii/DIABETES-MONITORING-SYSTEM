"""HTTP/WebSocket tests use a private app and synthetic in-memory persistence."""

import secrets
import unittest
from threading import Event
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

import models
import listener_session
from test_reading_deletion import ReadingFixture
from auth import create_user_token, hash_password
from database import get_db
from error_handlers import request_validation_error
from routes_auth import router as auth_router
from routes_patients import router as patients_router
from routes_readings import router as readings_router, socket_manager


class ApiContractFixture(ReadingFixture):
    def setUp(self):
        super().setUp()
        socket_manager.connections.clear()
        app = FastAPI()
        app.include_router(auth_router, prefix="/auth")
        app.include_router(patients_router, prefix="/patients")
        app.include_router(readings_router, prefix="/readings")
        app.add_exception_handler(RequestValidationError, request_validation_error)
        def test_db():
            with self.sessions() as db:
                yield db
        app.dependency_overrides[get_db] = test_db
        self.client = TestClient(app)
        self.client.__enter__()
        self.estimator = patch("routes_readings.estimate_glucose", return_value=None)
        self.mock_estimate = self.estimator.start()

    def tearDown(self):
        self.estimator.stop()
        self.client.__exit__(None, None, None)
        socket_manager.connections.clear()
        super().tearDown()

    def headers(self, provider=1, role="medical"):
        with self.sessions() as db:
            cls = models.Patient if role == "patient" else models.MedicalPersonnel
            token = create_user_token(db.get(cls, provider), role)
        return {"Authorization": f"Bearer {token}"}

    def packet(self, patient=1):
        return {"patient_id": patient, "raw_sensor_value": 1200, "temperature": 25, "humidity": 50}


class ApiContractTests(ApiContractFixture, unittest.TestCase):
    def test_http_ingestion_authentication_and_ownership(self):
        self.assertEqual(self.client.post("/readings/sensor", json=self.packet()).status_code, 401)
        self.assertEqual(self.client.post("/readings/sensor", json=self.packet(), headers=self.headers(role="patient")).status_code, 403)
        self.assertEqual(self.client.post("/readings/sensor", json=self.packet(2), headers=self.headers()).status_code, 404)
        response = self.client.post("/readings/sensor", json=self.packet(), headers=self.headers())
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.json()["predicted_bgl"])
        self.assertTrue(response.json()["reading"]["taken_at"].endswith("+00:00"))
        self.assertEqual(len(self.remaining_ids()), 3)

    def test_http_validation_rejects_nonfinite_without_echoing_input(self):
        response = self.client.post("/readings/sensor", headers=self.headers(),
            content='{"patient_id":1,"raw_sensor_value":1200,"temperature":NaN,"humidity":50}')
        self.assertEqual(response.status_code, 422)
        self.assertNotIn("input", response.json()["detail"][0])
        self.assertEqual(self.remaining_ids(), [1, 2])

    def test_estimate_is_saved_and_returned_consistently(self):
        self.mock_estimate.return_value = 123.4
        response = self.client.post("/readings/sensor", json=self.packet(), headers=self.headers())
        self.assertEqual(response.json()["predicted_bgl"], 123.4)
        self.assertEqual(response.json()["reading"]["predicted_bgl"], 123.4)
        latest = self.client.get("/readings/my/latest", headers=self.headers(role="patient"))
        self.assertEqual(latest.json()["predicted_bgl"], 123.4)

    def test_http_device_listener_flow(self):
        key = secrets.token_urlsafe(48)
        device = {"X-Device-Key": key}
        def setting(name, default=""):
            return {"BREATHDX_DEVICE_KEY": key, "BREATHDX_DEVICE_MEDICAL_ID": "1"}.get(name, default)
        with patch("sensor_auth.get_setting", side_effect=setting):
            self.assertEqual(self.client.get("/readings/listener/armed-patient", headers=device).json()["armed"], False)
            scan = self.client.post("/readings/scans", json={"patient_id": 1, "sensor_configuration": "mq138_legacy"}, headers=self.headers()).json()
            self.assertEqual(self.client.get("/readings/listener/armed-patient", headers=device).json()["patient_id"], 1)
            packet = {**self.packet(), "scan_session_id": scan["session_id"], "acquisition_id": secrets.token_hex(16)}
            self.assertEqual(self.client.post("/readings/sensor", json=packet, headers=device).status_code, 200)
            self.assertEqual(self.client.post("/readings/listener/stop", headers=self.headers()).status_code, 200)
            self.assertEqual(self.client.post("/readings/sensor", json={**packet, "acquisition_id": secrets.token_hex(16)}, headers=device).status_code, 409)

    def test_reading_deletion_is_owned_over_http(self):
        self.assertEqual(self.client.delete("/readings/2", headers=self.headers()).status_code, 404)
        self.assertEqual(self.client.delete("/readings/1", headers=self.headers()).status_code, 200)
        self.assertEqual(self.remaining_ids(), [2])

    def test_patient_update_cannot_change_owner(self):
        body = {"full_name": "Updated synthetic patient", "age": 31, "gender": "Other", "contact": "", "is_diabetic": "Unknown"}
        self.assertEqual(self.client.patch("/patients/2", json=body, headers=self.headers()).status_code, 404)
        self.assertEqual(self.client.patch("/patients/1", json={**body, "medical_personnel_id": 2}, headers=self.headers()).status_code, 422)
        self.assertEqual(self.client.patch("/patients/1", json=body, headers=self.headers()).status_code, 200)

    def test_self_profile_edits_are_restricted_to_profile_fields(self):
        headers = self.headers(role="patient")
        body = {"full_name": "Synthetic profile", "contact": ""}
        self.assertEqual(self.client.patch("/auth/patient/me", json={**body, "medical_personnel_id": 2}, headers=headers).status_code, 422)
        self.assertEqual(self.client.patch("/auth/patient/me", json=body, headers=headers).status_code, 200)

    def test_stale_listener_stop_cannot_cancel_a_new_session(self):
        headers = self.headers()
        first = self.client.post("/readings/listener/start", json={"patient_id": 1}, headers=headers).json()
        second = self.client.post("/readings/listener/start", json={"patient_id": 1}, headers=headers).json()
        self.assertNotEqual(first["session_id"], second["session_id"])
        self.client.post("/readings/listener/stop", json={"session_id": first["session_id"]}, headers=headers)
        session = self.client.get("/readings/listener/armed-patient", headers=headers).json()
        self.assertEqual(session["session_id"], second["session_id"])

    def test_password_change_invalidates_old_session_and_allows_new_login(self):
        password = "Synthetic-Test-Password"
        with self.sessions() as db:
            db.get(models.Patient, 1).hashed_password = hash_password(password)
            db.commit()
        headers = self.headers(role="patient")
        response = self.client.post("/auth/patient/change-password", headers=headers,
            json={"current_password": password, "new_password": "Synthetic-New-Password"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.client.get("/auth/patient/me", headers=headers).status_code, 401)
        self.assertEqual(self.client.post("/auth/patient/login", json={"email": "patient1@example.com", "password": "Synthetic-New-Password"}).status_code, 200)

    def test_websocket_ownership_filter_and_cleanup(self):
        with self.sessions() as db:
            db.add(models.Patient(id=3, full_name="Another synthetic patient", age=30,
                                  gender="Other", email="patient3@example.com",
                                  hashed_password="unused", medical_personnel_id=1))
            db.commit()
        token = self.headers()["Authorization"].split(" ", 1)[1]
        disconnected = Event()
        original_disconnect = socket_manager.disconnect
        def record_disconnect(*args):
            original_disconnect(*args)
            disconnected.set()
        with patch.object(socket_manager, "disconnect", side_effect=record_disconnect):
            with self.client.websocket_connect("/readings/ws/medical") as ws:
                ws.send_json({"type": "authenticate", "token": token, "patient_id": 1})
                self.assertEqual(ws.receive_json()["type"], "connected")
                self.client.post("/readings/sensor", json=self.packet(2), headers=self.headers(2))
                self.client.post("/readings/sensor", json=self.packet(3), headers=self.headers())
                self.client.post("/readings/sensor", json=self.packet(), headers=self.headers())
                event = ws.receive_json()
                self.assertEqual(event["type"], "reading_created")
                self.assertEqual(event["patient_id"], 1)
                self.assertTrue(event["reading"]["taken_at"].endswith("+00:00"))
            self.assertTrue(disconnected.wait(2), "Server must release the closed subscription")
        self.assertEqual(socket_manager.connections, {})
        with self.assertRaises(WebSocketDisconnect):
            with self.client.websocket_connect("/readings/ws/medical") as ws:
                ws.send_json({"type": "authenticate", "token": token, "patient_id": 2})
                ws.receive_json()

    def test_websocket_rejects_invalid_and_patient_credentials(self):
        for token in ["invalid", self.headers(role="patient")["Authorization"].split(" ", 1)[1]]:
            with self.assertRaises(WebSocketDisconnect) as raised:
                with self.client.websocket_connect("/readings/ws/medical") as ws:
                    ws.send_json({"type": "authenticate", "token": token})
                    ws.receive_json()
            self.assertEqual(raised.exception.code, 1008)
        self.assertEqual(socket_manager.connections, {})
