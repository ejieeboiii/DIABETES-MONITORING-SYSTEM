---
name: breathdx-project
description: Understand BreathDX architecture and implementation status before planning or changing features across its mobile app, provider web dashboard, API, database, hardware, and estimation modules.
---

# Purpose

Guide work on **BreathDX – Non-Invasive Diabetes Monitoring System Using Breath Analysis**. Understand the overall architecture before changing an individual component. This is a capstone monitoring prototype, not a replacement for clinically validated blood glucose measurement or professional diagnosis.

# When to Use

Use for architecture questions, cross-component feature planning, integration changes, or establishing which features actually exist. For implementation details, read the applicable sibling skill: esp32-sensor-integration, glucose-estimation, backend-api, database, mobile-app, web-dashboard, or ui-design.

# Architecture and Technology

Paths below are relative to the repository root.

| Layer | Actual implementation |
| --- | --- |
| Provider web | React 19, Vite 8, React Router 7, Axios, Recharts; Tailwind utility CSS |
| Patient mobile | React 19, React Native 0.86, Expo 57, React Navigation 7, Axios, AsyncStorage, lucide-react-native, react-native-svg |
| Backend | FastAPI, Uvicorn, SQLAlchemy, Pydantic; bcrypt passwords and python-jose JWT |
| Database | SQLite via backend/database.py; backend/diabetes_monitoring.db |
| Hardware code | Arduino ESP32 sketch with WiFi, HTTPClient, and DHT library |
| Estimation utilities | scikit-learn LinearRegression, pandas, NumPy, pickle/joblib; a separate Random Forest loader also exists |

Read package manifests and backend requirements for exact versions before selecting tooling. The web manifest includes Tailwind 3 and an additional Tailwind 4 Vite package; PostCSS currently uses tailwindcss and autoprefixer. Do not assume the additional package is the active CSS pipeline.

# Important Directories and Entry Points

- frontend-web/src/App.jsx: provider routes and authenticated layout.
- frontend-mobile/App.js and src/navigation/AppNavigator.js: patient-only runtime navigation.
- backend/main.py: app initialization, CORS, router registration, and table creation.
- backend/routes_auth.py, routes_patients.py, routes_readings.py: implemented APIs.
- backend/models.py and schemas.py: persistence and API contracts.
- backend/classifier.py: ADC conversion and prototype band classification.
- backend/ml_model.py, glucose_inference.py, rf_model_service.py, and ml/: separate model utilities.
- iot-prototype/esp32/esp32_breathdx/esp32_breathdx.ino: current acquisition sketch.
- iot-prototype/README.md and MQ138-BREATH-GUIDE.md: hardware guides with discrepancies from the sketch.
- firmware/: no implementation files found during inspection.
- .agents/skills/: existing skill directory, including breathdx-feature-development; retain existing skills.

# Roles and Main Features

Backend roles are medical and patient; no separate admin role/table was found. Providers register/login on the web, create patients, view patient details, reset patient passwords, view/delete readings, and examine trends. Patient accounts are created by providers. The active mobile app provides login, Dashboard, Results, Trend, and Tips, with user identity and logout in headers.

Medical mobile screens and patient web pages exist as source files but are not wired into their respective active navigators. Do not describe them as currently accessible. Neither active navigator defines a dedicated profile-edit screen.

# Data Flow and Current Status

1. The sketch averages MQ-138 ADC samples and reads DHT22 temperature/humidity.
2. It attempts to poll an armed-listener API, then posts patient_id, raw_sensor_value, temperature, and humidity to /readings/sensor.
3. The implemented sensor route converts ADC through classifier.raw_to_ppm, applying environmental compensation, then generates a monitoring band and suggestion.
4. It saves a Reading in SQLite and broadcasts reading_created over the medical WebSocket.
5. Clients retrieve stored readings; frontend monitoring utilities calculate averages, charts, and trends.

Important gaps:

- Web Start Listening calls and firmware listener polling reference routes absent from the registered backend. backend/listener_session.py exists but is not connected to routes.
- The sensor route imports predict_glucose but does not invoke it or populate predicted_bgl. Model utilities exist; end-to-end glucose estimation is not integrated here.
- Some web views expect estimated_glucose_mg_dl and glucose_level, which ReadingResponse does not supply.
- MQ-138 and DHT22 are implemented in the sketch. TGS822 is planned in the project context; no TGS822 acquisition, separate payload field, or database column was found.

# Development Rules

Read applicable AGENTS.md instructions and the affected code before changes. Trace producer, API schema, persistence, and client consumer together. Preserve unrelated working-tree changes and nested repository contents. Do not infer working features from comments, filenames, UI labels, or imports alone.

Treat MQ-138 and TGS822 as separate inputs. Neither directly measures blood glucose. Do not claim TGS822 specifically measures breath acetone without supporting research and implementation. The acetone_ppm label reflects the current conversion output, not proof of a clinically calibrated acetone analyzer.

Do not invent calibration, clinical thresholds, model performance, datasets, endpoints, tables, or roles. Keep raw ADC, processed PPM, reference glucose, and estimated glucose distinct. Preserve content, navigation, API behavior, and functionality in redesign work unless explicitly requested otherwise.

# Verification

For future feature work, verify affected contracts and actual entry points. Check the API, database skill, hardware skill, and estimation skill for the same integration status. Report unavailable device/model/runtime evidence. For skill documentation alone, do not run the app, training, schema creation, or dependency installation.

