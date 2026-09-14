import pandas as pd
import numpy as np
from sklearn.linear_model import LinearRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error, r2_score
import pickle
import os

# ─── Load Dataset ─────────────────────────────────────────────────────────────
def load_dataset():
    csv_path = os.path.join(os.path.dirname(__file__), 'dataset.csv')
    df = pd.read_csv(csv_path)
    return df

# ─── Train Model ──────────────────────────────────────────────────────────────
def train_model():
    df = load_dataset()

    # Features (X) and Target (y)
    X = df[['acetone_ppm']].values  # Input: Acetone PPM
    y = df['blood_glucose'].values  # Output: Blood Glucose mg/dL

    # Split data — 80% train, 20% test
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )

    # Train Linear Regression
    model = LinearRegression()
    model.fit(X_train, y_train)

    # Evaluate
    y_pred = model.predict(X_test)
    mse = mean_squared_error(y_test, y_pred)
    r2 = r2_score(y_test, y_pred)

    print(f"✅ Model trained successfully!")
    print(f"   R² Score:  {r2:.4f}  (closer to 1.0 = better)")
    print(f"   MSE:       {mse:.4f}  (lower = better)")
    print(f"   Formula:   glucose = {model.coef_[0]:.2f} × acetone + {model.intercept_:.2f}")

    # Save model to file
    with open('model.pkl', 'wb') as f:
        pickle.dump(model, f)

    print(f"   Model saved to model.pkl")
    return model, r2, mse

# ─── Load Saved Model ─────────────────────────────────────────────────────────
def load_model():
    model_path = os.path.join(os.path.dirname(__file__), 'model.pkl')
    if not os.path.exists(model_path):
        print("No model found. Training new model...")
        model, _, _ = train_model()
        return model
    with open(model_path, 'rb') as f:
        return pickle.load(f)

# ─── Predict Blood Glucose ────────────────────────────────────────────────────
def predict_glucose(acetone_ppm: float) -> dict:
    model = load_model()
    predicted = model.predict([[acetone_ppm]])[0]
    predicted = max(60, min(predicted, 400))  # Clamp to realistic range

    # Classify based on predicted glucose
    if predicted < 100:
        glucose_level = "Normal"
        note = "Fasting blood glucose is within normal range."
    elif predicted < 126:
        glucose_level = "Pre-Diabetic"
        note = "Fasting blood glucose suggests pre-diabetic range."
    else:
        glucose_level = "Diabetic"
        note = "Fasting blood glucose suggests diabetic range."

    return {
        "estimated_glucose_mg_dl": round(predicted, 2),
        "glucose_level": glucose_level,
        "note": note,
        "disclaimer": "This is an estimation only. Not for clinical diagnosis."
    }

# ─── Run this file directly to train ─────────────────────────────────────────
if __name__ == "__main__":
    train_model()