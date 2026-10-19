"""Explicit training on consented, de-identified paired physical observations only.

No default dataset, automatic training, synthetic generator, or model overwrite.
Run from backend: python -m ml.train_tgs_regression --help
"""
import argparse
from datetime import datetime
import hashlib
import json
from pathlib import Path
from uuid import UUID

import numpy as np
import pandas as pd
from pydantic import BaseModel, Field, model_validator
from typing import Literal
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import GroupShuffleSplit
from sklearn.preprocessing import StandardScaler

from tgs_preprocessing import CalibrationProfile, FEATURES, UNITS, VERSION, preprocess, profile_digest
from tgs_estimation import RegressionArtifact

ADC_COLUMNS = ["tgs822_raw_adc", "tgs2620_raw_adc", "tgs822_baseline_adc", "tgs2620_baseline_adc"]
REQUIRED = [*ADC_COLUMNS, "temperature", "humidity", "reference_glucose_mg_dl", "participant_id",
            "acquisition_id", "device_id", "sensor_taken_at", "reference_taken_at", "is_simulated", "origin",
            "tgs822_sensor_identifier", "tgs2620_sensor_identifier", "calibration_version", "profile_sha256", "preprocessing_version"]


class DatasetManifest(BaseModel):
    dataset_version: str = Field(min_length=1, max_length=100)
    origin: Literal["physical_experimental"]
    contains_simulated: Literal[False]
    consent_and_deidentification_reviewed: Literal[True]
    evidence_reference: str = Field(min_length=1, max_length=500)
    reference_measurement_method: str = Field(min_length=1, max_length=500)
    target_unit: Literal["mg/dL"]
    max_pairing_seconds: float = Field(gt=0, allow_inf_nan=False)
    model_config = {"extra": "forbid", "str_strip_whitespace": True}


def evaluation_metrics(actual, predicted) -> dict:
    actual, predicted = np.asarray(actual, dtype=float), np.asarray(predicted, dtype=float)
    if actual.ndim != 1 or predicted.shape != actual.shape or len(actual) < 2 or not np.isfinite(actual).all() or not np.isfinite(predicted).all() or np.var(actual) == 0:
        raise ValueError("Evaluation requires matching finite observations with target variation.")
    return {"mae_mg_dl": float(mean_absolute_error(actual, predicted)),
            "rmse_mg_dl": float(mean_squared_error(actual, predicted) ** 0.5),
            "r2": float(r2_score(actual, predicted))}


def validate_dataset(frame: pd.DataFrame, manifest: DatasetManifest, profile: CalibrationProfile):
    missing = set(REQUIRED) - set(frame.columns)
    if missing or len(frame) < 10:
        raise ValueError("Dataset requires all documented columns and at least ten complete physical observations; this is a software minimum, not scientific sufficiency.")
    if frame[REQUIRED].isna().any().any():
        raise ValueError("Incomplete paired observations; no row dropping or missing-value imputation is permitted.")
    if not frame.origin.eq("physical_experimental").all() or not frame.is_simulated.astype(str).str.lower().eq("false").all():
        raise ValueError("Simulated or unknown-origin rows cannot be used for training/evaluation.")
    if frame.acquisition_id.astype(str).duplicated().any() or frame.participant_id.astype(str).str.strip().eq("").any() or frame.device_id.astype(str).str.strip().eq("").any():
        raise ValueError("Duplicate acquisition or missing de-identified participant/device identifiers.")
    identifiers = [UUID(value).hex for value in frame.acquisition_id.astype(str)]
    if len(set(identifiers)) != len(identifiers) or frame.device_id.astype(str).str.startswith(("simulator-", "manual-provider-")).any():
        raise ValueError("Duplicate or non-physical acquisition identity.")
    for field, expected in (("tgs822_sensor_identifier", profile.tgs822.sensor_identifier),
                            ("tgs2620_sensor_identifier", profile.tgs2620.sensor_identifier),
                            ("calibration_version", profile.calibration_version),
                            ("profile_sha256", profile_digest(profile)), ("preprocessing_version", VERSION)):
        if not frame[field].eq(expected).all():
            raise ValueError("Sensor/profile/preprocessing provenance does not match the reviewed training profile.")
    if frame.participant_id.nunique() < 3:
        raise ValueError("At least three participant groups required for a held-out evaluation.")
    if not profile.evidence_reference:
        raise ValueError("A documented experimental calibration/acquisition profile is required.")
    rows, targets = [], []
    for _, row in frame.iterrows():
        payload = {}
        for name in ADC_COLUMNS:
            value = float(row[name])
            if not np.isfinite(value) or not value.is_integer():
                raise ValueError("ADC counts must be finite integers.")
            payload[name] = int(value)
        payload.update(temperature=float(row.temperature), humidity=float(row.humidity))
        result = preprocess(payload, profile)
        for name in ("sensor_taken_at", "reference_taken_at"):
            timestamp = datetime.fromisoformat(str(row[name]).replace("Z", "+00:00"))
            if timestamp.tzinfo is None:
                raise ValueError("Paired timestamps require explicit timezone offsets.")
            payload[name] = timestamp
        if abs((payload["sensor_taken_at"] - payload["reference_taken_at"]).total_seconds()) > manifest.max_pairing_seconds:
            raise ValueError("Reference measurement exceeds the documented pairing interval.")
        target = float(row.reference_glucose_mg_dl)
        if not np.isfinite(target) or target <= 0:
            raise ValueError("Reference glucose must be a finite positive recorded measurement in mg/dL.")
        rows.append([result["features"][feature] for feature in FEATURES])
        targets.append(target)
    return np.asarray(rows), np.asarray(targets), frame.participant_id.astype(str).to_numpy()


def train(csv_path: Path, manifest_path: Path, profile_path: Path, output: Path, model_version: str) -> dict:
    csv_bytes, manifest_bytes = csv_path.read_bytes(), manifest_path.read_bytes()
    manifest = DatasetManifest.model_validate_json(manifest_bytes)
    profile = CalibrationProfile.model_validate_json(profile_path.read_bytes())
    import io
    frame = pd.read_csv(io.BytesIO(csv_bytes), dtype={"participant_id": str, "device_id": str, "acquisition_id": str})
    x, y, groups = validate_dataset(frame, manifest, profile)
    train_indices, test_indices = next(GroupShuffleSplit(n_splits=1, test_size=0.25, random_state=42).split(x, y, groups))
    if len(train_indices) < len(FEATURES) + 2 or len(test_indices) < 2 or set(groups[train_indices]) & set(groups[test_indices]):
        raise ValueError("Insufficient independent training/holdout observations.")
    scaler = StandardScaler().fit(x[train_indices])
    model = LinearRegression().fit(scaler.transform(x[train_indices]), y[train_indices])
    metrics = evaluation_metrics(y[test_indices], model.predict(scaler.transform(x[test_indices])))
    artifact = RegressionArtifact(
        artifact_format="breathdx-tgs-linear-v1", model_version=model_version, preprocessing_version=VERSION,
        calibration_version=profile.calibration_version, profile_sha256=profile_digest(profile),
        feature_order=FEATURES, feature_units=UNITS, target_unit="mg/dL", coefficients=model.coef_.tolist(),
        intercept=float(model.intercept_), means=scaler.mean_.tolist(), scales=scaler.scale_.tolist(),
        training_min=x[train_indices].min(axis=0).tolist(), training_max=x[train_indices].max(axis=0).tolist(), metrics=metrics,
        evaluation={"method": "participant_group_holdout", "participant_overlap": False,
                    "n_train": len(train_indices), "n_test": len(test_indices),
                    "train_participants": len(set(groups[train_indices])), "test_participants": len(set(groups[test_indices])),
                    "random_state": 42, "held_out_group_fraction": 0.25},
        dataset={**manifest.model_dump(), "csv_sha256": hashlib.sha256(csv_bytes).hexdigest(),
                 "manifest_sha256": hashlib.sha256(manifest_bytes).hexdigest()},
    )
    encoded = artifact.model_dump_json(indent=2).encode()
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("xb") as destination:
        destination.write(encoded)
    return {"model_version": model_version, "artifact_sha256": hashlib.sha256(encoded).hexdigest(), "metrics": metrics}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("csv", "manifest", "profile", "output"):
        parser.add_argument("--" + name, required=True, type=Path)
    parser.add_argument("--model-version", required=True)
    args = parser.parse_args()
    print(json.dumps(train(args.csv, args.manifest, args.profile, args.output, args.model_version), indent=2))
