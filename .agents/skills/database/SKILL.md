---
name: database
description: Understand or work on BreathDX SQLite persistence, its existing medical personnel, patient, and reading models, and schema compatibility without destructive changes.
---

# Purpose and When to Use

Use for persistence questions, reading/history storage, relationship changes, or API-model compatibility. Inspect both ORM declarations and the actual SQLite schema; do not assume they are identical.

# Technology and Important Files

- backend/database.py: sqlite:///./diabetes_monitoring.db, SQLAlchemy engine with check_same_thread=False, SessionLocal, Base, get_db.
- backend/models.py: MedicalPersonnel, Patient, Reading, DiabetesLevel.
- backend/schemas.py: API representations.
- backend/main.py: calls Base.metadata.create_all at import.
- backend/routes_patients.py and routes_readings.py: database consumers.

The SQLite URL is relative to the process working directory. The existing database is backend/diabetes_monitoring.db; launching from another directory can target a different file.

# Existing Tables and Columns

The inspected SQLite database contains these three application tables:

| Table | Columns |
| --- | --- |
| medical_personnel | id, full_name, email, hashed_password, profession, created_at |
| patients | id, full_name, email, hashed_password, age, gender, contact, is_diabetic, medical_personnel_id, created_at |
| readings | id, patient_id, acetone_ppm, temperature, humidity, diabetes_level, raw_sensor_value, suggestion, taken_at, predicted_bgl |

IDs are integer primary keys. Medical and patient name/email/password are required. Patient age, gender, and medical_personnel_id are required. Reading patient_id, acetone_ppm, temperature, humidity, and diabetes_level are required; raw_sensor_value, suggestion, and predicted_bgl are nullable.

The ORM declares email uniqueness and indexes, but the inspected database CREATE TABLE definitions do not declare email uniqueness. Check actual indexes before claiming enforcement. Application registration/create routes check duplicates, which is distinct from a database uniqueness constraint. Do not repair this difference as part of documentation.

# Relationships and Users

- MedicalPersonnel.patients ↔ Patient.medical_personnel via patients.medical_personnel_id.
- Patient.readings ↔ Reading.patient via readings.patient_id.
- Both foreign keys appear in the inspected database definitions.
- SQLite foreign-key enforcement is not explicitly enabled in database.py; do not infer enforcement merely from declarations.
- No explicit ORM cascade deletion policy is declared. Do not assume deleting a patient safely cascades readings.
- There is no unified users table or separate admin table.
- is_diabetic is a nullable string, not a Boolean clinical diagnosis field.

# Readings, Timestamps, and History

raw_sensor_value is the single current gas ADC field. acetone_ppm stores the prototype conversion output; temperature and humidity store the environment fields supplied by the API. There is no separate TGS822 column, baseline_adc column, device ID, reference-glucose column, or stored feature vector.

predicted_bgl exists in both ORM and the inspected physical database. It is nullable and is not populated by the current sensor route. Do not invent estimated_glucose_mg_dl as a stored column or treat nullable predictions as confirmed measurements.

ORM created_at/taken_at defaults use datetime.utcnow; the resulting timestamps are naive UTC values, not timezone-aware database fields. The current sketch does not send measurement time, so new readings use the backend's default timestamp. History routes order taken_at descending. Latest-reading queries take the first result after sorting.

diabetes_level uses the Normal / Pre-Diabetic / Diabetic enum in ORM; physical SQLite stores a VARCHAR field. Frontends present these as monitoring bands. Trends and alerts are computed from readings in frontend utilities; no trend or alert table was found.

# Development Rules and Do Not

Do not delete, replace, reset, seed, migrate, or modify the tracked database during inspection or documentation. Preserve existing local database changes. Avoid importing main.py, because table initialization has side effects.

For an authorized future schema change, inspect the actual schema, existing indexes/data constraints, all API schemas and consumers, and migration/back-up needs first. create_all is not a migration system and will not add a missing column to an existing table. No migration framework was found.

Keep raw sensor data and estimates separate. Never manufacture historical patient data, reference glucose, or sensor calibration. Avoid outputting patient records or password hashes merely to describe structure.

# Verification

Use a read-only SQLite connection and schema metadata rather than patient rows. Compare table/column presence to models.py and schemas.py. For authorized persistence work, use an isolated database to verify ownership, nullability, timestamp order, and deletion behavior. Do not change the current schema as part of skill creation.

