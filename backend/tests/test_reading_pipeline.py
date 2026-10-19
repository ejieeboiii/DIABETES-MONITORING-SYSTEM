"""Authorization, listener, validation and persistence checks on synthetic data."""

import asyncio
from datetime import datetime, timedelta, timezone
import secrets
import unittest
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import ValidationError
from sqlalchemy.exc import SQLAlchemyError

import listener_session
import models
import schemas
from test_reading_deletion import ReadingFixture
from auth import create_access_token
from classifier import classify_diabetes_level, raw_to_ppm
from routes_patients import delete_patient
from routes_readings import (armed_patient, receive_sensor_data, start_listener,
                             stop_listener, socket_manager, delete_reading)
from sensor_auth import SensorActor, get_sensor_actor


class ReadingPipelineTests(ReadingFixture, unittest.TestCase):
    def setUp(self):
        super().setUp()
        self.estimator = patch("routes_readings.estimate_glucose", return_value=None)
        self.estimator.start()

    def tearDown(self):
        self.estimator.stop()
        super().tearDown()

    def submit(self, actor=SensorActor(1), **overrides):
        values = {"patient_id": 1, "raw_sensor_value": 1200,
                  "temperature": 25, "humidity": 50, **overrides}
        with self.sessions() as db:
            return asyncio.run(receive_sensor_data(schemas.SensorData(**values), db, actor))

    def test_manual_entry_ownership_and_nullable_estimate(self):
        response = self.submit()
        self.assertIsNone(response["predicted_bgl"])
        with self.assertRaises(HTTPException) as raised:
            self.submit(patient_id=2)
        self.assertEqual(raised.exception.status_code, 404)
        self.assertEqual(len(self.remaining_ids()), 3)

    def test_anonymous_and_patient_ingestion_rejected(self):
        with self.sessions() as db:
            with self.assertRaises(HTTPException) as raised:
                get_sensor_actor(None, None, db)
            self.assertEqual(raised.exception.status_code, 401)
            token = create_access_token({"user_id": 1, "role": "patient"})
            with self.assertRaises(HTTPException) as raised:
                get_sensor_actor(HTTPAuthorizationCredentials(scheme="Bearer", credentials=token), None, db)
            self.assertEqual(raised.exception.status_code, 403)

    def test_device_key_is_provider_scoped(self):
        key = secrets.token_urlsafe(48)
        def setting(name, default=""):
            return {"BREATHDX_DEVICE_KEY": key, "BREATHDX_DEVICE_MEDICAL_ID": "1"}.get(name, default)
        with self.sessions() as db, patch("sensor_auth.get_setting", side_effect=setting):
            self.assertEqual(get_sensor_actor(None, key, db), SensorActor(1, True, "esp32-default"))
            with self.assertRaises(HTTPException):
                get_sensor_actor(None, "wrong", db)

    def test_device_requires_current_armed_patient(self):
        with self.assertRaises(HTTPException) as raised:
            self.submit(SensorActor(1, True))
        self.assertEqual(raised.exception.status_code, 422)
        with self.sessions() as db:
            scan = listener_session.create_scan(db, 1, 1, sensor_configuration="mq138_legacy")
            session_id = scan.id
            db.commit()
        acquisition_id = secrets.token_hex(16)
        self.submit(SensorActor(1, True), scan_session_id=session_id, acquisition_id=acquisition_id)
        with self.assertRaises(HTTPException) as raised:
            self.submit(SensorActor(1, True), patient_id=2, scan_session_id=session_id, acquisition_id=secrets.token_hex(16))
        self.assertEqual(raised.exception.status_code, 404)

    def test_listener_isolation_ownership_stop_and_expiry(self):
        with self.sessions() as db:
            first, second = db.get(models.MedicalPersonnel, 1), db.get(models.MedicalPersonnel, 2)
            start_listener(schemas.ListenerArmRequest(patient_id=1), db, first)
            start_listener(schemas.ListenerArmRequest(patient_id=2), db, second)
            with self.assertRaises(HTTPException):
                start_listener(schemas.ListenerArmRequest(patient_id=2), db, first)
            stop_listener(first, db=db)
            self.assertFalse(armed_patient(db, SensorActor(1))["armed"])
            self.assertEqual(armed_patient(db, SensorActor(2))["patient_id"], 2)
            scan = db.query(models.ScanSession).filter_by(active_provider_id=2).one()
            scan.expires_at = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(seconds=1)
            db.commit()
            self.assertFalse(armed_patient(db, SensorActor(2))["armed"])

    def test_invalid_packets_are_not_saved(self):
        for field, value in [("raw_sensor_value", 0), ("raw_sensor_value", 4095),
                             ("raw_sensor_value", True), ("humidity", True),
                             ("temperature", "25"), ("patient_id", True),
                             ("temperature", float("nan")), ("humidity", float("inf")),
                             ("humidity", -1), ("humidity", 101), ("temperature", 81),
                             ("baseline_adc", -1)]:
            with self.subTest(field=field, value=value), self.assertRaises(ValidationError):
                self.submit(**{field: value})
        with self.assertRaises(HTTPException) as raised:
            self.submit(baseline_adc=1190)
        self.assertEqual(raised.exception.status_code, 422)
        self.assertEqual(self.remaining_ids(), [1, 2])

    def test_baseline_is_used_and_band_boundaries_preserved(self):
        response = self.submit(baseline_adc=1000)
        self.assertEqual(response["acetone_ppm"], raw_to_ppm(1200, 25, 50, 1000))
        self.assertEqual(classify_diabetes_level(1.7999), "Normal")
        self.assertEqual(classify_diabetes_level(1.8), "Pre-Diabetic")
        self.assertEqual(classify_diabetes_level(3.5), "Diabetic")

    def test_persistence_failure_rolls_back(self):
        data = schemas.SensorData(patient_id=1, raw_sensor_value=1200, temperature=25, humidity=50)
        with self.sessions() as db, patch.object(db, "commit", side_effect=SQLAlchemyError()), \
                patch.object(db, "rollback", wraps=db.rollback) as rollback:
            with self.assertRaises(HTTPException) as raised:
                asyncio.run(receive_sensor_data(data, db, SensorActor(1)))
            self.assertEqual(raised.exception.status_code, 503)
            rollback.assert_called_once()
        self.assertEqual(self.remaining_ids(), [1, 2])

    def test_broadcast_failure_does_not_undo_saved_reading(self):
        with patch.object(socket_manager, "broadcast_reading", new=AsyncMock(side_effect=RuntimeError())):
            self.submit()
        self.assertEqual(len(self.remaining_ids()), 3)

    def test_patient_with_history_cannot_be_deleted(self):
        with self.sessions() as db:
            with self.assertRaises(HTTPException) as raised:
                delete_patient(1, db, db.get(models.MedicalPersonnel, 1))
            self.assertEqual(raised.exception.status_code, 409)
            self.assertIsNotNone(db.get(models.Patient, 1))

    def test_rest_timestamps_are_explicit_utc(self):
        with self.sessions() as db:
            value = schemas.ReadingResponse.model_validate(db.get(models.Reading, 1)).model_dump(mode="json")
            self.assertTrue(value["taken_at"].endswith("+00:00"))

    def test_delete_transaction_failure_preserves_reading(self):
        with self.sessions() as db, patch.object(db, "commit", side_effect=SQLAlchemyError()):
            provider = db.get(models.MedicalPersonnel, 1)
            with self.assertRaises(HTTPException) as raised:
                delete_reading(1, db, provider)
            self.assertEqual(raised.exception.status_code, 503)
        self.assertEqual(self.remaining_ids(), [1, 2])
