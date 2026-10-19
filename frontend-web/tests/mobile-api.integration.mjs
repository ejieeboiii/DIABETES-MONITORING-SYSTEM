// Actual mobile Axios helper source against the disposable UI fixture.
// Native storage/base URL are supplied by the test; this is not a phone UI test.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import axios from 'axios';

const baseURL = process.env.BREATHDX_FIXTURE_URL || 'http://127.0.0.1:8012';
assert.match(baseURL, /^http:\/\/127\.0\.0\.1:8012$/);
const source = await readFile(new URL('../../frontend-mobile/src/utils/api.js', import.meta.url), 'utf8');
const body = source.replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
const storage = new Map();
const mobile = new Function('axios', 'AsyncStorage', 'getApiBaseUrl', `${body}\nreturn {loginPatient, getMyReadings, getMyLatestReading};`)(
  axios, { getItem: async key => storage.get(key) ?? null }, () => baseURL,
);
const login = await mobile.loginPatient({email: 'patient@example.com', password: 'Test-Only-Password'});
assert.equal(login.data.role, 'patient');
storage.set('token', login.data.access_token);
const history = (await mobile.getMyReadings()).data;
const latest = (await mobile.getMyLatestReading()).data;
const summary = (await axios.get(`${baseURL}/__test/simulation-summary`)).data;
assert.ok(history.length > 0, 'Complete a browser simulation before running this check.');
assert.equal(history.length, summary.saved_readings);
assert.equal(summary.saved_readings, summary.acquisitions);
assert.equal(summary.saved_readings, summary.simulated_readings);
assert.equal(summary.saved_readings, summary.unique_acquisitions);
assert.equal(summary.saved_readings, summary.unique_sessions);
assert.equal(summary.correct_patient, true);
assert.equal(summary.medical_outputs_unavailable, true);
assert.deepEqual(latest, history[0]);
for (const reading of history) {
  assert.equal(reading.patient_id, login.data.user.id);
  assert.equal(reading.is_simulated, true);
  assert.equal(reading.device_id, 'simulator-provider-1');
  assert.match(reading.acquisition_id, /^[a-f0-9]{32}$/);
  assert.match(reading.scan_session_id, /^[a-f0-9]{32}$/);
  assert.equal(reading.acetone_ppm, null);
  assert.equal(reading.diabetes_level, null);
  assert.equal(reading.predicted_bgl, null);
  assert.equal(reading.preprocessing_version, 'tgs-adc-v1');
  assert.equal(reading.estimation_status, 'unavailable');
  assert.equal(reading.estimation_reason, 'simulated_data');
  assert.equal(reading.model_version, null);
  assert.equal(reading.calibration_version, null);
  assert.equal(reading.preprocessing_metadata.is_simulated, true);
  assert.ok(Number.isInteger(reading.tgs822_raw_adc));
  assert.ok(Number.isInteger(reading.tgs2620_raw_adc));
  assert.ok(Number.isInteger(reading.tgs822_baseline_adc));
  assert.ok(Number.isInteger(reading.tgs2620_baseline_adc));
}
console.log(`PASS: mobile API helpers fetched ${history.length} synthetic reading(s); database has exactly one receipt and record per completed scan; ownership and unavailable medical outputs verified.`);
