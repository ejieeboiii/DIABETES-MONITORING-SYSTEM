"""Optional blood-glucose estimate from model.pkl (pickle only at import)."""

import os
import pickle
from typing import Optional

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BACKEND_DIR, "model.pkl")

_model = None


def estimate_glucose(acetone_ppm: float) -> Optional[dict]:
    global _model
    if not os.path.isfile(MODEL_PATH):
        return None
    try:
        if _model is None:
            with open(MODEL_PATH, "rb") as f:
                _model = pickle.load(f)
        predicted = float(_model.predict([[acetone_ppm]])[0])
        predicted = max(60.0, min(predicted, 400.0))
        if predicted < 100:
            level = "Normal"
        elif predicted < 126:
            level = "Pre-Diabetic"
        else:
            level = "Diabetic"
        return {
            "estimated_glucose_mg_dl": round(predicted, 2),
            "glucose_level": level,
            "disclaimer": "This is an estimation only. Not for clinical diagnosis.",
        }
    except Exception:
        return None
