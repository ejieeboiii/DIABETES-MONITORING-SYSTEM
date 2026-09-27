import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

const RECENT_PREVIEW = 5;
import { getMyReadings, getMyLatestReading } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import LevelBadge from '../../components/LevelBadge';
import TrendChart from '../../components/TrendChart';
import RecommendationCards from '../../components/RecommendationCards';
import {
  computeSevenDayAvg,
  computeTrend,
  getWellnessTips,
  toChartData,
} from '../../utils/monitoring';

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [readings, setReadings] = useState([]);
  const [latest, setLatest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAllRecent, setShowAllRecent] = useState(false);

  useEffect(() => {
    Promise.all([
      getMyReadings().then((r) => r.data).catch(() => []),
      getMyLatestReading().then((r) => r.data).catch(() => null),
    ]).then(([all, last]) => {
      setReadings(all);
      setLatest(last);
    }).finally(() => setLoading(false));
  }, []);

  const trend = computeTrend(readings);
  const weekAvg = computeSevenDayAvg(readings);
  const chartData = toChartData(readings, 14);
  const tips = latest
    ? getWellnessTips(latest.diabetes_level, trend.direction)
    : getWellnessTips('Normal', 'stable');

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-100">
        <div className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-500 shadow-sm">Loading your dashboard...</div>
      </div>
    );
  }

  return (
    <div className="min-h-full flex-1 overflow-auto bg-slate-100 text-slate-800">
      <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:space-y-8 lg:p-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-sky-600">Patient portal</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Good day, {user?.full_name?.split(' ')[0]}!
            </h1>
            <p className="mt-1 text-sm text-slate-500">Your personal health monitoring overview</p>
          </div>
          <div className="rounded-2xl border border-sky-100 bg-white px-4 py-3 text-right shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-600">BreathDx</p>
            <p className="mt-1 text-xs text-slate-500">Private monitoring space</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/50">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Latest reading</p>
            {latest ? (
              <>
                <p className="mt-2 text-3xl font-bold text-slate-900">{latest.acetone_ppm} <span className="text-lg text-slate-400">ppm</span></p>
                <div className="mt-3"><LevelBadge level={latest.diabetes_level} /></div>
                {latest.estimated_glucose_mg_dl && (
                  <p className="mt-2 text-xs text-emerald-600">
                    Est. glucose: {latest.estimated_glucose_mg_dl} mg/dL
                    {latest.glucose_level && <span className="text-slate-400"> ({latest.glucose_level})</span>}
                  </p>
                )}
                <p className="mt-2 text-xs text-slate-500">{new Date(latest.taken_at).toLocaleString()}</p>
              </>
            ) : (
              <p className="mt-4 text-sm text-slate-400">No readings yet. Ask your provider to record a scan.</p>
            )}
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/50">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">7-day average</p>
            <p className="mt-2 text-3xl font-bold text-sky-600">{weekAvg ?? '—'} <span className="text-lg text-slate-400">ppm</span></p>
            <p className="mt-3 text-xs text-slate-500">Rolling average of recent scans</p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/50">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Trend</p>
            <p className={`mt-2 text-2xl font-bold ${trend.direction === 'up' ? 'text-amber-600' : trend.direction === 'down' ? 'text-emerald-600' : 'text-slate-900'}`}>
              {trend.label}
            </p>
            {trend.delta !== 0 && (
              <p className="mt-3 text-xs text-slate-500">Change: {trend.delta} ppm</p>
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/50 sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">14-day acetone trend</h2>
            <button onClick={() => navigate('/patient/trend')} className="text-sm font-medium text-sky-600 hover:text-sky-500">
              Full trend →
            </button>
          </div>
          <TrendChart data={chartData} />
        </div>

        <div>
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Wellness suggestions</h2>
          <RecommendationCards tips={tips} />
          {latest?.suggestion && (
            <div className="mt-4 rounded-2xl border border-sky-100 bg-sky-50 p-4">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-sky-700">From your latest scan</p>
              <p className="mt-2 text-sm text-slate-600">{latest.suggestion}</p>
            </div>
          )}
        </div>

        {readings.length > 0 && (
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm shadow-slate-200/50">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 sm:px-6">
              <h2 className="text-lg font-semibold text-slate-900">Recent readings</h2>
              <Link to="/patient/results" className="text-sm font-medium text-sky-600 hover:text-sky-500">
                View all →
              </Link>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80">
                  {['Acetone PPM', 'Level', 'Date'].map((h) => (
                    <th key={h} className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 sm:px-6">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(showAllRecent ? readings : readings.slice(0, RECENT_PREVIEW)).map((r) => (
                  <tr key={r.id} className="border-b border-slate-200 last:border-b-0 hover:bg-slate-50/70">
                    <td className="px-5 py-3 font-mono text-sm text-slate-800 sm:px-6">{r.acetone_ppm}</td>
                    <td className="px-5 py-3 sm:px-6"><LevelBadge level={r.diabetes_level} /></td>
                    <td className="px-5 py-3 text-xs text-slate-500 sm:px-6">{new Date(r.taken_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {readings.length > RECENT_PREVIEW && (
              <div className="flex flex-wrap items-center justify-center gap-4 border-t border-slate-200 px-6 py-4">
                <button
                  type="button"
                  onClick={() => setShowAllRecent((v) => !v)}
                  className="text-sm font-medium text-sky-600 transition-colors hover:text-sky-500"
                >
                  {showAllRecent
                    ? 'Show less'
                    : `See more (${readings.length - RECENT_PREVIEW} more on dashboard)`}
                </button>
                <Link to="/patient/results" className="text-sm text-slate-500 transition-colors hover:text-slate-800">
                  Open full results →
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
