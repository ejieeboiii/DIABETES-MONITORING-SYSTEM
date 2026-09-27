import { useEffect, useState } from 'react';
import { getAllReadings, getPatients, deleteReading } from '../../utils/api';
import { useSearchParams } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

const levelColor = { Normal: 'text-emerald-400', 'Pre-Diabetic': 'text-yellow-400', Diabetic: 'text-red-400' };
const levelBg = { Normal: 'bg-emerald-500/10 border-emerald-500/20', 'Pre-Diabetic': 'bg-yellow-500/10 border-yellow-500/20', Diabetic: 'bg-red-500/10 border-red-500/20' };

export default function Readings() {
  const [readings, setReadings] = useState([]);
  const [patients, setPatients] = useState([]);
  const [selected, setSelected] = useState('all');
  const [loading, setLoading] = useState(true);
  const [searchParams] = useSearchParams();
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  useEffect(() => {
    const pid = searchParams.get('patient');
    if (pid) setSelected(pid);
    Promise.all([getAllReadings(), getPatients()])
      .then(([r, p]) => { setReadings(r.data); setPatients(p.data); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [selected]);

  const filtered = selected === 'all' ? readings : readings.filter(r => r.patient_id === parseInt(selected));
  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const chartData = [...filtered].reverse().slice(-20).map(r => ({
    time: new Date(r.taken_at).toLocaleDateString(),
    ppm: r.acetone_ppm,
  }));

  const remove = async (id) => {
    if (!confirm('Delete this reading?')) return;
    await deleteReading(id);
    const r = await getAllReadings();
    setReadings(r.data);
  };

  const patientName = (id) => patients.find(p => p.id === id)?.full_name || `Patient #${id}`;

  if (loading) return <div className="flex-1 flex items-center justify-center bg-slate-100"><div className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-500 shadow-sm">Loading readings...</div></div>;

  return (
    <div className="min-h-full flex-1 overflow-auto bg-slate-100 text-slate-800">
      <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
        <div className="mb-6">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-sky-600">Monitoring records</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Readings History</h1>
          <p className="mt-1 text-sm text-slate-500">{filtered.length} total readings</p>
        </div>

        <div className="mb-6 flex flex-wrap gap-2">
          <button onClick={() => setSelected('all')}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition-all ${selected === 'all' ? 'bg-sky-600 text-white shadow-sm' : 'border border-slate-200 bg-white text-slate-500 hover:border-sky-200 hover:text-sky-700'}`}>
            All Patients
          </button>
          {patients.map(p => (
            <button key={p.id} onClick={() => setSelected(String(p.id))}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition-all ${selected === String(p.id) ? 'bg-sky-600 text-white shadow-sm' : 'border border-slate-200 bg-white text-slate-500 hover:border-sky-200 hover:text-sky-700'}`}>
              {p.full_name}
            </button>
          ))}
        </div>

        {chartData.length > 1 && (
          <div className="mb-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/50 sm:p-6">
            <h3 className="mb-4 text-lg font-semibold text-slate-900">Acetone PPM Trend</h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 11 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', color: '#0f172a' }} />
                <ReferenceLine y={1.8} stroke="rgba(234,179,8,0.4)" strokeDasharray="4 4" label={{ value: 'Pre-Diabetic', fill: 'rgba(234,179,8,0.6)', fontSize: 10 }} />
                <ReferenceLine y={3.5} stroke="rgba(239,68,68,0.4)" strokeDasharray="4 4" label={{ value: 'Diabetic', fill: 'rgba(239,68,68,0.6)', fontSize: 10 }} />
                <Line type="monotone" dataKey="ppm" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6', r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm shadow-slate-200/50">
          {filtered.length === 0 ? (
            <div className="py-20 text-center text-sm text-slate-500">No readings found.</div>
          ) : (
            <>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80">
                    {['Patient', 'Acetone PPM', 'Est. Glucose', 'Temp', 'Humidity', 'Level', 'Date', ''].map(h => (
                      <th key={h} className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 sm:px-6">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((r) => (
                    <tr key={r.id} className="border-b border-slate-200 last:border-b-0 transition-colors hover:bg-slate-50/70">
                      <td className="px-5 py-3 text-sm font-medium text-slate-700 sm:px-6">{patientName(r.patient_id)}</td>
                      <td className="px-5 py-3 font-mono text-sm text-slate-800 sm:px-6">{r.acetone_ppm}</td>
                      <td className="px-5 py-3 text-sm font-semibold text-slate-800 sm:px-6">
                        {r.estimated_glucose_mg_dl ? `${r.estimated_glucose_mg_dl} mg/dL` : '—'}
                        {r.glucose_level && <span className="ml-1 text-xs font-medium text-slate-400">({r.glucose_level})</span>}
                      </td>
                      <td className="px-5 py-3 text-sm text-slate-600 sm:px-6">{r.temperature}°C</td>
                      <td className="px-5 py-3 text-sm text-slate-600 sm:px-6">{r.humidity}%</td>
                      <td className="px-5 py-3 sm:px-6">
                        <span className={`inline-flex rounded-lg border px-2.5 py-0.5 text-xs font-medium ${r.diabetes_level === 'Normal' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : r.diabetes_level === 'Pre-Diabetic' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
                          {r.diabetes_level}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-500 sm:px-6">{new Date(r.taken_at).toLocaleString()}</td>
                      <td className="px-5 py-3 sm:px-6">
                        <button onClick={() => remove(r.id)} className="text-slate-300 transition-colors hover:text-rose-500">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-slate-200 px-5 py-4 sm:px-6">
                  <div className="text-sm text-slate-500">
                    Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filtered.length)} of {filtered.length} readings
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <span className="px-3 py-1.5 text-sm text-slate-500">
                      Page {currentPage} of {totalPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}