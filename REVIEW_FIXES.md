# BreathDX review fixes — 2026-10-13

The critical/high/medium defects identified in the source review have been addressed
in the application code. Experimental estimation is wired but remains disabled
until a trusted artifact is explicitly configured. No clinical accuracy is asserted.

## Implemented

- Reading deletion and submission enforce provider ownership. Manual ingestion
  uses medical JWTs; device ingestion uses a separate provider-scoped private key.
- JWT signing uses private configuration with no shared fallback. Password changes
  and resets invalidate old sessions. Swagger uses HTTP Bearer authorization.
- Listener start, stop, ping and armed-patient routes are implemented. Sessions are
  provider-isolated, expire after 15 minutes, and include IDs to prevent stale tab
  cleanup from cancelling a newer session.
- WebSocket authentication and patient selection use the first frame, keeping
  tokens and patient identifiers out of connection URLs. Ownership filters,
  periodic authentication checks and connection cleanup are enforced.
- Ingestion rejects invalid ADC, boolean/string measurements, non-finite or
  out-of-range environments and weak supplied-baseline signals. Baselines are
  passed into conversion. Failed database writes roll back; failed notifications
  do not misrepresent a persisted reading as an unsuccessful submission.
- Optional inference supports explicitly configured, hash-pinned trusted single-
  or three-feature regression artifacts. Missing/incompatible models produce null
  estimates. There is no automatic training, zero substitution or silent clamping.
- Active web/mobile displays use predicted_bgl, show unavailable estimates and
  label available values as experimental. Monitoring-band wording avoids diagnosis.
- Client failures have distinct errors and Retry controls instead of fake empty
  histories. Temporary server failures preserve saved sessions; invalid sessions
  sign out. Web session changes propagate across tabs.
- Deployment API addresses and CORS origins are configurable. Mobile Metro uses
  8081 and LAN discovery/port-typo handling is corrected. SDK guidance matches the
  installed Expo 57 version; no packages or lockfiles were upgraded.
- Patients with readings cannot be deleted implicitly. Timestamp responses include
  UTC offsets; reading order is deterministic. Trend alerts describe the latest
  up to seven readings rather than claiming a seven-day window.
- Provider/patient account editors, password-change flows, owned patient-detail
  editing and filtered CSV export are connected to active routes. Exports escape
  CSV content and neutralize spreadsheet formulas.
- Provider layout works at phone width. Patient dialogs support keyboard focus,
  Escape and focus restoration. Medical routes load separately, reducing the
  initial production JS bundle from about 700 kB to about 297 kB.
- A non-overwriting SQLite backup utility creates and integrity-checks snapshots;
  database connections are closed after use. No production backup was created.
- Firmware source sends device credentials and the polled patient ID, skips failed
  environmental/ADC measurements, and avoids automatic POST retries and printing
  patient payloads. Its ten-second warmup is explicitly experimental. No sensor
  replacement, calibration, board installation or device flashing was performed.

## Verification

| Check | Result |
| --- | --- |
| Backend unittest suite | 42 tests passed; isolated synthetic databases and mocked models |
| JavaScript utility suite | 8 tests passed across both clients, CSV and URL handling |
| Web ESLint | Passed |
| Web production build | Passed; route splitting removed the large-chunk warning |
| Expo Android export | Passed using the existing Expo/Hermes toolchain |
| Browser login/manual entry | Passed with disposable demo accounts |
| Browser listener/WebSocket/new-reading push | Passed; no-history patients supported |
| Browser profile/patient edits | Passed |
| Browser dialog Escape/focus restoration | Passed |
| Browser server failure and Retry | Passed; session restored without another login |
| Browser 390-pixel layout | Passed after the sidebar fix |
| Browser listener stop | Returned to the Start Listening control |
| Browser logout completion | Not confirmed: browser automation timed out during the final check |
| Root and nested-mobile diff checks | Passed |

Windows event-loop and Hermes temporary-file restrictions required the relevant
checks to run outside the sandbox. No dependencies were installed. Existing
passlib/bcrypt version-warning output and dependency UTC deprecation warnings
remain non-fatal; password/login tests passed.

The disposable backend/web servers were stopped. The patient database, schema,
model artifacts, existing skills, environments and dependency lockfiles were
preserved. The database was inspected only for column metadata in read-only mode.

## Setup and limits

Restart the real backend and reload the clients, then log in again. Follow
[backend configuration](backend/CONFIGURATION.md) for device-key pairing, explicit
CORS origins, deployed HTTPS/WSS addresses, backup procedures and trusted-model
selection. A local JWT key is already in the ignored backend .env from the earlier
fix; device credentials have not been paired to a real provider or provisioned to
hardware.

No physical mobile device, firmware compilation/upload, real-model evaluation,
paired dataset or clinical calibration was available for verification. Listener
state is process-local and supports a single backend worker. Client tokens still
use localStorage/AsyncStorage. Device ingestion has no general idempotency contract.

The optional roadmap items from the review—durable audit history, self-service
provider recovery, retention-policy enforcement, encrypted client/session storage
and a migration framework—remain separate work requiring storage/workflow choices.
They were not silently added as schemas, services or data migrations.
