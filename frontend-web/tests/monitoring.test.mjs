import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { readingsCsv } from '../src/utils/exportReadings.js';
import { estimationMessage } from '../src/utils/estimation.js';

const day = 24 * 60 * 60 * 1000;
const reading = (ppm, time) => ({ acetone_ppm: ppm, taken_at: new Date(time).toISOString() });
test('estimation availability labels and CSV version provenance are preserved', () => {
  assert.match(estimationMessage({is_simulated:true}), /Synthetic test data/);
  assert.match(estimationMessage({estimation_status:'unavailable',estimation_reason:'outside_training_domain'}), /outside the evaluated input range/);
  assert.match(estimationMessage({estimation_status:'available_experimental'}), /not medically validated/);
  assert.equal(estimationMessage({}), '');
  const csv=readingsCsv([{patient_id:1,preprocessing_version:'tgs-adc-v1',calibration_version:'unit-only',model_version:null,estimation_status:'unavailable',estimation_reason:'disabled'}],[]);
  assert.match(csv,/Preprocessing version/); assert.match(csv,/tgs-adc-v1/); assert.match(csv,/unavailable/);
});
for (const folder of ['frontend-web', 'frontend-mobile']) {
  const availabilitySource=await readFile(new URL(`../../${folder}/src/utils/estimation.js`,import.meta.url),'utf8');
  const availability=await import(`data:text/javascript;base64,${Buffer.from(availabilitySource).toString('base64')}`);
  test(`${folder}: unavailable and experimental estimates have clear non-diagnostic messages`,()=>{
    assert.match(availability.estimationMessage({is_simulated:true}), /Synthetic test data/);
    assert.match(availability.estimationMessage({estimation_status:'unavailable',estimation_reason:'missing_model_features'}), /baseline measurements are missing/);
    assert.match(availability.estimationMessage({estimation_status:'available_experimental'}), /not medically validated/);
  });
  const path = new URL(`../../${folder}/src/utils/monitoring.js`, import.meta.url);
  const source = await readFile(path, 'utf8');
  const monitoring = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  test(`${folder}: simulated records are excluded from trends, charts and medical alerts`, () => {
    const simulated = { ...reading(100, Date.now()), patient_id: 1, diabetes_level: 'Diabetic', is_simulated: true };
    assert.equal(monitoring.computeSevenDayAvg([simulated]), null);
    assert.deepEqual(monitoring.toChartData([simulated]), []);
    assert.equal(monitoring.computeTrend([simulated, simulated]).label, 'Insufficient data');
    assert.equal(monitoring.getProviderAlerts([{ id: 1, full_name: 'Test patient' }], [simulated])[0].type, 'no_data');
    assert.match(monitoring.getProviderAlerts([{ id: 1, full_name: 'Test patient' }], [simulated])[0].message, /No real sensor readings/);
    assert.match(readingsCsv([simulated], [{ id: 1, full_name: 'Test patient' }]), /SIMULATED synthetic test data/);
  });
  test(`${folder}: raw TGS readings remain outside concentration trends and normal-band advice`, () => {
    const now = Date.now();
    const raw = { patient_id: 1, acetone_ppm: null, diabetes_level: null,
      sensor_configuration: 'tgs822_tgs2620', tgs822_raw_adc: 1200, tgs2620_raw_adc: 1500,
      taken_at: new Date(now).toISOString() };
    assert.equal(monitoring.computeSevenDayAvg([raw]), null);
    assert.deepEqual(monitoring.toChartData([raw]), []);
    assert.equal(monitoring.computeTrend([raw, raw]).label, 'Insufficient data');
    assert.deepEqual(monitoring.getWellnessTips(null, 'up'), []);
    const alerts = monitoring.getProviderAlerts([{ id: 1, full_name: 'Synthetic' }], [raw]);
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].type, 'calibration');
    assert.equal(monitoring.computeSevenDayAvg([raw, reading(2, now - day)]), '2.00');
  });
  test(`${folder}: trends sort readings and preserve thresholds`, () => {
    assert.equal(monitoring.computeTrend([]).label, 'Insufficient data');
    assert.equal(monitoring.computeTrend([reading(1, 1)]).label, 'Insufficient data');
    assert.equal(monitoring.computeTrend([reading(2, 2), reading(1, 1)]).direction, 'up');
    assert.equal(monitoring.computeTrend([reading(1, 2), reading(2, 1)]).direction, 'down');
    assert.equal(monitoring.computeTrend([reading(0, 1), reading(0.15, 2)]).direction, 'stable');
    assert.equal(monitoring.computeTrend([reading(0.15, 1), reading(0, 2)]).direction, 'stable');
  });
  test(`${folder}: invalid data, UTC parsing, rolling cutoff and chart limit`, () => {
    assert.equal(monitoring.readingTime('2026-10-13T00:00:00'), Date.parse('2026-10-13T00:00:00Z'));
    assert.equal(monitoring.computeTrend([{ acetone_ppm: NaN, taken_at: 'bad' }]).label, 'Insufficient data');
    assert.equal(monitoring.computeSevenDayAvg([]), null);
    const now = Date.now();
    assert.equal(monitoring.computeSevenDayAvg([reading(2, now - day), reading(100, now - 8 * day), reading(100, now + day)]), '2.00');
    assert.equal(monitoring.toChartData(Array.from({ length: 40 }, (_, i) => reading(i, now - i * day))).length, 30);
  });
  test(`${folder}: rising alert describes readings rather than a week`, () => {
    const alerts = monitoring.getProviderAlerts([{ id: 1, full_name: 'Synthetic patient' }], [
      { ...reading(1, Date.now() - 30 * day), patient_id: 1, diabetes_level: 'Normal' },
      { ...reading(2, Date.now()), patient_id: 1, diabetes_level: 'Normal' },
    ]);
    assert.match(alerts.find((alert) => alert.type === 'rising').message, /seven readings/);
  });
}

test('CSV exports escape text and neutralize spreadsheet formulas', () => {
  const csv = readingsCsv([{ patient_id: 1, taken_at: '2026-10-13T00:00:00Z', acetone_ppm: 2,
    temperature: -1, humidity: 50, diabetes_level: 'Pre-Diabetic', predicted_bgl: null }],
    [{ id: 1, full_name: '=SUM(1,2)' }]);
  assert.match(csv, /'\=SUM\(1,2\)/);
  assert.match(csv, /Elevated monitoring band/);
  assert.match(csv, /Experimental glucose estimate \(mg\/dL\)/);
  assert.match(csv, /not a diagnosis/);
});

test('CSV preserves distinct TGS raw fields and leaves unavailable estimates blank', () => {
  const csv = readingsCsv([{ patient_id: 1, taken_at: '2026-10-14T00:00:00Z',
    sensor_configuration: 'tgs822_tgs2620', tgs822_raw_adc: 1234, tgs2620_raw_adc: 2345,
    tgs822_baseline_adc: 900, tgs2620_baseline_adc: 1000, calibration_status: 'unverified',
    acetone_ppm: null, diabetes_level: null, predicted_bgl: null, temperature: 25, humidity: 50 }], []);
  assert.match(csv, /TGS822 ADC/);
  assert.match(csv, /TGS2620 baseline ADC/);
  assert.match(csv, /"1234","2345","900","1000","unverified"/);
  assert.match(csv, /Calibration unverified/);
  assert.doesNotMatch(csv, /Normal monitoring band/);
});

const resolverSource = await readFile(new URL('../../frontend-mobile/src/utils/apiBaseUrl.js', import.meta.url), 'utf8');
function resolveMobile(env, constants = {}) {
  const context = { Constants: constants, Platform: { OS: 'ios' }, process: { env }, module: { exports: {} } };
  const script = resolverSource.replace(/^import .*;\r?\n/gm, '').replaceAll('export function', 'function') + '\nmodule.exports = { getApiBaseUrl };';
  vm.runInNewContext(script, context);
  return context.module.exports.getApiBaseUrl();
}
test('mobile URL respects normal IPv4 addresses and repairs only five-part port typos', () => {
  assert.equal(resolveMobile({ EXPO_PUBLIC_API_URL: 'http://192.168.1.100' }), 'http://192.168.1.100');
  assert.equal(resolveMobile({ EXPO_PUBLIC_API_URL: 'http://192.168.1.100.8001' }), 'http://192.168.1.100:8001');
  assert.equal(resolveMobile({}, { expoConfig: { hostUri: '192.168.1.100:8081' } }), 'http://192.168.1.100:8001');
  assert.equal(resolveMobile({}, { expoConfig: { hostUri: 'project.exp.direct:80' } }), 'http://127.0.0.1:8001');
});
