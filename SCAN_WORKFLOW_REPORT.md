# Step 2 scan workflow report — 2026-10-14

## Initial inspection

Already working: strict TGS822/TGS2620/DHT validation, independent optional gas
baselines, nullable uncalibrated outputs, provider/device authentication, patient
ownership, saved REST history and authenticated WS reading events.

Incomplete: listener state was in memory, had no completed/cancelled/replaced
history and disappeared on restart. Uploads only checked the currently selected
patient, not the polled session or exact device. No durable acquisition ID/receipt
could prevent duplicates or resolve an interrupted request. Monitoring lacked
device-contact freshness and reliable session completion retrieval.

## Changes delivered

- Durable pending/collecting/completed/cancelled/expired/replaced sessions, fixed
  deadlines, guarded cancellation/replacement and device heartbeat/contact status.
- Server-derived provider/device identity and immutable session/patient/source
  binding. One active explicit scan per provider, one acquisition per session.
- UUID acquisition IDs, canonical payload hashes, durable unique receipts, and
  transactional save/completion. Identical replays return the original result;
  changed replays and late/new terminal-session acquisitions are rejected.
- Receipt recovery after ambiguous requests, rollback on failed persistence,
  sanitized storage errors and replay protection after deliberate reading deletion.
- Existing listener adapters/API/REST/WS retained. Active web manual entry keeps a
  retry ID; listener filtering/completion polling uses its exact session. Firmware
  sends session/acquisition IDs and heartbeat. UI design was not changed.
- No TGS calibration/conversion, new glucose predictions, retraining or dependency
  upgrades. Mobile consumers continue to retrieve the same reading responses with
  additive provenance fields and null uncalibrated estimates.
- Local schema upgraded using a verified private backup and additive transaction;
  post-commit comparison confirmed every original provider/patient/reading value
  is unchanged. Historical provenance stays null instead of being invented.

## Modified files for this step

| Area | Files |
| --- | --- |
| Backend persistence/auth | `backend/models.py`, `sensor_auth.py`, `listener_session.py`, `schemas.py` |
| Backend workflow/routes | `backend/routes_readings.py`, `routes_patients.py`, `main.py` |
| Schema/configuration | New `backend/migrate_scan_workflow.py`; `backend/.env.example`; local `backend/diabetes_monitoring.db` additive upgrade and private ignored backup |
| Provider integration | `frontend-web/src/utils/api.js`; new `src/utils/acquisition.js`; `src/hooks/useLiveScan.js`; `src/pages/medical/LiveScan.jsx` (workflow wiring only) |
| Firmware integration | `iot-prototype/esp32/esp32_breathdx/esp32_breathdx.ino` (session ID, acquisition ID, heartbeat, ambiguous-upload guard) |
| Tests | New `backend/tests/test_scan_workflow.py`, `test_scan_concurrency.py`, `test_scan_migration.py`; updated existing fixtures/assertions in `test_api_contracts.py`, `test_reading_deletion.py`, `test_reading_pipeline.py`, `test_tgs_contracts.py` |
| Documentation | New `backend/SCAN_WORKFLOW.md`, this report; pointers in configuration/sensor documentation |

See [SCAN_WORKFLOW.md](backend/SCAN_WORKFLOW.md) for endpoints, payloads, transitions,
retry semantics, configuration and migration/restore procedures.

## Verification and limitations

| Check | Result |
| --- | --- |
| Backend regression and simulated API/WS integration suite | **80 tests passed** |
| Persistent SQLite concurrency/reopening scenarios | **Passed**: identical/different acquisition races, cancellation/replacement races, durable restart recovery |
| Additive migration tests | **Passed**: data/schema preservation, verified backup, rollback after failed DDL, idempotence, partial-schema/backup refusal and uniqueness checks |
| Real local migration and post-commit comparison | **Passed**: original values preserved; integrity, FKs and startup schema checks passed |
| Node monitoring/export/mobile contract checks | **11 tests passed** |
| Web lint and production build | **Passed** |
| Loopback synthetic device and web UI walkthrough | **Passed**: provider login, listener start, matching device heartbeat, dual gas/baseline upload, completion, identical replay returning one original result, unavailable estimates and completed status in the existing UI |
| ESP32 compile/upload and physical integration | **Not performed**; configured board/toolchain/hardware unavailable |
| Physical mobile runtime | **Not performed**; API consumer compatibility is exercised through patient history/latest responses and existing client utility tests |

Automated tests and the loopback walkthrough use only synthetic isolated databases.
The production patient database was used only for the authorized migration and
private preservation/schema checks. Temporary UI servers are stopped after checking.
Existing non-fatal passlib/bcrypt version and datetime deprecation warnings remain.

Compatibility boundary: device uploads now require session and acquisition IDs
to prevent old/replaced scans being misassigned; the firmware was updated accordingly.
Older identifier-free manual requests remain accepted but cannot guarantee replay
identity. Active web requests send IDs. The current key configuration identifies
one logical device; a multi-device provisioning system is outside this step.

Physical ESP32 compilation/upload, real network/power-loss recovery, sensor behavior
and calibration remain unverified. The firmware guard prevents another acquisition
within the same ambiguously submitted session while running; persistent pending
payload recovery across a device reboot remains future hardware work. Timeout
status is finalized on access, with absolute-deadline enforcement at ingestion.
Existing non-fatal dependency warnings are not framework/dependency upgrades.
