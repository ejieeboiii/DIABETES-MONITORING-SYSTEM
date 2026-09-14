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

  if (loading) return <div className="flex-1 flex items-center justify-center bg-slate-950"><div className="text-white/30 text-sm">Loading...</div></div>;

  return (
    <div className="flex-1 bg-slate-950 overflow-auto">
      <div className="p-8 max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Readings History</h1>
          <p className="text-white/30 text-sm mt-1">{filtered.length} total readings</p>
        </div>

        <div className="flex gap-2 mb-6 flex-wrap">
          <button onClick={() => setSelected('all')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${selected === 'all' ? 'bg-blue-500 text-white' : 'bg-white/5 text-white/40 hover:text-white border border-white/10'}`}>
            All Patients
          </button>
          {patients.map(p => (
            <button key={p.id} onClick={() => setSelected(String(p.id))}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${selected === String(p.id) ? 'bg-blue-500 text-white' : 'bg-white/5 text-white/40 hover:text-white border border-white/10'}`}>
              {p.full_name}
            </button>
          ))}
        </div>

        {chartData.length > 1 && (
          <div className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-6">
            <h3 className="text-white font-medium text-sm mb-4">Acetone PPM Trend</h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="time" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} />
                <YAxis tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: 'white' }} />
                <ReferenceLine y={1.8} stroke="rgba(234,179,8,0.4)" strokeDasharray="4 4" label={{ value: 'Pre-Diabetic', fill: 'rgba(234,179,8,0.6)', fontSize: 10 }} />
                <ReferenceLine y={3.5} stroke="rgba(239,68,68,0.4)" strokeDasharray="4 4" label={{ value: 'Diabetic', fill: 'rgba(239,68,68,0.6)', fontSize: 10 }} />
                <Line type="monotone" dataKey="ppm" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6', r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="bg-white/3 border border-white/8 rounded-2xl overflow-hidden">
          {filtered.length === 0 ? (
            <div className="py-20 text-center text-white/20 text-sm">No readings found.</div>
          ) : (
            <>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/5">
                    {['Patient', 'Acetone PPM', 'Est. Glucose', 'Temp', 'Humidity', 'Level', 'Date', ''].map(h => (
                      <th key={h} className="text-left px-6 py-3 text-white/30 text-xs font-medium uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((r) => (
                    <tr key={r.id} className="border-b border-white/3 hover:bg-white/2 transition-colors">
                      <td className="px-6 py-3 text-white/70 text-sm">{patientName(r.patient_id)}</td>
                      <td className="px-6 py-3 text-white font-mono text-sm">{r.acetone_ppm}</td>
                      <td className="px-6 py-3 text-emerald-400 text-sm font-medium">
                        {r.estimated_glucose_mg_dl ? `${r.estimated_glucose_mg_dl} mg/dL` : '—'}
                        {r.glucose_level && <span className="text-white/50 text-xs ml-1">({r.glucose_level})</span>}
                      </td>
                      <td className="px-6 py-3 text-white/50 text-sm">{r.temperature}°C</td>
                      <td className="px-6 py-3 text-white/50 text-sm">{r.humidity}%</td>
                      <td className="px-6 py-3">
                        <span className={`inline-flex px-2.5 py-0.5 rounded-lg text-xs font-medium border ${levelBg[r.diabetes_level]} ${levelColor[r.diabetes_level]}`}>
                          {r.diabetes_level}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-white/30 text-xs">{new Date(r.taken_at).toLocaleString()}</td>
                      <td className="px-6 py-3">
                        <button onClick={() => remove(r.id)} className="text-white/20 hover:text-red-400 transition-colors">
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
                <div className="px-6 py-4 border-t border-white/5 flex items-center justify-between">
                  <div className="text-white/40 text-sm">
                    Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filtered.length)} of {filtered.length} readings
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="px-3 py-1.5 rounded-lg text-sm font-medium bg-white/5 text-white/40 hover:text-white hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Previous
                    </button>
                    <span className="px-3 py-1.5 text-sm text-white/60">
                      Page {currentPage} of {totalPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="px-3 py-1.5 rounded-lg text-sm font-medium bg-white/5 text-white/40 hover:text-white hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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