"""Software fixtures only; values and profile attestations are not calibration evidence."""
import copy
import hashlib
import json
import math
import unittest
from unittest.mock import patch
from pydantic import ValidationError
import pandas as pd
from tgs_preprocessing import preprocess, CalibrationProfile, FEATURES, UNITS, profile_digest
from tgs_estimation import RegressionArtifact, estimate_tgs
from ml.train_tgs_regression import evaluation_metrics, DatasetManifest, validate_dataset
from estimation_service import legacy_evaluation_approved


def packet():
    return dict(tgs822_raw_adc=1200, tgs2620_raw_adc=1500, tgs822_baseline_adc=700,
                tgs2620_baseline_adc=800, temperature=25.0, humidity=50.0)


def profile():
    return CalibrationProfile(profile_id="unit-test-only", calibration_version="unit-test-only",
        acquisition_protocol_reference="Unit fixture; no physical protocol validated",
        evidence_reference="UNIT TEST ONLY; no experimental evidence",
        temperature_domain_c=[-40,80], humidity_domain_percent=[0,100],
        tgs822={"sensor_type":"TGS822", "sensor_identifier":"unit-822"},
        tgs2620={"sensor_type":"TGS2620", "sensor_identifier":"unit-2620"})


def artifact():
    # Algebra/loader fixture, never fitted to fabricated clinical observations.
    return dict(artifact_format="breathdx-tgs-linear-v1", model_version="unit-test-only",
        preprocessing_version="tgs-adc-v1", calibration_version="unit-test-only", profile_sha256=profile_digest(profile()),
        feature_order=FEATURES, feature_units=UNITS, target_unit="mg/dL", coefficients=[1.0]*6,
        intercept=1.0, means=[0.0]*6, scales=[1.0]*6, training_min=[-100.0]*6, training_max=[100.0]*6,
        metrics={"mae_mg_dl":1.0,"rmse_mg_dl":1.0,"r2":0.5},
        evaluation={"method":"participant_group_holdout", "participant_overlap":False, "n_train":8,"n_test":2,
                    "train_participants":2,"test_participants":1},
        dataset={"origin":"physical_experimental", "contains_simulated":False,
                 "consent_and_deidentification_reviewed":True, "target_unit":"mg/dL", "reference_measurement_method":"UNIT TEST ONLY",
                 "dataset_version":"unit-fixture-only", "evidence_reference":"UNIT TEST ONLY",
                 "csv_sha256":"0"*64,"manifest_sha256":"0"*64})


class PreprocessingTests(unittest.TestCase):
    def test_median_noise_filter_normalization_and_preserved_input(self):
        data = {**packet(), "tgs822_samples_adc":[1000, 1001, 4000], "tgs2620_samples_adc":[1400, 1500, 1600]}
        original = copy.deepcopy(data)
        result = preprocess(data)
        self.assertEqual(data, original)
        self.assertEqual(result["sensors"]["tgs822"]["filtered_adc"],1001)
        self.assertAlmostEqual(result["features"]["tgs822_normalized"],1001/4095)
        self.assertEqual(result["sensors"]["tgs822"]["raw_adc"],1200)
        self.assertEqual(result["features"]["temperature_c"],25)
        self.assertEqual(result["features"]["humidity_percent"],50)
        self.assertEqual(result["sensors"]["tgs822"]["baseline_source"],"acquired")

    def test_scalar_no_fake_noise_filter_and_missing_baseline_not_imputed(self):
        data = packet(); data.pop("tgs822_baseline_adc")
        result = preprocess(data)
        self.assertIsNone(result["features"]["tgs822_baseline_normalized"])
        self.assertEqual(result["sensors"]["tgs822"]["filter"],"single_value_no_temporal_filter")
        self.assertFalse(result["sensors"]["tgs822"]["environmental_correction_applied"])

    def test_invalid_counts_bursts_and_missing_environment(self):
        for key, value in [("tgs822_raw_adc",None),("tgs2620_raw_adc",4095),("temperature",None),
                           ("humidity",float("nan")),("temperature",81), ("tgs822_samples_adc",[1000,0,1100]),
                           ("tgs822_samples_adc",[True,1200,1100]),("tgs822_samples_adc",[1200]*513),
                           ("tgs822_samples_adc",[1200,1100])]:
            with self.subTest(key=key,value=value), self.assertRaises(ValidationError): preprocess({**packet(),key:value})
        for field in ("temperature","humidity"):
            data = packet(); data.pop(field)
            with self.assertRaises(ValidationError): preprocess(data)
        from schemas import SensorData
        invalid_instance=SensorData.model_construct(**{**packet(),"tgs822_raw_adc":0})
        with self.assertRaises(ValidationError): preprocess(invalid_instance)

    def test_sensor_identity_profile_hash_baseline_and_environment_domain(self):
        configuration = profile(); configuration.tgs822.baseline_adc=0
        data=packet(); data.pop("tgs822_baseline_adc")
        result=preprocess(data,configuration)
        self.assertEqual(result["features"]["tgs822_baseline_normalized"],0)
        self.assertEqual(result["sensors"]["tgs822"]["baseline_source"],"configured")
        self.assertEqual(result["sensors"]["tgs822"]["sensor_identifier"],"unit-822")
        self.assertEqual(result["profile_sha256"],profile_digest(configuration))
        configuration.temperature_domain_c=(20,24)
        with self.assertRaises(ValueError): preprocess(packet(),configuration)
        swapped=profile().model_dump(); swapped["tgs822"]["sensor_type"]="TGS2620"
        with self.assertRaises(ValidationError): CalibrationProfile.model_validate(swapped)

    def test_environment_correction_requires_evidence_and_is_disabled_for_simulation(self):
        configuration=profile().model_dump()
        correction={"method":"linear_adc_environment", "experimentally_reviewed":True,
                    "evidence_reference":"UNIT TEST ONLY; no actual calibration coefficient",
                    "reference_temperature_c":24.0,"reference_humidity_percent":50.0,
                    "counts_per_celsius":1.0,"counts_per_humidity_percent":0.0}
        configuration["tgs822"]["environmental_correction"]=correction
        validated=CalibrationProfile.model_validate(configuration)
        self.assertEqual(preprocess(packet(),validated)["sensors"]["tgs822"]["corrected_adc"],1199)
        synthetic=preprocess(packet(),validated,simulated=True)
        self.assertEqual(synthetic["sensors"]["tgs822"]["corrected_adc"],1200)
        self.assertIsNone(synthetic["profile_sha256"])
        del correction["evidence_reference"]
        with self.assertRaises(ValidationError): CalibrationProfile.model_validate(configuration)


class TgsEstimationTests(unittest.TestCase):
    def predict(self, bundle=None, metadata=None, **settings):
        encoded=json.dumps(bundle or artifact()).encode()
        configuration={"BREATHDX_TGS_MODEL_ENABLED":"true", "BREATHDX_TGS_MODEL_PATH":"unit-json",
                       "BREATHDX_TGS_MODEL_SHA256":hashlib.sha256(encoded).hexdigest(),
                       "BREATHDX_TGS_MODEL_VERSION":"unit-test-only",
                       "BREATHDX_TGS_EVALUATION_CRITERIA":json.dumps({"max_mae_mg_dl":2,"max_rmse_mg_dl":2,"min_r2":0}), **settings}
        with patch("tgs_estimation.get_setting",side_effect=lambda name,default="":configuration.get(name,default)), \
             patch("tgs_estimation.Path.read_bytes",return_value=encoded) as read:
            return estimate_tgs(metadata or preprocess(packet(),profile())), read.call_count

    def test_disabled_and_simulated_never_load_a_model(self):
        result,calls=self.predict(BREATHDX_TGS_MODEL_ENABLED="false")
        self.assertEqual(result["reason"],"disabled"); self.assertEqual(calls,0)
        result,calls=self.predict(metadata=preprocess(packet(),simulated=True))
        self.assertEqual(result["reason"],"simulated_data"); self.assertEqual(calls,0)

    def test_explicit_json_algebra_feature_order_and_versions(self):
        metadata=preprocess(packet(),profile())
        result,_=self.predict(metadata=metadata)
        self.assertEqual(result["status"],"available_experimental")
        self.assertEqual(result["value"],round(1+sum(metadata["features"].values()),1))
        self.assertEqual(result["model_version"],"unit-test-only")

    def test_integrity_version_criteria_missing_features_and_domain_gates(self):
        self.assertEqual(self.predict(BREATHDX_TGS_MODEL_SHA256="0"*64)[0]["reason"],"artifact_integrity_failed")
        self.assertEqual(self.predict(BREATHDX_TGS_MODEL_VERSION="different")[0]["reason"],"model_preprocessing_mismatch")
        wrong_version=preprocess(packet(),profile()); wrong_version["preprocessing_version"]="different"
        self.assertEqual(self.predict(metadata=wrong_version)[0]["reason"],"model_preprocessing_mismatch")
        self.assertEqual(self.predict(BREATHDX_TGS_EVALUATION_CRITERIA="")[0]["reason"],"model_configuration_incomplete")
        bundle=artifact(); bundle["metrics"]["r2"]=-1
        self.assertEqual(self.predict(bundle=bundle)[0]["reason"],"evaluation_criteria_not_met")
        metadata=preprocess(packet(),profile()); metadata["features"][FEATURES[0]]=200
        self.assertEqual(self.predict(metadata=metadata)[0]["reason"],"outside_training_domain")
        metadata["features"][FEATURES[0]]=None
        self.assertEqual(self.predict(metadata=metadata)[0]["reason"],"missing_model_features")

    def test_artifact_rejects_synthetic_evidence_invalid_scaling_order_and_metrics(self):
        for mutate in (lambda b:b["dataset"].update(contains_simulated=True),
                       lambda b:b["evaluation"].update(participant_overlap=True),
                       lambda b:b.update(feature_order=list(reversed(FEATURES))),
                       lambda b:b.update(scales=[0]*6), lambda b:b["metrics"].update(r2=float("nan"))):
            bundle=artifact(); mutate(bundle)
            self.assertEqual(self.predict(bundle=bundle)[0]["status"],"unavailable")

    def test_missing_file_and_invalid_output_are_unavailable(self):
        with patch("tgs_estimation.Path.read_bytes",side_effect=FileNotFoundError()):
            # Inner helper mocks bytes, so exercise the loader directly.
            with patch("tgs_estimation.get_setting",side_effect=lambda name,default="":{
                "BREATHDX_TGS_MODEL_ENABLED":"true","BREATHDX_TGS_MODEL_PATH":"missing",
                "BREATHDX_TGS_MODEL_SHA256":"0"*64,"BREATHDX_TGS_MODEL_VERSION":"v",
                "BREATHDX_TGS_EVALUATION_CRITERIA":"{}"}.get(name,default)):
                self.assertIsNone(estimate_tgs(preprocess(packet(),profile()))["value"])
        bundle=artifact(); bundle.update(coefficients=[0]*6,intercept=-1)
        self.assertEqual(self.predict(bundle=bundle)[0]["reason"],"invalid_model_output")


class EvaluationReadinessTests(unittest.TestCase):
    def test_metric_calculations_are_mathematical_unit_tests_not_accuracy_evidence(self):
        result=evaluation_metrics([1,2,3],[1,2,4])
        self.assertAlmostEqual(result["mae_mg_dl"],1/3)
        self.assertAlmostEqual(result["rmse_mg_dl"],math.sqrt(1/3))
        self.assertAlmostEqual(result["r2"],0.5)
        for actual,predicted in (([1,1],[1,2]),([1],[1]),([1,2],[1,float("nan")])):
            with self.assertRaises(ValueError): evaluation_metrics(actual,predicted)

    def test_manifest_refuses_simulation_unknown_origins_and_missing_review(self):
        manifest=dict(dataset_version="unit-only",origin="physical_experimental",contains_simulated=False,
                      consent_and_deidentification_reviewed=True,evidence_reference="unit-test-no-data",
                      reference_measurement_method="unit-test-only",target_unit="mg/dL",max_pairing_seconds=1)
        for values in ({"contains_simulated":True},{"origin":"simulation"},{"consent_and_deidentification_reviewed":False},{"target_unit":"mmol/L"}):
            with self.assertRaises(ValidationError): DatasetManifest.model_validate({**manifest,**values})
        with self.assertRaises(ValueError): validate_dataset(pd.DataFrame(),DatasetManifest(**manifest),profile())
        from ml.train_tgs_regression import REQUIRED
        invalid=pd.DataFrame({name:["NOT_A_MEASUREMENT"]*10 for name in REQUIRED})
        invalid["origin"]="physical_experimental"; invalid["is_simulated"]=True
        with self.assertRaisesRegex(ValueError,"Simulated"):
            validate_dataset(invalid,DatasetManifest(**manifest),profile())

    def test_legacy_model_without_evaluation_is_not_approved(self):
        with patch("estimation_service.get_setting",return_value=""):
            self.assertFalse(legacy_evaluation_approved())
