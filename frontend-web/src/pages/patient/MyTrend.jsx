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
      <div className="flex-1 flex items-center justify-center bg-slate-100">
        <div className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-500 shadow-sm">Loading trend...</div>
      </div>
    );
  }

  return (
    <div className="min-h-full flex-1 overflow-auto bg-slate-100 text-slate-800">
      <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-sky-600">Personal analytics</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">My Trend</h1>
          <p className="mt-1 text-sm text-slate-500">Track how your acetone readings change over time</p>
        </div>

        <div className="flex gap-2 flex-wrap">
          {ranges.map((r) => (
            <button
              key={r.days}
              onClick={() => setRange(r.days)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                range === r.days
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'border border-slate-200 bg-white text-slate-500 hover:border-sky-200 hover:text-sky-700'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/50 md:col-span-1">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Trend summary</p>
            <p className={`text-xl font-bold mt-2 ${
              trend.direction === 'up' ? 'text-amber-600' : trend.direction === 'down' ? 'text-emerald-600' : 'text-slate-900'
            }`}>
              {trend.label}
            </p>
            <p className="mt-2 text-xs text-slate-500">{filtered.length} readings in selected period</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/50 md:col-span-2 sm:p-6">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">Acetone PPM over time</h2>
            <TrendChart data={chartData} height={260} />
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/50">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Reference bands (informational)</p>
          <div className="grid md:grid-cols-3 gap-3 text-sm">
            <div className="rounded-xl bg-emerald-50 px-4 py-3 text-emerald-700">&lt; 1.8 ppm — Normal monitoring band</div>
            <div className="rounded-xl bg-amber-50 px-4 py-3 text-amber-700">1.8 – 3.5 ppm — Elevated monitoring band</div>
            <div className="rounded-xl bg-rose-50 px-4 py-3 text-rose-700">&gt; 3.5 ppm — High monitoring band</div>
          </div>
        </div>
      </div>
    </div>
  );
}
