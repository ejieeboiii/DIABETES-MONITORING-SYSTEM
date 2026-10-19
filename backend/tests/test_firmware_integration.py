"""ESP32 protocol mock against real routes and isolated SQLite, never patient DB.

This is a hardware-free device protocol emulator, not execution of Arduino code.
Actual C++ acquisition checks run as compile-time assertions during firmware build.
"""
from datetime import timedelta
import json
from pathlib import Path
import statistics
import unittest
from uuid import uuid4
from unittest.mock import patch

import models
from listener_session import utc_now
from test_scan_workflow import ScanWorkflowFixture


class MockSensors:
    def __init__(self, primary=None, secondary=None, temperature=25.0, humidity=50.0):
        self.primary = primary if primary is not None else [1200, 1201, 1199]
        self.secondary = secondary if secondary is not None else [1500, 1501, 1499]
        self.temperature, self.humidity = temperature, humidity

    def packet(self, scan):
        # These counts exercise schemas, not calibration/detection accuracy.
        return {"patient_id": scan["patient_id"], "scan_session_id": scan["session_id"],
                "acquisition_id": uuid4().hex, "sensor_configuration": "tgs822_tgs2620",
                "tgs822_raw_adc": int(statistics.median(self.primary)),
                "tgs2620_raw_adc": int(statistics.median(self.secondary)),
                "tgs822_baseline_adc": 1000, "tgs2620_baseline_adc": 1300,
                "tgs822_samples_adc": self.primary, "tgs2620_samples_adc": self.secondary,
                "temperature": self.temperature, "humidity": self.humidity}


class DeviceProtocolMock:
    """Recover one journaled acquisition; represents the documented protocol."""
    def __init__(self, fixture, journal):
        self.fixture, self.journal = fixture, journal
        self.uploads = 0

    def recover(self, lose_response=False):
        packet = json.loads(self.journal["pending"])
        receipt = self.fixture.client.get(f"/readings/acquisitions/{packet['acquisition_id']}", headers=self.fixture.device)
        if receipt.status_code in (200, 410):
            del self.journal["pending"]
            return receipt
        if receipt.status_code != 404:
            return receipt
        status = self.fixture.client.get(f"/readings/scans/{packet['scan_session_id']}", headers=self.fixture.device)
        if status.status_code == 404 or (status.status_code == 200 and status.json()["status"] not in ("pending", "collecting")):
            del self.journal["pending"]
            return status
        if status.status_code != 200:
            return status
        self.uploads += 1
        response = self.fixture.submit(packet)
        if not lose_response and response.status_code in (200, 400, 422):
            del self.journal["pending"]
        return None if lose_response else response


class FirmwareIntegrationTests(ScanWorkflowFixture, unittest.TestCase):
    def setUp(self):
        super().setUp()
        self.db = self.sessions()

    def tearDown(self):
        self.db.close()
        super().tearDown()

    def journal(self, scan=None, sensors=None):
        packet = (sensors or MockSensors()).packet(scan or self.start())
        return {"last": packet["scan_session_id"], "pending": json.dumps(packet, separators=(",", ":"))}

    def test_dual_burst_baseline_device_session_contract_and_consumers(self):
        scan = self.start()
        armed = self.client.get('/readings/listener/armed-patient', headers=self.device).json()
        self.assertEqual(armed['session_id'], scan['session_id'])
        self.assertEqual(armed['device_id'], 'simulated-esp32')
        heartbeat = self.client.post(f"/readings/scans/{scan['session_id']}/heartbeat", headers=self.device)
        self.assertEqual(heartbeat.status_code, 200)
        journal = self.journal(scan)
        packet = json.loads(journal['pending'])
        result = DeviceProtocolMock(self, journal).recover()
        self.assertEqual(result.status_code, 200)
        reading = result.json()['reading']
        for field in ('patient_id', 'scan_session_id', 'acquisition_id', 'tgs822_raw_adc', 'tgs2620_raw_adc', 'tgs822_baseline_adc', 'tgs2620_baseline_adc'):
            self.assertEqual(reading[field], packet[field])
        self.assertEqual(reading['device_id'], 'simulated-esp32')
        self.assertFalse(reading['is_simulated'])  # device channel only in isolated test DB
        self.assertEqual(reading['preprocessing_version'], 'tgs-adc-v1')
        for field in ('acetone_ppm', 'diabetes_level', 'predicted_bgl'):
            self.assertIsNone(reading[field])
        patient = self.client.get('/readings/my', headers=self.headers(1, 'patient')).json()
        self.assertEqual(patient[0], reading)
        self.assertNotIn('pending', journal)

    def test_lost_upload_response_then_restart_resolves_receipt_without_second_post(self):
        journal = self.journal()
        before = journal['pending']
        original = DeviceProtocolMock(self, journal)
        self.assertIsNone(original.recover(lose_response=True))
        self.assertEqual(journal['pending'], before)
        restarted = DeviceProtocolMock(self, journal)
        self.assertEqual(restarted.recover().status_code, 200)
        self.assertEqual(restarted.uploads, 0)
        self.assertEqual(self.db.query(models.SensorAcquisition).count(), 1)
        self.assertEqual(self.db.query(models.Reading).filter_by(acquisition_id=json.loads(before)['acquisition_id']).count(), 1)

    def test_unsaved_pending_after_restart_posts_exact_payload_once(self):
        journal = self.journal()
        packet = json.loads(journal['pending'])
        device = DeviceProtocolMock(self, journal)
        self.assertEqual(device.recover().status_code, 200)
        self.assertEqual(device.uploads, 1)
        duplicate = self.submit(packet)
        self.assertTrue(duplicate.json()['duplicate'])
        self.assertEqual(self.db.query(models.SensorAcquisition).count(), 1)

    def test_cancelled_expired_and_replaced_sessions_suppress_pending_upload(self):
        for terminal in ('cancelled', 'expired', 'replaced'):
            with self.subTest(terminal=terminal):
                scan = self.start()
                journal = self.journal(scan)
                if terminal == 'cancelled':
                    self.client.post(f"/readings/scans/{scan['session_id']}/cancel", headers=self.headers())
                elif terminal == 'expired':
                    row = self.db.get(models.ScanSession, scan['session_id'])
                    row.expires_at = utc_now() - timedelta(seconds=1); self.db.commit()
                else:
                    self.start()
                device = DeviceProtocolMock(self, journal)
                response = device.recover()
                self.assertEqual(response.json()['status'], terminal)
                self.assertEqual(device.uploads, 0)
                self.assertNotIn('pending', journal)
        self.assertEqual(self.db.query(models.SensorAcquisition).count(), 0)

    def test_deleted_receipt_cannot_be_recreated_by_restart(self):
        journal = self.journal(); saved = journal['pending']
        result = DeviceProtocolMock(self, journal).recover()
        self.client.delete(f"/readings/{result.json()['reading']['id']}", headers=self.headers())
        journal['pending'] = saved
        device = DeviceProtocolMock(self, journal)
        self.assertEqual(device.recover().status_code, 410)
        self.assertEqual(device.uploads, 0)

    def test_auth_or_backend_failure_preserves_pending_bytes(self):
        journal = self.journal(); before = journal['pending']
        with patch.dict('os.environ', {'BREATHDX_DEVICE_KEY': 'different-private-test-key-' * 3}):
            device = DeviceProtocolMock(self, journal)
            self.assertEqual(device.recover().status_code, 401)
            self.assertEqual(device.uploads, 0)
        self.assertEqual(journal['pending'], before)
        from sqlalchemy.exc import SQLAlchemyError
        with patch('routes_readings.acquisition_receipt', side_effect=SQLAlchemyError('synthetic unavailable')):
            device = DeviceProtocolMock(self, journal)
            self.assertEqual(device.recover().status_code, 503)
            self.assertEqual(device.uploads, 0)
        self.assertEqual(journal['pending'], before)
        self.assertEqual(DeviceProtocolMock(self, journal).recover().status_code, 200)

    def test_invalid_bursts_environment_and_missing_measurements_do_not_save(self):
        for override in ({'tgs822_samples_adc': [1200, 0, 1200]}, {'tgs2620_samples_adc': [1500, 4095, 1500]},
                         {'humidity': 101.0}, {'temperature': None}, {'tgs822_raw_adc': None}):
            packet = MockSensors().packet(self.start()); packet.update(override)
            self.assertEqual(self.submit(packet).status_code, 422)
        self.assertEqual(self.db.query(models.SensorAcquisition).count(), 0)

    def test_device_cannot_claim_other_provider_patient_or_simulation(self):
        packet = MockSensors().packet(self.start()); packet['patient_id'] = 2
        self.assertEqual(self.submit(packet).status_code, 404)
        simulated = self.client.post('/readings/simulations', headers=self.headers(), json={
            'patient_id': 1, 'session_id': uuid4().hex}).json()
        packet = MockSensors().packet({'patient_id': 1, 'session_id': simulated['session_id']})
        self.assertEqual(self.submit(packet).status_code, 409)

    def test_active_firmware_has_no_legacy_fields_or_embedded_secret_assignments(self):
        root = Path(__file__).resolve().parents[2] / 'iot-prototype/esp32/esp32_breathdx'
        source = (root / 'esp32_breathdx.ino').read_text(encoding='utf-8')
        for obsolete in ('MQ138', 'raw_sensor_value', 'acetone_ppm', 'setInsecure(', 'const char* WIFI_PASSWORD'):
            self.assertNotIn(obsolete, source)
        self.assertIn('"X-Device-Key"', source)
        self.assertIn('journal.putString("pending"', source)


if __name__ == '__main__':
    unittest.main()
