import hashlib
import json
import unittest
from unittest.mock import patch
from test_scan_workflow import ScanWorkflowFixture
from test_tgs_preprocessing import profile, artifact
import models


class PreprocessingApiTests(ScanWorkflowFixture, unittest.TestCase):
    def test_preprocessing_persisted_with_unavailable_status_and_receipt_replay(self):
        payload=self.packet(tgs822_samples_adc=[1000,1001,4000],tgs2620_samples_adc=[1500,1501,3500])
        first=self.submit(payload)
        self.assertEqual(first.status_code,200,first.text)
        reading=first.json()["reading"]
        self.assertEqual(reading["preprocessing_version"],"tgs-adc-v1")
        self.assertEqual(reading["preprocessing_metadata"]["sensors"]["tgs822"]["filtered_adc"],1001)
        self.assertEqual(reading["tgs822_raw_adc"],1200)
        self.assertEqual(reading["estimation_status"],"unavailable")
        self.assertIsNone(reading["predicted_bgl"])
        with patch("routes_readings.load_profile",side_effect=ValueError("Invalid later config")):
            self.assertEqual(self.submit(payload).json()["reading"],reading)
        self.assertEqual(self.client.get('/readings/my/latest',headers=self.headers(role='patient')).json(),reading)

    def test_missing_environment_or_invalid_bursts_do_not_save_or_complete_session(self):
        payload=self.packet()
        for changes in ({"humidity":None},{"temperature":None},{"tgs822_samples_adc":[1000,0,1000]}):
            self.assertEqual(self.submit({**payload,**changes}).status_code,422)
        self.assertEqual(self.status(payload["scan_session_id"])["status"],"pending")
        self.assertEqual(self.remaining_ids(),[1,2])

    def test_bad_profile_returns_actionable_error_without_storage(self):
        with patch("routes_readings.load_profile",side_effect=ValueError("bad configuration")):
            self.assertEqual(self.submit(self.packet()).status_code,503)
        self.assertEqual(self.remaining_ids(),[1,2])

    def test_enabled_model_stores_version_but_never_fabricates_concentration_or_band(self):
        encoded=json.dumps(artifact()).encode()
        settings={"BREATHDX_TGS_MODEL_ENABLED":"true","BREATHDX_TGS_MODEL_PATH":"unit-test-json",
                  "BREATHDX_TGS_MODEL_SHA256":hashlib.sha256(encoded).hexdigest(),"BREATHDX_TGS_MODEL_VERSION":"unit-test-only",
                  "BREATHDX_TGS_EVALUATION_CRITERIA":json.dumps({"max_mae_mg_dl":2,"max_rmse_mg_dl":2,"min_r2":0})}
        with patch("routes_readings.load_profile",return_value=profile()), \
             patch("tgs_estimation.get_setting",side_effect=lambda name,default="":settings.get(name,default)), \
             patch("tgs_estimation.Path.read_bytes",return_value=encoded):
            result=self.submit(self.packet(tgs822_baseline_adc=700,tgs2620_baseline_adc=800))
        self.assertEqual(result.status_code,200,result.text)
        reading=result.json()["reading"]
        self.assertEqual(reading["model_version"],"unit-test-only")
        self.assertEqual(reading["estimation_status"],"available_experimental")
        self.assertIsNotNone(reading["predicted_bgl"])
        self.assertIsNone(reading["acetone_ppm"])
        self.assertIsNone(reading["diabetes_level"])
        self.assertEqual(reading["calibration_version"],"unit-test-only")

    def test_old_receipt_canonical_payload_still_replays_without_burst_fields(self):
        payload=self.packet()
        first=self.submit(payload).json()
        from schemas import SensorData
        canonical=SensorData(**payload).model_dump(exclude={"scan_session_id","acquisition_id","tgs822_samples_adc","tgs2620_samples_adc"})
        with self.sessions() as db:
            receipt=db.get(models.SensorAcquisition,payload["acquisition_id"])
            receipt.payload_sha256=hashlib.sha256(json.dumps(canonical,sort_keys=True,allow_nan=False,separators=(',',':')).encode()).hexdigest()
            db.commit()
        retry=self.submit(payload)
        self.assertEqual(retry.status_code,200)
        self.assertTrue(retry.json()["duplicate"])
        self.assertEqual(retry.json()["reading"],first["reading"])
