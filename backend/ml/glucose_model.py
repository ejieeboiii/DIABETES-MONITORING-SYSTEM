"""
Load trained linear regression model and estimate blood glucose (mg/dL).
"""

from pathlib import Path
from typing import Optional

import joblib

ML_DIR = Path(__file__).resolve().parent
MODEL_PATH = ML_DIR / "models" / "glucose_regressor.joblib"

_bundle = None


def _load_bundle():
    global _bundle
    if _bundle is not None:
        return _bundle
    if not MODEL_PATH.exists():
        return None
    _bundle = joblib.load(MODEL_PATH)
    return _bundle


def model_available() -> bool:
    return MODEL_PATH.exists()


def predict_glucose_mg_dl(
    acetone_ppm: float,
    temperature: float,
    humidity: float,
) -> Optional[float]:
    """
    Returns estimated blood glucose in mg/dL, or None if model not trained yet.
    """
    bundle = _load_bundle()
    if not bundle:
        return None
    model = bundle["model"]
    cols = bundle["feature_columns"]
    row = [[acetone_ppm, temperature, humidity]]
    pred = float(model.predict(row)[0])
    return round(max(40.0, min(600.0, pred)), 1)
