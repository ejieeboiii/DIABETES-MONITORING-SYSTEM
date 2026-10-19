import hashlib
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

from estimation_service import estimate_glucose


class EstimationTests(unittest.TestCase):
    def run_prediction(self, mode="linear_single", prediction=123.4, digest=None, columns=None):
        data = b"Synthetic model fixture bytes; never deserialize these."
        settings = {"BREATHDX_GLUCOSE_MODEL": mode, "BREATHDX_GLUCOSE_MODEL_PATH": "synthetic-model",
                    "BREATHDX_GLUCOSE_MODEL_SHA256": digest or hashlib.sha256(data).hexdigest()}
        model = SimpleNamespace(predict=Mock(return_value=[prediction]))
        with patch("estimation_service.get_setting", side_effect=lambda name, default="": settings.get(name, default)), \
                patch("estimation_service.legacy_evaluation_approved", return_value=True), \
                patch("estimation_service.Path.read_bytes", return_value=data), \
                patch("estimation_service.pickle.loads", return_value=model) as deserialize, \
                patch("joblib.load", return_value={"model": model, "feature_columns": columns or ["humidity", "acetone_ppm", "temperature"]}):
            result = estimate_glucose(2.1, 28, 65)
            return result, model, deserialize.call_count

    def test_disabled_does_not_read_artifact(self):
        with patch("estimation_service.get_setting", return_value="disabled"), patch("estimation_service.Path.read_bytes") as read:
            self.assertIsNone(estimate_glucose(2, 25, 50))
            read.assert_not_called()

    def test_single_model_feature_order_and_units(self):
        result, model, _ = self.run_prediction()
        self.assertEqual(result, 123.4)
        model.predict.assert_called_once_with([[2.1]])

    def test_three_feature_bundle_respects_stored_order(self):
        result, model, _ = self.run_prediction(mode="linear_three")
        self.assertEqual(result, 123.4)
        model.predict.assert_called_once_with([[65, 2.1, 28]])

    def test_checksum_mismatch_does_not_deserialize(self):
        result, _, calls = self.run_prediction(digest="0" * 64)
        self.assertIsNone(result)
        self.assertEqual(calls, 0)

    def test_nonfinite_and_nonpositive_predictions_are_unavailable(self):
        for value in [float("nan"), float("inf"), 0, -1]:
            with self.subTest(value=value):
                self.assertIsNone(self.run_prediction(prediction=value)[0])

    def test_incompatible_bundle_is_unavailable(self):
        self.assertIsNone(self.run_prediction(mode="linear_three", columns=["CO", "Alcohol", "Acetone"])[0])
