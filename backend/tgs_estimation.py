"""Opt-in inference from hash-pinned JSON Linear Regression coefficients.

JSON avoids executable pickle/joblib deserialization. Human approval of the
artifact and evaluation criteria is still required; a checksum is not evidence
of clinical validity or dataset provenance.
"""
import hashlib
import json
import math
import re
from pathlib import Path
from pydantic import BaseModel, Field, model_validator
from typing import Literal
from settings import get_setting
from tgs_preprocessing import FEATURES, VERSION, UNITS


class EvaluationCriteria(BaseModel):
    max_mae_mg_dl: float = Field(gt=0, allow_inf_nan=False)
    max_rmse_mg_dl: float = Field(gt=0, allow_inf_nan=False)
    min_r2: float = Field(le=1, allow_inf_nan=False)
    model_config = {"extra": "forbid", "strict": True}


class RegressionArtifact(BaseModel):
    artifact_format: Literal["breathdx-tgs-linear-v1"]
    model_version: str = Field(min_length=1, max_length=100)
    preprocessing_version: Literal["tgs-adc-v1"]
    calibration_version: str = Field(min_length=1, max_length=100)
    profile_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    feature_order: list[str]
    feature_units: dict[str, str]
    target_unit: Literal["mg/dL"]
    coefficients: list[float] = Field(min_length=6, max_length=6)
    intercept: float
    means: list[float] = Field(min_length=6, max_length=6)
    scales: list[float] = Field(min_length=6, max_length=6)
    training_min: list[float] = Field(min_length=6, max_length=6)
    training_max: list[float] = Field(min_length=6, max_length=6)
    metrics: dict[str, float]
    evaluation: dict
    dataset: dict
    model_config = {"extra": "forbid", "allow_inf_nan": False}

    @model_validator(mode="after")
    def validate_contract(self):
        if self.feature_order != FEATURES or self.feature_units != UNITS:
            raise ValueError("Feature contract mismatch")
        if any(scale <= 0 for scale in self.scales) or any(low > high for low, high in zip(self.training_min, self.training_max)):
            raise ValueError("Invalid scaling/domain")
        if set(self.metrics) != {"mae_mg_dl", "rmse_mg_dl", "r2"} or self.metrics["mae_mg_dl"] < 0 or self.metrics["rmse_mg_dl"] < 0 or self.metrics["r2"] > 1:
            raise ValueError("Invalid evaluation metrics")
        if self.dataset.get("origin") != "physical_experimental" or self.dataset.get("contains_simulated") is not False:
            raise ValueError("Synthetic or unknown dataset provenance")
        for key in ("dataset_version", "evidence_reference", "csv_sha256", "manifest_sha256"):
            if not isinstance(self.dataset.get(key), str) or not self.dataset[key].strip():
                raise ValueError("Missing dataset provenance")
        if any(not re.fullmatch(r"[a-f0-9]{64}", self.dataset[key]) for key in ("csv_sha256", "manifest_sha256")):
            raise ValueError("Invalid dataset digests")
        if self.dataset.get("consent_and_deidentification_reviewed") is not True or self.dataset.get("target_unit") != "mg/dL" or not self.dataset.get("reference_measurement_method"):
            raise ValueError("Missing experimental dataset review/units")
        evaluation = self.evaluation
        if evaluation.get("method") != "participant_group_holdout" or evaluation.get("participant_overlap") is not False:
            raise ValueError("Invalid evaluation split")
        for key in ("n_train", "n_test", "train_participants", "test_participants"):
            value = evaluation.get(key)
            minimum = {"n_train": 8, "n_test": 2, "train_participants": 2, "test_participants": 1}[key]
            if type(value) is not int or value < minimum:
                raise ValueError("Insufficient evaluation records/groups")
        return self


def unavailable(reason: str) -> dict:
    return {"value": None, "status": "unavailable", "reason": reason, "model_version": None}


def estimate_tgs(metadata: dict) -> dict:
    if metadata["is_simulated"]:
        return unavailable("simulated_data")
    if get_setting("BREATHDX_TGS_MODEL_ENABLED", "false").lower() != "true":
        return unavailable("disabled")
    if metadata["profile_sha256"] is None:
        return unavailable("calibration_profile_required")
    if not metadata.get("calibration_evidence_reference"):
        return unavailable("calibration_evidence_required")
    if any(metadata["features"].get(name) is None for name in FEATURES):
        return unavailable("missing_model_features")
    path_setting = get_setting("BREATHDX_TGS_MODEL_PATH")
    digest = get_setting("BREATHDX_TGS_MODEL_SHA256").lower()
    approved_version = get_setting("BREATHDX_TGS_MODEL_VERSION")
    criteria_setting = get_setting("BREATHDX_TGS_EVALUATION_CRITERIA")
    if not path_setting or len(digest) != 64 or not approved_version or not criteria_setting:
        return unavailable("model_configuration_incomplete")
    try:
        path = Path(path_setting)
        if not path.is_absolute():
            path = Path(__file__).parent / path
        data = path.read_bytes()
        if hashlib.sha256(data).hexdigest() != digest:
            return unavailable("artifact_integrity_failed")
        artifact = RegressionArtifact.model_validate_json(data)
        criteria = EvaluationCriteria.model_validate_json(criteria_setting)
        if artifact.model_version != approved_version or artifact.preprocessing_version != metadata.get("preprocessing_version") or metadata.get("feature_order") != FEATURES or metadata.get("units") != UNITS or artifact.calibration_version != metadata["calibration_version"] or artifact.profile_sha256 != metadata["profile_sha256"]:
            return unavailable("model_preprocessing_mismatch")
        metrics = artifact.metrics
        if metrics["mae_mg_dl"] > criteria.max_mae_mg_dl or metrics["rmse_mg_dl"] > criteria.max_rmse_mg_dl or metrics["r2"] < criteria.min_r2:
            return unavailable("evaluation_criteria_not_met")
        row = [metadata["features"][name] for name in FEATURES]
        if any(not math.isfinite(value) or value < low or value > high for value, low, high in zip(row, artifact.training_min, artifact.training_max)):
            return unavailable("outside_training_domain")
        value = artifact.intercept + sum(coef * (feature - mean) / scale for coef, feature, mean, scale in zip(artifact.coefficients, row, artifact.means, artifact.scales))
        if not math.isfinite(value) or value <= 0:
            return unavailable("invalid_model_output")
        if round(value, 1) <= 0:
            return unavailable("invalid_model_output")
        return {"value": round(value, 1), "status": "available_experimental", "reason": "evaluated_model_explicitly_enabled",
                "model_version": artifact.model_version}
    except (OSError, ValueError, TypeError, KeyError):
        return unavailable("artifact_or_configuration_invalid")
