"""Opt-in inference from an explicitly selected and hash-pinned trusted artifact."""

import hashlib
import logging
import math
from pathlib import Path
import pickle

from settings import get_setting

logger = logging.getLogger(__name__)
FEATURES = ["acetone_ppm", "temperature", "humidity"]


def legacy_evaluation_approved() -> bool:
    """Legacy artifacts also require hash-bound evaluation and explicit criteria."""
    import json
    from tgs_estimation import EvaluationCriteria
    path_setting = get_setting("BREATHDX_GLUCOSE_EVALUATION_PATH")
    digest = get_setting("BREATHDX_GLUCOSE_EVALUATION_SHA256").lower()
    version = get_setting("BREATHDX_GLUCOSE_MODEL_VERSION")
    criteria_json = get_setting("BREATHDX_GLUCOSE_EVALUATION_CRITERIA")
    if not path_setting or len(digest) != 64 or not version or not criteria_json:
        return False
    try:
        path = Path(path_setting)
        if not path.is_absolute():
            path = Path(__file__).parent / path
        data = path.read_bytes()
        if hashlib.sha256(data).hexdigest() != digest:
            return False
        evidence = json.loads(data)
        criteria = EvaluationCriteria.model_validate_json(criteria_json)
        metrics = evidence["metrics"]
        return (evidence["model_version"] == version
                and evidence["model_sha256"] == get_setting("BREATHDX_GLUCOSE_MODEL_SHA256").lower()
                and evidence["model_mode"] == get_setting("BREATHDX_GLUCOSE_MODEL")
                and evidence["dataset_origin"] == "physical_experimental"
                and evidence["contains_simulated"] is False and bool(evidence["evidence_reference"])
                and evidence["evaluation_method"] == "participant_group_holdout" and evidence["participant_overlap"] is False
                and all(math.isfinite(metrics[name]) for name in ("mae_mg_dl", "rmse_mg_dl", "r2"))
                and 0 <= metrics["mae_mg_dl"] <= criteria.max_mae_mg_dl
                and 0 <= metrics["rmse_mg_dl"] <= criteria.max_rmse_mg_dl
                and criteria.min_r2 <= metrics["r2"] <= 1)
    except (OSError, ValueError, TypeError, KeyError):
        return False


def estimate_glucose(acetone_ppm: float, temperature: float, humidity: float) -> float | None:
    mode = get_setting("BREATHDX_GLUCOSE_MODEL", "disabled")
    if mode == "disabled":
        return None
    if mode not in {"linear_single", "linear_three"}:
        logger.warning("Glucose estimation unavailable: unsupported model selection.")
        return None
    if not legacy_evaluation_approved():
        return None
    configured_path = get_setting("BREATHDX_GLUCOSE_MODEL_PATH")
    digest = get_setting("BREATHDX_GLUCOSE_MODEL_SHA256")
    if not configured_path or len(digest) != 64:
        return None
    path = Path(configured_path)
    if not path.is_absolute():
        path = Path(__file__).resolve().parent / path
    try:
        # Verify exactly the bytes deserialized, preventing a replacement between checks.
        data = path.read_bytes()
        if hashlib.sha256(data).hexdigest() != digest.lower():
            logger.warning("Glucose estimation unavailable: artifact checksum mismatch.")
            return None
        if mode == "linear_single":
            model = pickle.loads(data)
            row = [[acetone_ppm]]
        else:
            import io
            import joblib
            bundle = joblib.load(io.BytesIO(data))
            columns = bundle["feature_columns"]
            if len(columns) != 3 or set(columns) != set(FEATURES):
                raise ValueError("Unexpected model feature columns")
            model = bundle["model"]
            values = dict(zip(FEATURES, [acetone_ppm, temperature, humidity]))
            row = [[values[column] for column in columns]]
        value = float(model.predict(row)[0])
        if not math.isfinite(value) or value <= 0:
            raise ValueError("Invalid prediction")
        return round(value, 1)
    except Exception:
        # Missing/corrupt models must not prevent saving a valid breath reading.
        logger.warning("Glucose estimation unavailable: artifact or inference failure.")
        return None
