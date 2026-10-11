---
name: glucose-estimation
description: Understand or modify BreathDX processing and glucose-estimation utilities while distinguishing the active ADC classification route from separate Linear Regression and Random Forest model code.
---

# Purpose and When to Use

Use for preprocessing, model integration, training, inference, metrics, or trend interpretation. Inspect actual callers before choosing an estimator; model files, imports, and schema comments alone do not establish an active prediction pipeline.

# Current Processing Pipeline

**Raw Sensor Data → Preprocessed Data → Model Input → Estimated Output**

- Raw acquisition: averaged MQ-138 ADC, DHT22 temperature and humidity, and patient_id from the sketch.
- Active preprocessing: backend/routes_readings.py calls classifier.raw_to_ppm(raw_sensor_value, temperature, humidity). The conversion derives voltage/resistance, applies environmental compensation, and returns a rounded nonnegative PPM value.
- Active output: PPM is threshold-classified into Normal, Pre-Diabetic, or Diabetic, persisted with a suggestion, and broadcast. These are prototype monitoring labels, not diagnoses.
- Model stage: glucose model utilities exist, but receive_sensor_data does not call one or assign predicted_bgl. There is no completed model-input-to-estimated-output stage in this registered upload flow.

classifier.py supports effective_adc and validate_breath_signal with optional baseline_adc. SensorData accepts that field, but the route does not pass it to conversion or invoke breath validation. Do not claim active baseline subtraction. No additional backend filtering, scaling, or normalization stage was found in the route; firmware sample averaging is distinct.

The active conversion has existing thresholds and constants in classifier.py. Describe their source-code behavior without asserting clinically validated calibration. TGS822 input is planned, not present in these feature vectors.

# Important Model Implementations

| File | Actual behavior | Integration status |
| --- | --- | --- |
| backend/ml_model.py | LinearRegression using acetone_ppm to predict blood_glucose from backend/dataset.csv | Imported by readings router; predict_glucose is not called there |
| backend/glucose_inference.py | Optional cached pickle inference from backend/model.pkl using one PPM input; returns None when unavailable/failing | No registered route call found |
| backend/ml/train_glucose_model.py | LinearRegression using acetone_ppm, temperature, humidity to predict blood_glucose_mg_dl | Standalone training utility |
| backend/ml/glucose_model.py | Loads joblib bundle and predicts from three inputs | No registered route integration found |
| backend/rf_model_service.py | Loader/helper labeled Random Forest, using six gas features with only Acetone populated | No registered route integration or matching artifact found |

backend/model.pkl exists, but its provenance, training results, and serialized estimator were not independently verified. Do not deserialize artifacts merely to document them. backend/glucose_model.pkl and backend/ml/models/glucose_regressor.joblib were not found during inspection.

# Training and Feature Preparation

ml_model.py selects one feature column, performs an 80/20 split with random_state=42, reports MSE and R², and writes model.pkl relative to the current working directory. Loading looks beside the module and trains automatically if the artifact is absent. Avoid calling this loader during read-only inspection.

ml/train_glucose_model.py requires acetone_ppm, temperature, humidity, and blood_glucose_mg_dl; it drops rows missing required values and rejects fewer than ten remaining rows. It uses the same split settings and writes a joblib bundle and metrics.json under backend/ml/models. Metrics include sample counts, R², MAE, RMSE, and fitted coefficients. The default training_data.csv was not found; sample_template.csv is a template, not verified collected patient data.

ml/glucose_model.py reads stored feature_columns but constructs its row in the fixed order acetone_ppm, temperature, humidity. Verify feature ordering when changing a bundle. No scaler or normalization is defined in these scripts.

rf_model_service.py expects CO, Alcohol, Acetone, Benzene, CO_7, Mics in that order, filling five unavailable features with zeros. Temperature and humidity arguments are not inserted into that feature vector. This does not implement separate MQ-138/TGS822 acquisition, nor prove useful prediction performance.

# Estimated Outputs and Client Contract

The one-feature utilities clamp estimates to 60–400 mg/dL and classify using their existing 100/126 boundaries. The three-feature helper clamps to 40–600 and rounds to one decimal. These differing code behaviors are not evidence of clinical validity.

The database and ReadingResponse define nullable predicted_bgl. Some web pages expect estimated_glucose_mg_dl and glucose_level instead; those fields are not supplied by the current reading schema. Do not describe glucose displays as a working API-backed feature or silently substitute one field for another.

# Trend Analysis

Both frontend utils/monitoring files calculate acetone trends, not model accuracy or glucose trends. computeTrend compares halves of the latest up to seven readings and uses existing ±0.15 PPM boundaries. This is a reading-count window, not necessarily seven days. computeSevenDayAvg uses a time cutoff, and chart helpers sort historical readings. No trend table or trend API is implemented.

# Development Rules and Verification

Keep ADC, converted PPM, model inputs, estimated mg/dL, and reference glucose separate. Do not invent fitted parameters or achieved metrics. If training is authorized, establish dataset provenance and meaningful held-out evaluation; distinguish software metrics from clinical validation. Do not present sensors as glucose meters or predictions as confirmed diagnoses. Verify the selected estimator's actual route call, feature order, missing-artifact handling, saved field, and UI consumer before claiming end-to-end integration.

