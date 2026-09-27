import { useEffect, useState } from 'react';
import { getMyReadings } from '../../utils/api';
import LevelBadge from '../../components/LevelBadge';

export default function MyResults() {
  const [readings, setReadings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMyReadings()
      .then((r) => setReadings(r.data))
      .catch(() => setReadings([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-100">
        <div className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-500 shadow-sm">Loading results...</div>
      </div>
    );
  }

  return (
    <div className="min-h-full flex-1 overflow-auto bg-slate-100 text-slate-800">
      <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-sky-600">Monitoring records</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">My Results</h1>
          <p className="mt-1 text-sm text-slate-500">{readings.length} recorded scans</p>
        </div>

        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm shadow-slate-200/50">
          {readings.length === 0 ? (
            <div className="py-20 text-center text-sm text-slate-500">
              No results yet. Your healthcare provider will add readings after a scan.
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80">
                  {['Acetone PPM', 'Est. Glucose', 'Temperature', 'Humidity', 'Monitoring band', 'Suggestion', 'Date'].map((h) => (
                    <th key={h} className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 sm:px-6">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {readings.map((r) => (
                  <tr key={r.id} className="border-b border-slate-200 last:border-b-0 hover:bg-slate-50/70">
                    <td className="px-5 py-3 font-mono text-sm text-slate-800 sm:px-6">{r.acetone_ppm}</td>
                    <td className="px-5 py-3 text-sm font-semibold text-slate-800 sm:px-6">
                      {r.estimated_glucose_mg_dl ? `${r.estimated_glucose_mg_dl} mg/dL` : '—'}
                      {r.glucose_level && <span className="ml-1 text-xs font-medium text-slate-400">({r.glucose_level})</span>}
                    </td>
                    <td className="px-5 py-3 text-sm text-slate-600 sm:px-6">{r.temperature}°C</td>
                    <td className="px-5 py-3 text-sm text-slate-600 sm:px-6">{r.humidity}%</td>
                    <td className="px-5 py-3 sm:px-6"><LevelBadge level={r.diabetes_level} /></td>
                    <td className="max-w-xs px-5 py-3 text-xs text-slate-500 sm:px-6">{r.suggestion || '—'}</td>
                    <td className="px-5 py-3 text-xs text-slate-500 sm:px-6">{new Date(r.taken_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
