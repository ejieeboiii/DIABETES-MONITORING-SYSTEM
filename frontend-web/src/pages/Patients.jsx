import { useEffect, useState } from 'react';
import { getPatients, addPatient, deletePatient } from '../utils/api';
import { useNavigate } from 'react-router-dom';

export default function Patients() {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ full_name: '', age: '', gender: 'Male', contact: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const load = () => getPatients().then(r => setPatients(r.data)).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const handle = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await addPatient({ ...form, age: parseInt(form.age) });
      setForm({ full_name: '', age: '', gender: 'Male', contact: '' });
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to add patient.');
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (id, name) => {
    if (!confirm(`Delete patient "${name}"? This will also delete all their readings.`)) return;
    await deletePatient(id);
    load();
  };

  if (loading) return <div className="flex-1 flex items-center justify-center bg-slate-950"><div className="text-white/30 text-sm">Loading...</div></div>;

  return (
    <div className="flex-1 bg-slate-950 overflow-auto">
      <div className="p-8 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Patients</h1>
            <p className="text-white/30 text-sm mt-1">{patients.length} registered patient{patients.length !== 1 ? 's' : ''}</p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 bg-blue-500 hover:bg-blue-400 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-all shadow-lg shadow-blue-500/20"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Patient
          </button>
        </div>

        {/* Add Patient Form */}
        {showForm && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-6">
            <h3 className="text-white font-semibold mb-4">New Patient</h3>
            <form onSubmit={submit} className="grid grid-cols-2 gap-4">
              <div className="col-span-2 md:col-span-1">
                <label className="text-xs text-white/40 uppercase tracking-wider">Full Name</label>
                <input name="full_name" value={form.full_name} onChange={handle} required placeholder="Juan Dela Cruz"
                  className="mt-1 w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-white/20 focus:outline-none focus:border-blue-400/50 text-sm" />
              </div>
              <div>
                <label className="text-xs text-white/40 uppercase tracking-wider">Age</label>
                <input name="age" type="number" value={form.age} onChange={handle} required placeholder="45" min="1" max="120"
                  className="mt-1 w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-white/20 focus:outline-none focus:border-blue-400/50 text-sm" />
              </div>
              <div>
                <label className="text-xs text-white/40 uppercase tracking-wider">Gender</label>
                <select name="gender" value={form.gender} onChange={handle}
                  className="mt-1 w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-blue-400/50 text-sm">
                  <option>Male</option>
                  <option>Female</option>
                  <option>Other</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-white/40 uppercase tracking-wider">Contact (Optional)</label>
                <input name="contact" value={form.contact} onChange={handle} placeholder="09XX-XXX-XXXX"
                  className="mt-1 w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-white/20 focus:outline-none focus:border-blue-400/50 text-sm" />
              </div>
              {error && <div className="col-span-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2">{error}</div>}
              <div className="col-span-2 flex gap-3">
                <button type="submit" disabled={submitting}
                  className="bg-blue-500 hover:bg-blue-400 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-all">
                  {submitting ? 'Saving...' : 'Save Patient'}
                </button>
                <button type="button" onClick={() => setShowForm(false)}
                  className="text-white/40 hover:text-white px-4 py-2.5 rounded-xl text-sm transition-colors">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Patients List */}
        {patients.length === 0 ? (
          <div className="bg-white/3 border border-white/8 rounded-2xl py-20 text-center">
            <p className="text-white/20 text-sm">No patients yet. Add your first patient!</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {patients.map((p) => (
              <div key={p.id} className="bg-white/3 border border-white/8 rounded-2xl px-6 py-4 flex items-center justify-between hover:bg-white/5 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 font-bold">
                    {p.full_name[0]}
                  </div>
                  <div>
                    <p className="text-white font-medium text-sm">{p.full_name}</p>
                    <p className="text-white/30 text-xs">{p.age} yrs • {p.gender} {p.contact && `• ${p.contact}`}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => navigate(`/readings?patient=${p.id}`)}
                    className="text-blue-400 hover:text-blue-300 text-xs px-3 py-1.5 rounded-lg border border-blue-500/20 hover:border-blue-400/40 transition-all">
                    View Readings
                  </button>
                  <button onClick={() => remove(p.id, p.full_name)}
                    className="text-white/20 hover:text-red-400 p-1.5 rounded-lg transition-colors">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}