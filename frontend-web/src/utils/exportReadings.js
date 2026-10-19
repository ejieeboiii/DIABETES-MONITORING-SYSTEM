import { LEVEL_LABELS } from './monitoring.js';

function csvCell(value) {
  let text = value == null ? '' : String(value);
  // Quoting alone does not prevent spreadsheet formula execution.
  if (typeof value === 'string' && /^\s*[=+@\-\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function readingsCsv(readings, patients) {
  const names = new Map(patients.map((patient) => [patient.id, patient.full_name]));
  const rows = [['Patient', 'Recorded at (UTC)', 'Calculated concentration (ppm)', 'Temperature (C)', 'Humidity (%)', 'Monitoring band', 'Experimental glucose estimate (mg/dL)', 'Limitations', 'Sensor configuration', 'Legacy MQ-138 ADC', 'TGS822 ADC', 'TGS2620 ADC', 'TGS822 baseline ADC', 'TGS2620 baseline ADC', 'Calibration status', 'Acquisition profile', 'Simulation provenance', 'Preprocessing version', 'Calibration version', 'Model version', 'Estimation status', 'Estimation reason']];
  readings.forEach((reading) => rows.push([
    names.get(reading.patient_id) || 'Unknown patient', reading.taken_at,
    reading.acetone_ppm, reading.temperature, reading.humidity,
    LEVEL_LABELS[reading.diabetes_level || 'unavailable'] || reading.diabetes_level,
    reading.predicted_bgl,
    'Experimental monitoring prototype; not a diagnosis. Blank estimate means unavailable.',
    reading.sensor_configuration || 'mq138_legacy', reading.raw_sensor_value,
    reading.tgs822_raw_adc, reading.tgs2620_raw_adc, reading.tgs822_baseline_adc,
    reading.tgs2620_baseline_adc, reading.calibration_status || 'legacy_unverified', reading.calibration_profile_id,
    reading.is_simulated ? 'SIMULATED synthetic test data; not a patient measurement' : 'Not tagged as simulated',
    reading.preprocessing_version, reading.calibration_version, reading.model_version, reading.estimation_status, reading.estimation_reason,
  ]));
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

export function downloadReadings(readings, patients) {
  const blob = new Blob(['\uFEFF', readingsCsv(readings, patients)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = 'breathdx-readings.csv'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
