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
      <div className="flex-1 flex items-center justify-center bg-slate-950">
        <div className="text-white/30 text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-slate-950 overflow-auto">
      <div className="p-8 max-w-6xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-white">
            Good day, {user?.full_name?.split(' ')[0]} 👋
          </h1>
          <p className="text-white/30 text-sm mt-1">Your personal health monitoring overview</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white/3 border border-white/8 rounded-2xl p-5">
            <p className="text-white/40 text-xs uppercase tracking-wider">Latest reading</p>
            {latest ? (
              <>
                <p className="text-3xl font-bold text-white mt-2">{latest.acetone_ppm} <span className="text-lg text-white/40">ppm</span></p>
                <div className="mt-3"><LevelBadge level={latest.diabetes_level} /></div>
                {latest.estimated_glucose_mg_dl && (
                  <p className="text-emerald-400 text-xs mt-2">
                    Est. glucose: {latest.estimated_glucose_mg_dl} mg/dL
                    {latest.glucose_level && <span className="text-white/50"> ({latest.glucose_level})</span>}
                  </p>
                )}
                <p className="text-white/30 text-xs mt-2">{new Date(latest.taken_at).toLocaleString()}</p>
              </>
            ) : (
              <p className="text-white/30 text-sm mt-4">No readings yet. Ask your provider to record a scan.</p>
            )}
          </div>

          <div className="bg-white/3 border border-white/8 rounded-2xl p-5">
            <p className="text-white/40 text-xs uppercase tracking-wider">7-day average</p>
            <p className="text-3xl font-bold text-emerald-400 mt-2">{weekAvg ?? '—'} <span className="text-lg text-white/40">ppm</span></p>
            <p className="text-white/30 text-xs mt-3">Rolling average of recent scans</p>
          </div>

          <div className="bg-white/3 border border-white/8 rounded-2xl p-5">
            <p className="text-white/40 text-xs uppercase tracking-wider">Trend</p>
            <p className={`text-2xl font-bold mt-2 ${trend.direction === 'up' ? 'text-yellow-400' : trend.direction === 'down' ? 'text-emerald-400' : 'text-white'}`}>
              {trend.label}
            </p>
            {trend.delta !== 0 && (
              <p className="text-white/30 text-xs mt-3">Change: {trend.delta} ppm</p>
            )}
          </div>
        </div>

        <div className="bg-white/3 border border-white/8 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-semibold text-sm">14-day acetone trend</h2>
            <button onClick={() => navigate('/patient/trend')} className="text-emerald-400 text-xs hover:text-emerald-300">
              Full trend →
            </button>
          </div>
          <TrendChart data={chartData} />
        </div>

        <div>
          <h2 className="text-white font-semibold text-sm mb-4">Wellness suggestions</h2>
          <RecommendationCards tips={tips} />
          {latest?.suggestion && (
            <div className="mt-4 bg-emerald-500/5 border border-emerald-500/15 rounded-xl p-4">
              <p className="text-emerald-300 text-xs font-medium uppercase tracking-wider">From your latest scan</p>
              <p className="text-white/70 text-sm mt-2">{latest.suggestion}</p>
            </div>
          )}
        </div>

        {readings.length > 0 && (
          <div className="bg-white/3 border border-white/8 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
              <h2 className="text-white font-semibold text-sm">Recent readings</h2>
              <Link to="/patient/results" className="text-emerald-400 text-xs hover:text-emerald-300">
                View all →
              </Link>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  {['Acetone PPM', 'Level', 'Date'].map((h) => (
                    <th key={h} className="text-left px-6 py-3 text-white/30 text-xs font-medium uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(showAllRecent ? readings : readings.slice(0, RECENT_PREVIEW)).map((r) => (
                  <tr key={r.id} className="border-b border-white/3">
                    <td className="px-6 py-3 text-white font-mono text-sm">{r.acetone_ppm}</td>
                    <td className="px-6 py-3"><LevelBadge level={r.diabetes_level} /></td>
                    <td className="px-6 py-3 text-white/30 text-xs">{new Date(r.taken_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {readings.length > RECENT_PREVIEW && (
              <div className="px-6 py-4 border-t border-white/5 flex flex-wrap items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={() => setShowAllRecent((v) => !v)}
                  className="text-emerald-400 hover:text-emerald-300 text-sm font-medium transition-colors"
                >
                  {showAllRecent
                    ? 'Show less'
                    : `See more (${readings.length - RECENT_PREVIEW} more on dashboard)`}
                </button>
                <Link to="/patient/results" className="text-white/40 hover:text-white text-sm transition-colors">
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
