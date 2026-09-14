import joblib
import os
import logging
from typing import Optional, Dict, Any
import numpy as np

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Model file path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "glucose_model.pkl")

# Global model variable
_rf_model = None
_model_loaded = False

def load_rf_model() -> bool:
    """Load the Random Forest model from disk."""
    global _rf_model, _model_loaded
    
    if _model_loaded and _rf_model is not None:
        logger.info("Random Forest model already loaded")
        return True
    
    logger.info(f"Looking for model at: {MODEL_PATH}")
    
    try:
        if not os.path.exists(MODEL_PATH):
            logger.error(f"Model file not found: {MODEL_PATH}")
            return False
        
        _rf_model = joblib.load(MODEL_PATH)
        _model_loaded = True
        logger.info(f"Random Forest model loaded successfully from {MODEL_PATH}")
        logger.info(f"Model type: {type(_rf_model)}")
        return True
    except Exception as e:
        logger.error(f"Failed to load Random Forest model: {e}")
        _rf_model = None
        _model_loaded = False
        return False

def predict_bgl(acetone_ppm: float, temperature: float, humidity: float) -> Optional[Dict[str, Any]]:
    """
    Predict Blood Glucose Level (BGL) using the Random Forest model.
    
    The model expects features: CO, Alcohol, Acetone, Benzene, CO_7, Mics
    Since we only have acetone PPM from MQ-138, we map:
    - Acetone: Use calculated acetone PPM
    - CO, Alcohol, Benzene, CO_7, Mics: Set to 0 (not available from current hardware)
    
    Args:
        acetone_ppm: Acetone concentration in PPM
        temperature: Temperature in Celsius
        humidity: Humidity percentage
        
    Returns:
        Dictionary with predicted BGL and metadata, or None if prediction fails
    """
    global _rf_model, _model_loaded
    
    if not _model_loaded or _rf_model is None:
        logger.error("Random Forest model not loaded")
        return None
    
    try:
        # Feature mapping: only acetone is available from current hardware
        # Set other gas sensor features to 0 since they're not available
        features = {
            'CO': 0.0,
            'Alcohol': 0.0,
            'Acetone': acetone_ppm,
            'Benzene': 0.0,
            'CO_7': 0.0,
            'Mics': 0.0
        }
        
        # Convert to numpy array in the correct order
        feature_order = ['CO', 'Alcohol', 'Acetone', 'Benzene', 'CO_7', 'Mics']
        X = np.array([[features[f] for f in feature_order]])
        
        # Make prediction
        prediction = _rf_model.predict(X)[0]
        
        logger.info(f"BGL prediction: {prediction:.2f} mg/dL (acetone: {acetone_ppm:.2f} PPM)")
        
        return {
            'predicted_bgl': float(prediction),
            'features_used': features,
            'model_type': 'RandomForestRegressor',
            'disclaimer': 'Prediction based on acetone PPM only. Additional gas sensors not available in current hardware.'
        }
    except Exception as e:
        logger.error(f"Failed to make BGL prediction: {e}")
        return None

def get_model_status() -> Dict[str, Any]:
    """Get the current status of the Random Forest model."""
    return {
        'loaded': _model_loaded,
        'model_exists': os.path.exists(MODEL_PATH),
        'model_path': MODEL_PATH,
        'model_type': type(_rf_model).__name__ if _rf_model is not None else None
    }
