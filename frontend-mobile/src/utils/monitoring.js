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
  Normal: 'Normal monitoring band',
  'Pre-Diabetic': 'Elevated monitoring band',
  Diabetic: 'High monitoring band',
};

export const levelColor = {
  Normal: '#34d399',
  'Pre-Diabetic': '#fbbf24',
  Diabetic: '#f87171',
};

export function filterByDays(readings, days) {
  const now = Date.now();
  const cutoff = now - days * 24 * 60 * 60 * 1000;
  return validReadings(readings).filter((r) => readingTime(r.taken_at) >= cutoff && readingTime(r.taken_at) <= now);
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

export function computeTrend(readings) {
  const safeReadings = validReadings(readings);
  if (safeReadings.length < 2) {
    return { label: 'Insufficient data', direction: 'stable' };
  }
  const sorted = [...safeReadings].sort((a, b) => readingTime(a.taken_at) - readingTime(b.taken_at));
  const recent = sorted.slice(-Math.min(7, sorted.length));
  const half = Math.ceil(recent.length / 2);
  const first = recent.slice(0, half);
  const second = recent.slice(half);
  const avg = (arr) => arr.reduce((s, r) => s + r.acetone_ppm, 0) / arr.length;
  const delta = avg(second) - avg(first);
  if (delta > 0.15) return { label: 'Rising trend', direction: 'up' };
  if (delta < -0.15) return { label: 'Improving trend', direction: 'down' };
  return { label: 'Stable trend', direction: 'stable' };
}

export function computeSevenDayAvg(readings) {
  const week = filterByDays(readings, 7);
  if (!week.length) return null;
  return (week.reduce((s, r) => s + r.acetone_ppm, 0) / week.length).toFixed(2);
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

export function getWellnessTips(level, direction) {
  if (!LEVEL_LABELS[level]) return [];
  const base = {
    Normal: [
      { title: 'Stay consistent', text: 'Keep balanced meals and regular activity.' },
      { title: 'Hydration', text: 'Drink water throughout the day.' },
    ],
    'Pre-Diabetic': [
      { title: 'Lifestyle focus', text: 'Reduce refined sugars and walk daily.' },
      { title: 'Follow-up', text: 'Discuss trends with your healthcare provider.' },
    ],
    Diabetic: [
      { title: 'Monitor closely', text: 'Track readings regularly.' },
      { title: 'Seek guidance', text: 'Contact your provider if elevated readings persist.' },
    ],
  };
  const tips = [...(base[level] || base.Normal)];
  if (direction === 'up') {
    tips.unshift({ title: 'Trend notice', text: 'Recent readings are trending upward.' });
  } else if (direction === 'down') {
    tips.unshift({ title: 'Positive progress', text: 'Your recent readings show improvement. Keep up healthy habits.' });
  }
  return tips.slice(0, 3);
}
