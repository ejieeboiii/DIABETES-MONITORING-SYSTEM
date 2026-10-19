import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import MetricCard from '../../components/MetricCard';

const RECENT_PREVIEW = 5;

import useProviderData from '../../hooks/useProviderData';
import RequestError from '../../components/RequestError';
import { useAuth } from '../../context/AuthContext';
import LevelBadge from '../../components/LevelBadge';
import { getProviderAlerts } from '../../utils/monitoring';

const navButtons = [
  { label: 'View patients', to: '/medical/patients', accent: 'bg-sky-600 text-white hover:bg-sky-500' },
  { label: 'Open readings', to: '/medical/readings', accent: 'bg-slate-900 text-white hover:bg-slate-800' },
  { label: 'Live scan', to: '/medical/livescan', accent: 'bg-slate-100 text-slate-700 hover:bg-slate-200' },
  { label: 'View trends', to: '/medical/trends', accent: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' },
];

export default function Dashboard() {
  const { user } = useAuth();
  const { patients, readings, loading, error, load } = useProviderData();
  const [showAllRecent, setShowAllRecent] = useState(false);
  const navigate = useNavigate();

  if (error) return <RequestError message={error} onRetry={load} />;

  const stats = {
    total: patients.length,
    normal: readings.filter((r) => !r.is_simulated && r.diabetes_level === 'Normal').length,
    preDiabetic: readings.filter((r) => !r.is_simulated && r.diabetes_level === 'Pre-Diabetic').length,
    diabetic: readings.filter((r) => !r.is_simulated && r.diabetes_level === 'Diabetic').length,
  };

  const alerts = getProviderAlerts(patients, readings);
  const displayedRecent = showAllRecent ? readings : readings.slice(0, RECENT_PREVIEW);
  const hasMoreRecent = readings.length > RECENT_PREVIEW;
  const patientName = (id) => patients.find((p) => p.id === id)?.full_name || `Patient #${id}`;
  const firstName = user?.full_name?.split(' ')[0] || 'Provider';

  if (loading) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center bg-slate-100">
        <div className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-500 shadow-sm">
          Loading dashboard...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full flex-1 overflow-auto bg-slate-100 text-slate-800">
      <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
        <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-sky-600">Healthcare provider</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Good day, {firstName}!</h1>
          </div>

          <div className="flex items-center gap-3 self-start lg:self-auto">
            <button
              type="button"
              onClick={() => navigate('/medical/readings')}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            >
              View readings
            </button>
            <button
              type="button"
              onClick={() => navigate('/medical/livescan')}
              className="rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-sky-600/20 transition hover:bg-sky-500"
            >
              Live scan
            </button>
          </div>
        </header>

        <section className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Total patients', value: stats.total, status: 'Primary', tone: 'blue', icon: 'patients' },
            { label: 'Normal band', value: stats.normal, status: 'Normal', tone: 'green', icon: 'normal' },
            { label: 'Elevated band', value: stats.preDiabetic, status: 'Elevated', tone: 'amber', icon: 'elevated' },
            { label: 'High band', value: stats.diabetic, status: 'High', tone: 'red', icon: 'high' },
          ].map((metric) => (
            <MetricCard key={metric.label} {...metric} live />
          ))}
        </section>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.7fr_0.9fr]">
          <div className="space-y-6">
            <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm shadow-slate-200/50">
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 sm:px-6">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Patients needing review</h2>
                  <p className="mt-1 text-sm text-slate-500">Based on missed scans, rising trends, and latest monitoring bands.</p>
                </div>
              </div>

              {alerts.length === 0 ? (
                <div className="px-6 py-12 text-center text-sm text-slate-500">No monitoring alerts from available real readings.</div>
              ) : (
                <div className="divide-y divide-slate-200">
                  {alerts.map((alert, i) => (
                    <div key={`${alert.patientId}-${i}`} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{alert.patientName}</p>
                        <p className="mt-1 text-sm text-slate-500">{alert.message}</p>
                      </div>

                      <button
                        type="button"
                        onClick={() => navigate(`/medical/readings?patient=${alert.patientId}`)}
                        className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
                      >
                        Review
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm shadow-slate-200/50">
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 sm:px-6">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Recent readings</h2>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/medical/readings')}
                  className="text-sm font-medium text-sky-600 transition hover:text-sky-500"
                >
                  View all
                </button>
              </div>

              {readings.length === 0 ? (
                <div className="px-6 py-16 text-center text-sm text-slate-500">No readings yet. Start a live scan to begin monitoring.</div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50/80">
                          {['Patient', 'Acetone PPM', 'Est. Glucose', 'Temperature', 'Humidity', 'Band', 'Date'].map((h) => (
                            <th key={h} className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 sm:px-6">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {displayedRecent.map((r) => (
                          <tr key={r.id} className="border-b border-slate-200 last:border-b-0 hover:bg-slate-50/70">
                            <td className="px-5 py-3 text-sm font-medium text-slate-700 sm:px-6">{patientName(r.patient_id)}</td>
                            <td className="px-5 py-3 font-mono text-sm text-slate-800 sm:px-6">
                              {r.is_simulated && <p className="mb-1 text-xs font-semibold text-sky-700">SIMULATED — synthetic test data</p>}
                              {r.acetone_ppm == null ? 'Calibration unverified' : `${r.acetone_ppm} ppm`}
                              {r.sensor_configuration === 'tgs822_tgs2620' && <p className="mt-1 text-xs text-slate-500">TGS822: {r.tgs822_raw_adc} ADC · TGS2620: {r.tgs2620_raw_adc} ADC</p>}
                            </td>
                            <td className="px-5 py-3 text-sm font-semibold text-slate-800 sm:px-6">
                              {r.predicted_bgl != null ? `${r.predicted_bgl} mg/dL (experimental)` : 'Unavailable'}
                            </td>
                            <td className="px-5 py-3 text-sm text-slate-600 sm:px-6">{r.temperature}°C</td>
                            <td className="px-5 py-3 text-sm text-slate-600 sm:px-6">{r.humidity}%</td>
                            <td className="px-5 py-3 sm:px-6"><LevelBadge level={r.diabetes_level} /></td>
                            <td className="px-5 py-3 text-xs text-slate-500 sm:px-6">{new Date(r.taken_at).toLocaleDateString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {hasMoreRecent && (
                    <div className="flex flex-col items-center justify-center gap-3 border-t border-slate-200 px-5 py-4 text-center sm:flex-row sm:justify-between sm:px-6">
                      <button
                        type="button"
                        onClick={() => setShowAllRecent((value) => !value)}
                        className="text-sm font-medium text-sky-600 transition hover:text-sky-500"
                      >
                        {showAllRecent ? 'Show less' : `See more (${readings.length - RECENT_PREVIEW} more)`}
                      </button>

                      <Link to="/medical/readings" className="text-sm font-medium text-slate-500 transition hover:text-slate-700">
                        Open full readings list →
                      </Link>
                    </div>
                  )}
                </>
              )}
            </section>
          </div>

          <aside className="space-y-6">
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/50">
              <h2 className="text-lg font-semibold text-slate-900">Quick access</h2>
              <div className="mt-4 space-y-3">
                {navButtons.map((button) => (
                  <button
                    key={button.to}
                    type="button"
                    onClick={() => navigate(button.to)}
                    className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm font-medium shadow-sm transition ${button.accent}`}
                  >
                    <span>{button.label}</span>
                    <span aria-hidden="true">→</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/50">
              <h2 className="text-lg font-semibold text-slate-900">Overview</h2>
              <div className="mt-4 space-y-3">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Active patients</p>
                  <p className="mt-2 text-2xl font-bold text-slate-900">{stats.total}</p>
                </div>
                <div className="rounded-2xl bg-sky-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-700">Review queue</p>
                  <p className="mt-2 text-2xl font-bold text-sky-700">{alerts.length}</p>
                </div>
                <div className="rounded-2xl bg-emerald-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Normal readings</p>
                  <p className="mt-2 text-2xl font-bold text-emerald-700">{stats.normal}</p>
                </div>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
