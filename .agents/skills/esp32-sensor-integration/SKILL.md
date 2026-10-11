---
name: esp32-sensor-integration
description: Inspect or work on BreathDX ESP32 acquisition, MQ-138 and DHT22 readings, hardware payloads, and listener integration while keeping planned TGS822 input separate.
---

# Purpose and When to Use

Use for ESP32 firmware, sensor acquisition, backend upload contracts, Start Listening behavior, or calibration-related changes. Preserve the existing Wi-Fi HTTP communication method unless the user requests a different transport.

# Important Files

- iot-prototype/esp32/esp32_breathdx/esp32_breathdx.ino
- iot-prototype/README.md and MQ138-BREATH-GUIDE.md
- backend/schemas.py: SensorData and listener-related schemas.
- backend/routes_readings.py: sensor upload and medical WebSocket.
- backend/classifier.py: conversion, optional baseline helpers, and monitoring bands.
- backend/listener_session.py: currently unwired in-memory listener helper.
- frontend-web/src/pages/medical/LiveScan.jsx and src/utils/api.js

# Actual Hardware and Initialization

The sketch defines MQ138_PIN as GPIO34, DHT_PIN as GPIO4, and DHT_TYPE as DHT22. It initializes Serial at 115200, starts DHT, and attempts Wi-Fi connection up to 20 times with 500 ms delays. Wi-Fi credentials and a host URL are currently embedded in the sketch; do not copy their values into documentation or logs.

The warmup code executes delay(10000), although messages/comments say five minutes. It prints that R0 is being calculated but does not actually calculate an R0 baseline there.

**Planned:** TGS822 is part of the requested hardware design, but no pin, acquisition routine, payload field, or calibration implementation was found. It must become a separate sensor input if integration is requested; do not reuse raw_sensor_value ambiguously or treat its reading as interchangeable with MQ-138.

# Acquisition and Environmental Data

The loop reconnects Wi-Fi when disconnected. It calls isListenerActive before acquisition. If armed, it reads DHT22 temperature and humidity; if either is NaN, both are replaced with the sketch's existing fallback values of 25 °C and 50% humidity.

MQ-138 acquisition averages 100 analogRead calls, with 10 ms between samples, into one integer rawADC. Local voltage, RS, compensation, and compensated resistance calculations are printed to Serial; those processed values are not uploaded. The loop waits 10 seconds after a completed reading.

DHT22 values are environmental inputs. The backend currently uses them in its conversion compensation; the firmware also calculates compensation for Serial output. Do not represent fallback values as successful environmental measurements.

# Communication and Payload

The sketch builds API_URL + /readings/sensor and sends application/json:

| Field | Source |
| --- | --- |
| patient_id | Fixed PATIENT_ID constant in the sketch |
| raw_sensor_value | Averaged MQ-138 ADC integer |
| temperature | DHT22 temperature or fallback |
| humidity | DHT22 humidity or fallback |

The sketch does not send baseline_adc, TGS822 data, estimated glucose, or a device timestamp. SensorData accepts optional baseline_adc and optional patient_id, but the current route requires patient_id to resolve an existing patient and ignores baseline_adc in conversion.

Upload has a 10-second HTTP timeout and up to three attempts on transport failure, with one-second retry delays. Any positive HTTP status ends the retry loop and is logged as sent; this includes HTTP error statuses. Do not describe that log alone as proof of successful persistence.

# Start Listening: Partial Integration

Firmware polls GET /readings/listener/armed-patient and looks for the literal compact JSON text containing armed=true. The provider web client references GET /readings/listener/ping and POST /readings/listener/start and /stop.

These listener endpoints are **referenced but not implemented** in backend/routes_readings.py or other registered routers. The firmware will therefore not proceed through its normal listener gate with this backend as inspected. It also does not extract a selected patient ID from the listener response; uploads use its fixed PATIENT_ID.

The medical WebSocket /readings/ws/medical is implemented, and web Live Scan contains push handling and three-second polling fallback. Do not confuse this implemented broadcast with a working server-side arming mechanism.

# Calibration and Documentation Discrepancies

The guides describe button/Serial commands, baseline/peak breath detection, and longer warmup periods that are absent from the inspected sketch. classifier.py contains baseline subtraction and breath-signal validation helpers, but the sensor route does not pass baseline_adc or call validation.

Use the sketch and route as evidence of current behavior. Existing conversion constants and band thresholds are prototype code, not evidence of experimentally established calibration. Do not invent constants, formulas, thresholds, or calibration performance. Neither gas sensor directly measures glucose; MQ-138 is not established here as acetone-specific, and TGS822 must not be claimed to directly measure acetone without supporting evidence.

# Workflow and Verification

Trace sketch acquisition → JSON fields → SensorData → receive_sensor_data → stored Reading → WebSocket/client. Check errors and distinguish actual DHT samples from fallbacks. For authorized firmware changes, verify device behavior and server HTTP status separately. Report untested hardware and listener gaps; do not silently fix them during documentation-only work.

