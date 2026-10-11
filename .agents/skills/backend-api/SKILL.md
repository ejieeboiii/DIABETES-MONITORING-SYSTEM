---
name: backend-api
description: Inspect or work on the implemented BreathDX FastAPI routes, authentication, validation, reading ingestion, WebSocket broadcasts, and web/mobile API contracts.
---

# Purpose and When to Use

Use for backend changes, route documentation, client integration, or API debugging. Preserve existing endpoints and behavior unless the user explicitly authorizes changes.

# Architecture and Important Files

backend/main.py creates FastAPI and registers routes_auth, routes_patients, and routes_readings at /auth, /patients, and /readings. It executes Base.metadata.create_all on import and enables CORS for all origins, methods, and headers with credentials enabled. Do not import main merely to inspect routes: initialization can affect the database.

database.py provides per-request SQLAlchemy sessions. models.py defines ORM entities; schemas.py defines Pydantic request/response contracts with ORM attribute parsing. auth.py supplies password hashing, token creation, and role dependencies. route_suggestion.py is empty and is not registered.

# Implemented Endpoints

| Method | Path | Behavior/access |
| --- | --- | --- |
| GET | / | System metadata |
| GET | /health | Health status |
| POST | /auth/medical/register | Provider registration and token |
| POST | /auth/medical/login | Provider login |
| POST | /auth/patient/login | Patient login |
| GET | /auth/medical/me | Current medical user |
| GET | /auth/patient/me | Current patient |
| POST | /patients/ | Medical user creates assigned patient |
| GET | /patients/ | Medical user's assigned patients |
| GET | /patients/{patient_id} | Owned patient |
| POST | /patients/{patient_id}/reset-password | Owned patient's password reset; one-time credentials response |
| DELETE | /patients/{patient_id} | Owned patient deletion |
| GET | /patients/me/profile | Patient's own profile |
| POST | /readings/sensor | Sensor ingestion; no auth dependency in current route |
| GET | /readings/all | Readings belonging to medical user's patients |
| GET | /readings/patient/{patient_id} | Owned patient's history |
| GET | /readings/patient/{patient_id}/latest | Owned patient's latest reading |
| GET | /readings/my | Patient's own history |
| GET | /readings/my/latest | Patient's latest reading |
| DELETE | /readings/{reading_id} | Medical-authenticated deletion; ownership is not checked in current implementation |
| WebSocket | /readings/ws/medical | Medical token query parameter, optional owned patient filter |

FastAPI provides its default documentation routes, including /docs. OAuth2PasswordBearer specifies /auth/login as tokenUrl, but there is no implemented route at that path. Actual login routes are the role-specific paths above.

# Schemas, Validation, and Errors

Registration/login inputs use EmailStr; SensorData accepts integer raw_sensor_value, float temperature/humidity, optional integer patient_id, and optional baseline_adc. Optional patient_id in the schema does not enable listener patient resolution: the route queries that ID directly and returns 404 when no patient matches.

Pydantic provides type validation, but these sensor fields do not declare physical-range constraints. Do not claim comprehensive ADC/environment validation. The reset-password handler enforces at least six characters for the selected reset password. Errors use HTTPException detail, including 400 duplicate email, 401 failed/expired authentication, 403 role rejection, and 404 missing/inaccessible entities. WebSocket rejection uses close code 1008. Do not copy plaintext reset credentials into logs.

# Authentication and Authorization

Passwords use passlib bcrypt; JWT uses HS256 with a 24-hour expiry. The source has a hard-coded prototype secret; document the limitation without copying its value. Role dependencies resolve users from the database. No separate admin role was found.

Most medical patient/read routes check medical_personnel_id. The reading-delete route only checks medical authentication and reading existence; sensor ingestion has no token/device credential dependency. Describe those gaps honestly rather than treating every endpoint as ownership-protected.

# Sensor Handling and Persistence

receive_sensor_data resolves patient, converts ADC using temperature/humidity, obtains band/color/suggestion, commits a Reading, and broadcasts reading_created to the owning medical user. It ignores accepted baseline_adc, does not invoke the imported predict_glucose, and does not populate predicted_bgl. ReadingResponse exposes nullable predicted_bgl, not estimated_glucose_mg_dl or glucose_level.

WebSocket authentication takes token in the query string, optionally verifies patient ownership, supports ping/pong, and filters broadcasts by patient subscription. Connections are process-local in memory.

# Client Communication and Partial Features

Web Axios attaches localStorage token; Vite proxies /auth, /patients, /readings (including WebSocket), and /health to port 8001. Production web API code uses loopback port 8001. Mobile Axios uses EXPO_PUBLIC_API_URL or resolver fallbacks and AsyncStorage token.

The web client references listener/ping, listener/start, and listener/stop; firmware references listener/armed-patient, all beneath /readings. **None are implemented in registered routers.** listener_session.py and related schemas alone do not make them endpoints. No dedicated trend or model-status API was found.

# Workflow and Verification

Read decorators and main's router prefixes together; do not infer endpoints from client helper names. For authorized code changes, verify schemas, caller fields, role/ownership behavior, errors, persistence, and WebSocket payloads. Use isolated test data. For this documentation task, do not run the backend, change routes, install dependencies, or repair identified gaps.

