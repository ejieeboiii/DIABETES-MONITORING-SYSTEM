// API timestamps are UTC; legacy naive timestamps are interpreted as UTC too.
export function readingTime(value) {
  if (typeof value !== 'string' || !value) return NaN;
  const explicit = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  return new Date(explicit ? value : `${value}Z`).getTime();
}

function validReadings(readings) {
  return (Array.isArray(readings) ? readings : []).filter((r) =>
    !r.is_simulated && Number.isFinite(r.acetone_ppm) && r.acetone_ppm >= 0 && Number.isFinite(readingTime(r.taken_at)));
}

export const LEVEL_LABELS = {
  unavailable: 'Calibration unverified',
  Normal: 'Normal monitoring band',
  'Pre-Diabetic': 'Elevated monitoring band',
  Diabetic: 'High monitoring band',
};

export function sensorLabel(reading) {
  return `${reading.is_simulated ? 'SIMULATED · ' : ''}${reading.sensor_configuration === 'tgs822_tgs2620' ? 'TGS822 + TGS2620' : 'Legacy MQ-138'}`;
}

export function rawSensorSummary(reading) {
  return reading.sensor_configuration === 'tgs822_tgs2620'
    ? `${reading.is_simulated ? 'SIMULATED · ' : ''}TGS822: ${reading.tgs822_raw_adc ?? '—'} ADC · TGS2620: ${reading.tgs2620_raw_adc ?? '—'} ADC`
    : `Legacy MQ-138: ${reading.raw_sensor_value ?? '—'} ADC`;
}

export function concentrationLabel(reading) {
  return Number.isFinite(reading.acetone_ppm) ? `${reading.acetone_ppm} ppm` : 'Unavailable';
}

export const levelColor = {
  unavailable: 'text-slate-500',
  Normal: 'text-emerald-400',
  'Pre-Diabetic': 'text-yellow-400',
  Diabetic: 'text-red-400',
};

export const levelBg = {
  unavailable: 'bg-slate-100 border-slate-200',
  Normal: 'bg-emerald-500/10 border-emerald-500/20',
  'Pre-Diabetic': 'bg-yellow-500/10 border-yellow-500/20',
  Diabetic: 'bg-red-500/10 border-red-500/20',
};

export function filterByDays(readings, days) {
  const now = Date.now();
  const cutoff = now - days * 24 * 60 * 60 * 1000;
  return validReadings(readings).filter((r) => readingTime(r.taken_at) >= cutoff && readingTime(r.taken_at) <= now);
}

export function computeTrend(readings) {
  readings = validReadings(readings);
  if (readings.length < 2) return { label: 'Insufficient data', direction: 'stable', delta: 0 };

  const sorted = [...readings].sort((a, b) => readingTime(a.taken_at) - readingTime(b.taken_at));
  const recent = sorted.slice(-Math.min(7, sorted.length));
  const firstHalf = recent.slice(0, Math.ceil(recent.length / 2));
  const secondHalf = recent.slice(Math.ceil(recent.length / 2));

  const avg = (arr) => arr.reduce((s, r) => s + r.acetone_ppm, 0) / arr.length;
  const delta = avg(secondHalf) - avg(firstHalf);

  if (delta > 0.15) return { label: 'Rising trend', direction: 'up', delta: delta.toFixed(2) };
  if (delta < -0.15) return { label: 'Improving trend', direction: 'down', delta: delta.toFixed(2) };
  return { label: 'Stable trend', direction: 'stable', delta: delta.toFixed(2) };
}

export function computeSevenDayAvg(readings) {
  const week = filterByDays(readings, 7);
  if (!week.length) return null;
  return (week.reduce((s, r) => s + r.acetone_ppm, 0) / week.length).toFixed(2);
}

export function toChartData(readings, limit = 30) {
  return [...validReadings(readings)]
    .sort((a, b) => readingTime(a.taken_at) - readingTime(b.taken_at))
    .slice(-limit)
    .map((r) => ({
      date: new Date(readingTime(r.taken_at)).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      ppm: r.acetone_ppm,
      level: r.diabetes_level,
    }));
}

export function getWellnessTips(latestLevel, trendDirection) {
  if (!LEVEL_LABELS[latestLevel] || latestLevel === 'unavailable') return [];
  const base = {
    Normal: [
      { title: 'Stay consistent', text: 'Keep balanced meals, regular activity, and periodic breath monitoring.' },
      { title: 'Hydration', text: 'Drink water throughout the day to support metabolic wellness.' },
    ],
    'Pre-Diabetic': [
      { title: 'Lifestyle focus', text: 'Reduce refined sugars and increase light daily activity such as walking.' },
      { title: 'Follow-up', text: 'Consider discussing your monitoring trend with your healthcare provider.' },
    ],
    Diabetic: [
      { title: 'Monitor closely', text: 'Track readings regularly and note any sudden changes in your wellness routine.' },
      { title: 'Seek guidance', text: 'Contact your healthcare provider if elevated readings persist. This app does not diagnose.' },
    ],
  };

  const tips = [...(base[latestLevel] || base.Normal)];

  if (trendDirection === 'up') {
    tips.unshift({
      title: 'Trend notice',
      text: 'Your recent readings are trending upward. Review sleep, diet, and stress, then share results with your provider.',
    });
  } else if (trendDirection === 'down') {
    tips.unshift({
      title: 'Positive progress',
      text: 'Your recent readings show improvement. Continue your current healthy habits.',
    });
  }

  return tips.slice(0, 3);
}

export function getProviderAlerts(patients, readings) {
  const alerts = [];
  const now = Date.now();

  patients.forEach((patient) => {
    const patientReadings = readings.filter((r) => !r.is_simulated && Number.isFinite(readingTime(r.taken_at)))
      .filter((r) => r.patient_id === patient.id)
      .sort((a, b) => readingTime(b.taken_at) - readingTime(a.taken_at));

    if (!patientReadings.length) {
      alerts.push({
        patientId: patient.id,
        patientName: patient.full_name,
        type: 'no_data',
        message: 'No real sensor readings recorded yet',
      });
      return;
    }

    const latest = patientReadings[0];
    const daysSince = (now - readingTime(latest.taken_at)) / (1000 * 60 * 60 * 24);

    if (daysSince >= 7) {
      alerts.push({
        patientId: patient.id,
        patientName: patient.full_name,
        type: 'missed',
        message: `No reading in ${Math.floor(daysSince)} days`,
      });
    }

    const trend = computeTrend(patientReadings);
    if (trend.direction === 'up') {
      alerts.push({
        patientId: patient.id,
        patientName: patient.full_name,
        type: 'rising',
        message: 'Readings trending upward across the latest up to seven readings',
      });
    }

    if (!latest.diabetes_level) {
      alerts.push({ patientId: patient.id, patientName: patient.full_name,
        type: 'calibration', message: 'Latest raw sensor reading: calibration unverified' });
    } else if (latest.diabetes_level !== 'Normal') {
      alerts.push({
        patientId: patient.id,
        patientName: patient.full_name,
        type: 'band',
        message: `Latest band: ${LEVEL_LABELS[latest.diabetes_level] || latest.diabetes_level}`,
      });
    }
  });

  return alerts.slice(0, 8);
}
