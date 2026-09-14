"""
Train Linear Regression: acetone (+ env) -> blood glucose (mg/dL).

Usage (from backend/ml):
  python train_glucose_model.py
  python train_glucose_model.py --csv datasets/training_data.csv
"""

import argparse
import json
from pathlib import Path

import joblib
import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split

ML_DIR = Path(__file__).resolve().parent
DEFAULT_CSV = ML_DIR / "datasets" / "training_data.csv"
MODEL_PATH = ML_DIR / "models" / "glucose_regressor.joblib"
METRICS_PATH = ML_DIR / "models" / "metrics.json"

FEATURE_COLUMNS = ["acetone_ppm", "temperature", "humidity"]
TARGET_COLUMN = "blood_glucose_mg_dl"


def load_dataset(csv_path: Path) -> pd.DataFrame:
    if not csv_path.exists():
        raise FileNotFoundError(
            f"Dataset not found: {csv_path}\n"
            "Copy datasets/sample_template.csv to datasets/training_data.csv "
            "and add paired glucose + acetone rows."
        )
    df = pd.read_csv(csv_path)
    required = [TARGET_COLUMN, *FEATURE_COLUMNS]
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise ValueError(f"CSV missing columns: {missing}")
    df = df.dropna(subset=required)
    if len(df) < 10:
        raise ValueError(f"Need at least 10 rows after dropping NaNs; found {len(df)}.")
    return df


def train(csv_path: Path) -> None:
    df = load_dataset(csv_path)
    X = df[FEATURE_COLUMNS]
    y = df[TARGET_COLUMN]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )

    model = LinearRegression()
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    metrics = {
        "n_samples": int(len(df)),
        "n_train": int(len(X_train)),
        "n_test": int(len(X_test)),
        "r2": round(float(r2_score(y_test, y_pred)), 4),
        "mae_mg_dl": round(float(mean_absolute_error(y_test, y_pred)), 2),
        "rmse_mg_dl": round(float(mean_squared_error(y_test, y_pred) ** 0.5), 2),
        "features": FEATURE_COLUMNS,
        "coefficients": {
            "intercept": round(float(model.intercept_), 4),
            **{
                name: round(float(coef), 4)
                for name, coef in zip(FEATURE_COLUMNS, model.coef_)
            },
        },
    }

    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(
        {"model": model, "feature_columns": FEATURE_COLUMNS},
        MODEL_PATH,
    )
    METRICS_PATH.write_text(json.dumps(metrics, indent=2), encoding="utf-8")

    print("Linear Regression training complete")
    print(f"  Samples: {metrics['n_samples']} (train {metrics['n_train']}, test {metrics['n_test']})")
    print(f"  R²:   {metrics['r2']}")
    print(f"  MAE:  {metrics['mae_mg_dl']} mg/dL")
    print(f"  RMSE: {metrics['rmse_mg_dl']} mg/dL")
    print(f"  Model: {MODEL_PATH}")
    print(f"  Metrics: {METRICS_PATH}")
    print("\nEquation (approximate):")
    c = metrics["coefficients"]
    print(
        f"  glucose ≈ {c['intercept']} "
        f"+ ({c['acetone_ppm']})×acetone_ppm "
        f"+ ({c['temperature']})×temperature "
        f"+ ({c['humidity']})×humidity"
    )


def main():
    parser = argparse.ArgumentParser(description="Train glucose linear regression model")
    parser.add_argument("--csv", type=Path, default=DEFAULT_CSV, help="Training CSV path")
    args = parser.parse_args()
    train(args.csv.resolve())


if __name__ == "__main__":
    main()
