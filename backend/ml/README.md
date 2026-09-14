# Linear Regression: Acetone → Blood Glucose (Capstone ML Module)

This folder supports the objective:

> Apply a Linear Regression algorithm to estimate blood glucose levels from acetone data using collected datasets.

## How it fits BreathDx today

| Current system (`classifier.py`) | ML objective (this folder) |
|----------------------------------|----------------------------|
| MQ138 raw ADC → acetone PPM | Acetone PPM (+ optional features) → **estimated glucose mg/dL** |
| Fixed thresholds → Normal / Pre-Diabetic / Diabetic band | **Continuous** glucose estimate from regression |
| Works without lab data | Needs **paired** breath + blood glucose measurements |

You can keep both: thresholds for quick bands in the app, regression for the capstone “estimate glucose from acetone” requirement.

## What data you must collect

Each row = one breath scan **at the same time** as a reference glucose reading.

| Column | Source | Example |
|--------|--------|---------|
| `blood_glucose_mg_dl` | Glucometer or lab (ground truth) | 142 |
| `acetone_ppm` | Your app after `raw_to_ppm()` | 2.35 |
| `temperature` | DHT22 | 28.5 |
| `humidity` | DHT22 | 62.0 |
| `raw_sensor_value` | MQ138 ADC (optional extra feature) | 1200 |
| `patient_id` | Your system (optional) | 3 |
| `fasting` | 1 = fasting, 0 = not (recommended) | 1 |

**Minimum for a demo:** ~30–50 paired samples (more is better).  
**For a stronger report:** 100+ samples, multiple patients, fasting and non-fasting noted.

Save as CSV: `backend/ml/datasets/training_data.csv` (see `sample_template.csv`).

### Collection protocol (simple)

1. Patient does **finger-prick** glucose (record mg/dL and time).
2. Within **2–5 minutes**, run breath scan (ESP32 or Live Scan).
3. Log one CSV row per pair.
4. Repeat across Normal, Pre-Diabetic, and Diabetic-range patients if possible.

## Steps to run Linear Regression

### 1. Install ML dependencies (once)

```powershell
cd backend
.\venv\Scripts\activate
pip install scikit-learn pandas joblib
```

### 2. Prepare your CSV

Copy `datasets/sample_template.csv` to `datasets/training_data.csv` and fill with real rows.

### 3. Train the model

```powershell
cd backend\ml
python train_glucose_model.py
```

Outputs:

- `models/glucose_regressor.joblib` — trained model
- `models/metrics.json` — R², MAE, RMSE for your report
- Console scatter summary

### 4. Test a prediction

```powershell
python predict_glucose.py --ppm 2.1 --temp 28 --humidity 65
```

### 5. Document for capstone (report outline)

1. **Problem** — Non-invasive glucose monitoring via breath acetone.
2. **Dataset** — N samples, features, how collected, ethics/consent.
3. **Method** — Multiple Linear Regression (sklearn `LinearRegression`):  
   `glucose ≈ β₀ + β₁·acetone_ppm + β₂·temperature + β₃·humidity`
4. **Evaluation** — Train/test split, MAE, RMSE, R², plot predicted vs actual.
5. **Limitation** — Prototype only; not for clinical diagnosis; small N, sensor drift.
6. **Integration** — Optional API field `estimated_glucose_mg_dl` on readings (future).

## Public datasets (if you need extra rows)

Search literature for “breath acetone blood glucose correlation” — many papers publish small tables. You must **cite the source** and match units (mg/dL). Combine with your own ESP32 data for a stronger “collected datasets” story.

## Optional: hook into the API

After training, you can call `predict_glucose_mg_dl()` from `glucose_model.py` inside `routes_readings.py` and store `estimated_glucose` on each `Reading`. Ask to enable this when your CSV is ready.
