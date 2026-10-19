"""Dual TGS HTTP/storage/WS checks; synthetic data, no hardware or real models."""

import os
import secrets
import unittest
from unittest.mock import patch

from test_api_contracts import ApiContractFixture


class TGSContractTests(ApiContractFixture, unittest.TestCase):
    def packet(self, patient=1):
        return {"patient_id": patient, "sensor_configuration": "tgs822_tgs2620",
                "tgs822_raw_adc": 1200, "tgs2620_raw_adc": 1800,
                "temperature": 28.5, "humidity": 65.0}

    def submit(self, packet=None, headers=None):
        return self.client.post("/readings/sensor", json=packet or self.packet(),
                                headers=headers if headers is not None else self.headers())

    def test_raw_pair_stored_returned_and_patient_history_compatible(self):
        packet = {**self.packet(), "tgs822_baseline_adc": 1400, "tgs2620_baseline_adc": 800}
        # Response direction/breath threshold has not been established for TGS;
        # baseline observations can exceed the current measurement.
        with patch.dict(os.environ, {"BREATHDX_TGS_PROFILE_ID": "bench-setup-v1"}):
            result = self.submit(packet)
        self.assertEqual(result.status_code, 200, result.text)
        reading = result.json()["reading"]
        for field in ("tgs822_raw_adc", "tgs2620_raw_adc", "tgs822_baseline_adc", "tgs2620_baseline_adc", "temperature", "humidity"):
            self.assertEqual(reading[field], packet[field])
        for field in ("acetone_ppm", "diabetes_level", "predicted_bgl", "raw_sensor_value"):
            self.assertIsNone(reading[field])
        self.assertEqual(reading["calibration_status"], "unverified")
        self.assertEqual(reading["calibration_profile_id"], "bench-setup-v1")
        self.mock_estimate.assert_not_called()
        history = self.client.get("/readings/my", headers=self.headers(role="patient")).json()
        self.assertEqual(history[0], reading)
        self.assertEqual(history[1]["sensor_configuration"], "mq138_legacy")
        self.assertEqual(history[1]["acetone_ppm"], 1)
        self.assertEqual(history[1]["calibration_status"], "legacy_unverified")

    def test_missing_mixed_unknown_and_invalid_counts_rejected_without_storage(self):
        cases = []
        for field in ("tgs822_raw_adc", "tgs2620_raw_adc"):
            for value in (None, 0, 4095, -1, 4096, 1200.5, "1200", True):
                cases.append({**self.packet(), field: value})
            missing = self.packet(); missing.pop(field); cases.append(missing)
        cases.extend([{**self.packet(), "raw_sensor_value": 1200},
                      {**self.packet(), "baseline_adc": 500},
                      {**self.packet(), "tgs822_baseline_adc": 4095},
                      {**self.packet(), "sensor_configuration": "mq138_legacy"},
                      {**self.packet(), "sensor_configuration": "unknown"},
                      {**self.packet(), "acetone_ppm": 1.2},
                      {**self.packet(), "temperature": 81},
                      {**self.packet(), "humidity": 101}])
        for packet in cases:
            with self.subTest(packet=packet):
                self.assertEqual(self.submit(packet).status_code, 422)
        self.assertEqual(self.remaining_ids(), [1, 2])

    def test_new_configuration_default_and_adc_boundaries(self):
        packet = self.packet(); packet.pop("sensor_configuration")
        packet.update(tgs822_raw_adc=1, tgs2620_raw_adc=4094, tgs822_baseline_adc=0, tgs2620_baseline_adc=4094)
        response = self.submit(packet)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["reading"]["sensor_configuration"], "tgs822_tgs2620")

    def test_authentication_ownership_and_device_listener_preserved(self):
        self.assertEqual(self.submit(headers={}).status_code, 401)
        self.assertEqual(self.submit(headers=self.headers(role="patient")).status_code, 403)
        self.assertEqual(self.submit(self.packet(2)).status_code, 404)
        key = secrets.token_urlsafe(48)
        with patch.dict(os.environ, {"BREATHDX_DEVICE_KEY": key, "BREATHDX_DEVICE_MEDICAL_ID": "1"}):
            headers = {"X-Device-Key": key}
            self.assertEqual(self.submit(headers=headers).status_code, 422)
            session = self.client.post("/readings/listener/start", json={"patient_id": 1}, headers=self.headers()).json()
            packet = {**self.packet(), "scan_session_id": session["session_id"], "acquisition_id": secrets.token_hex(16)}
            self.assertEqual(self.submit({**packet, "patient_id": 2}, headers=headers).status_code, 404)
            self.assertEqual(self.submit(packet, headers=headers).status_code, 200)

    def test_websocket_broadcast_contains_raw_pair_and_null_derived_values(self):
        token = self.headers()["Authorization"].split(" ", 1)[1]
        with self.client.websocket_connect("/readings/ws/medical") as ws:
            ws.send_json({"type": "authenticate", "token": token, "patient_id": 1})
            self.assertEqual(ws.receive_json()["type"], "connected")
            response = self.submit()
            payload = ws.receive_json()
            self.assertEqual(payload["type"], "reading_created")
            self.assertEqual(payload["reading"], response.json()["reading"])
            self.assertEqual(payload["reading"]["tgs2620_raw_adc"], 1800)
            self.assertIsNone(payload["diabetes_level"])

    def test_invalid_acquisition_profile_is_not_stored(self):
        with patch.dict(os.environ, {"BREATHDX_TGS_PROFILE_ID": "invalid profile"}):
            self.assertEqual(self.submit().status_code, 503)
        self.assertEqual(self.remaining_ids(), [1, 2])
