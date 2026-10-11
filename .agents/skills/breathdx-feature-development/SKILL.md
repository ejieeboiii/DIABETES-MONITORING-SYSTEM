---
name: breathdx-feature-development
description: Implement or fix BreathDx capstone features across its FastAPI backend, React web app, Expo mobile app, and ESP32 integration. Use for application feature work and integration bugs in this repository.
---

# BreathDx Feature Development

Deliver the requested behavior across the affected parts of the Diabetes Monitoring System. Limit changes to the user's requested scope; a feature does not automatically require changing every client or the firmware.

## Project map

- `backend/`: FastAPI application, SQLAlchemy models, Pydantic schemas, authentication, patient and reading routes, listener sessions, and inference services.
- `frontend-web/`: React application built with Vite, with charts provided by Recharts.
- `frontend-mobile/`: React Native application using Expo and React Navigation. Read its `AGENTS.md` before working there, and check installed package versions before selecting framework guidance.
- `iot-prototype/`: ESP32 integration documentation and firmware template. Its README describes uploads to `POST /readings/sensor` and live listener behavior.
- `firmware/`: Inspect for applicable device implementation before making hardware changes; do not assume it duplicates the prototype.
- `backend/ml/`: Glucose regression training, prediction utilities, and dataset guidance. Other inference services also exist directly in `backend/`; trace the active route before choosing a model implementation.

Treat this map as an entry point. Read the current files to establish actual behavior and commands.

## Trace and implement the feature

Read applicable project instructions and inspect existing changes before editing. Preserve unrelated work, including the database and any nested repository changes.

For the requested behavior, trace the relevant UI action through its API request, route, schemas, persistence, and response. Locate both web and mobile consumers when changing a shared API. Check sensor producers and listener consumers when changing sensor ingestion.

Keep shared contracts consistent: field names, optional values, patient identifiers, authentication requirements, timestamps, units, and error responses. If compatibility requires updating another component beyond the authorized scope, explain the dependency before expanding the work.

Use existing authentication and patient access checks. Test whether a caller can access the particular patient's records, rather than assuming a valid login authorizes every record. Avoid exposing patient data or credentials in logs or example payloads.

For sensor readings, establish whether a value is raw ADC, acetone PPM, or estimated glucose in mg/dL. Preserve those distinctions in conversion code, storage, API fields, and displayed labels. Inspect existing warmup, invalid-packet handling, listener lifecycle, and polling fallback where relevant. Keep simulated readings distinguishable from device readings.

For ML integration, identify the active model, its expected feature order and units, and behavior when the model or inputs are unavailable. Keep estimated glucose distinct from reference glucose measurements. Do not present prototype classifications or predictions as confirmed diagnoses, fabricate evaluation results, or silently train on sample data as if it were collected patient data.

## Verify the affected behavior

Choose checks from the actual change and current project scripts:

- For web changes, use the applicable build and lint scripts in `frontend-web/package.json` and inspect the affected UI when possible.
- For mobile changes, verify imports, navigation, and the affected screen using the available Expo environment. A successful web build does not verify mobile behavior.
- For backend changes, exercise the affected request and response contract, including relevant authorization, invalid inputs, and persistence behavior. Use isolated test data instead of modifying the tracked patient database.
- For sensor changes, verify packet compatibility and listener behavior. State explicitly when hardware testing was unavailable.
- For model changes, check inference compatibility and use an appropriate held-out evaluation when training is in scope. Distinguish software checks from evidence of clinical accuracy.

Report the resulting behavior, affected components, completed checks, and any material verification limits. Do not claim device or mobile validation unless it was actually performed.
