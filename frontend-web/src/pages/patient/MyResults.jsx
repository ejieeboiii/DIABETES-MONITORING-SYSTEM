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
      <div className="flex-1 flex items-center justify-center bg-slate-950">
        <div className="text-white/30 text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-slate-950 overflow-auto">
      <div className="p-8 max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">My Results</h1>
          <p className="text-white/30 text-sm mt-1">{readings.length} recorded scans</p>
        </div>

        <div className="bg-white/3 border border-white/8 rounded-2xl overflow-hidden">
          {readings.length === 0 ? (
            <div className="py-20 text-center text-white/20 text-sm">
              No results yet. Your healthcare provider will add readings after a scan.
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  {['Acetone PPM', 'Est. Glucose', 'Temperature', 'Humidity', 'Monitoring band', 'Suggestion', 'Date'].map((h) => (
                    <th key={h} className="text-left px-6 py-3 text-white/30 text-xs font-medium uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {readings.map((r) => (
                  <tr key={r.id} className="border-b border-white/3 hover:bg-white/2">
                    <td className="px-6 py-3 text-white font-mono text-sm">{r.acetone_ppm}</td>
                    <td className="px-6 py-3 text-emerald-400 text-sm font-medium">
                      {r.estimated_glucose_mg_dl ? `${r.estimated_glucose_mg_dl} mg/dL` : '—'}
                      {r.glucose_level && <span className="text-white/50 text-xs ml-1">({r.glucose_level})</span>}
                    </td>
                    <td className="px-6 py-3 text-white/60 text-sm">{r.temperature}°C</td>
                    <td className="px-6 py-3 text-white/60 text-sm">{r.humidity}%</td>
                    <td className="px-6 py-3"><LevelBadge level={r.diabetes_level} /></td>
                    <td className="px-6 py-3 text-white/50 text-xs max-w-xs">{r.suggestion || '—'}</td>
                    <td className="px-6 py-3 text-white/30 text-xs">{new Date(r.taken_at).toLocaleString()}</td>
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
