import { useEffect, useState } from 'react';
import { getMyReadings } from '../../utils/api';
import TrendChart from '../../components/TrendChart';
import { computeTrend, filterByDays, toChartData } from '../../utils/monitoring';

const ranges = [
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
];

export default function MyTrend() {
  const [readings, setReadings] = useState([]);
  const [range, setRange] = useState(30);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMyReadings()
      .then((r) => setReadings(r.data))
      .catch(() => setReadings([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = filterByDays(readings, range);
  const trend = computeTrend(filtered);
  const chartData = toChartData(filtered, 90);

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
          <h1 className="text-2xl font-bold text-white">My Trend</h1>
          <p className="text-white/30 text-sm mt-1">Track how your acetone readings change over time</p>
        </div>

        <div className="flex gap-2 flex-wrap">
          {ranges.map((r) => (
            <button
              key={r.days}
              onClick={() => setRange(r.days)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                range === r.days
                  ? 'bg-emerald-500 text-white'
                  : 'bg-white/5 text-white/40 hover:text-white border border-white/10'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white/3 border border-white/8 rounded-2xl p-5 md:col-span-1">
            <p className="text-white/40 text-xs uppercase tracking-wider">Trend summary</p>
            <p className={`text-xl font-bold mt-2 ${
              trend.direction === 'up' ? 'text-yellow-400' : trend.direction === 'down' ? 'text-emerald-400' : 'text-white'
            }`}>
              {trend.label}
            </p>
            <p className="text-white/30 text-xs mt-2">{filtered.length} readings in selected period</p>
          </div>
          <div className="bg-white/3 border border-white/8 rounded-2xl p-6 md:col-span-2">
            <h2 className="text-white font-semibold text-sm mb-4">Acetone PPM over time</h2>
            <TrendChart data={chartData} height={260} />
          </div>
        </div>

        <div className="bg-white/3 border border-white/8 rounded-2xl p-5">
          <p className="text-white/40 text-xs uppercase tracking-wider mb-3">Reference bands (informational)</p>
          <div className="grid md:grid-cols-3 gap-3 text-sm">
            <div className="rounded-xl bg-emerald-500/10 px-4 py-3 text-emerald-400">&lt; 1.8 ppm — Normal monitoring band</div>
            <div className="rounded-xl bg-yellow-500/10 px-4 py-3 text-yellow-400">1.8 – 3.5 ppm — Elevated monitoring band</div>
            <div className="rounded-xl bg-red-500/10 px-4 py-3 text-red-400">&gt; 3.5 ppm — High monitoring band</div>
          </div>
        </div>
      </div>
    </div>
  );
}
