import { useEffect, useState } from 'react';
import { getPatients, addPatient, deletePatient } from '../../utils/api';
import PatientDetailModal from '../../components/PatientDetailModal';
import PatientCredentialsBanner from '../../components/PatientCredentialsBanner';

export default function Patients() {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ full_name: '', email: '', password: '', age: '', gender: 'Male', contact: '', is_diabetic: 'Unknown' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [newAccountCredentials, setNewAccountCredentials] = useState(null);

  const load = () => getPatients().then((r) => setPatients(r.data)).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const handle = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    const passwordUsed = form.password;
    const emailUsed = form.email;
    try {
      await addPatient({ ...form, age: parseInt(form.age, 10) });
      setNewAccountCredentials({ email: emailUsed, password: passwordUsed });
      setForm({ full_name: '', email: '', password: '', age: '', gender: 'Male', contact: '', is_diabetic: 'Unknown' });
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to add patient.');
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (e, id, name) => {
    e.stopPropagation();
    if (!confirm(`Delete patient "${name}"?`)) return;
    await deletePatient(id);
    if (selectedPatient?.id === id) setSelectedPatient(null);
    load();
  };

  if (loading) return <div className="flex-1 flex items-center justify-center bg-slate-950"><div className="text-white/30 text-sm">Loading...</div></div>;

  return (
    <div className="flex-1 bg-slate-950 overflow-auto">
      <div className="p-8 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Patients</h1>
            <p className="text-white/30 text-sm mt-1">{patients.length} registered · tap a row for details</p>
          </div>
          <button onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 bg-blue-500 hover:bg-blue-400 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-all shadow-lg shadow-blue-500/20">
            + Add Patient
          </button>
        </div>

        {newAccountCredentials && (
          <PatientCredentialsBanner
            email={newAccountCredentials.email}
            password={newAccountCredentials.password}
            title="Patient account created — login credentials"
            onDismiss={() => setNewAccountCredentials(null)}
          />
        )}

        {showForm && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-6">
            <h3 className="text-white font-semibold mb-1">New Patient Account</h3>
            <p className="text-white/35 text-xs mb-4">Credentials are shown once after you save.</p>
            <form onSubmit={submit} className="grid grid-cols-2 gap-4">
              {[
                { name: 'full_name', label: 'Full Name', placeholder: 'Juan Dela Cruz', type: 'text' },
                { name: 'email', label: 'Email', placeholder: 'patient@email.com', type: 'email' },
                { name: 'password', label: 'Password', placeholder: 'Set patient password', type: 'password' },
                { name: 'age', label: 'Age', placeholder: '45', type: 'number' },
                { name: 'contact', label: 'Contact (Optional)', placeholder: '09XX-XXX-XXXX', type: 'text' },
              ].map((f) => (
                <div key={f.name}>
                  <label className="text-xs text-white/40 uppercase tracking-wider">{f.label}</label>
                  <input name={f.name} type={f.type} placeholder={f.placeholder} value={form[f.name]} onChange={handle}
                    required={f.name !== 'contact'}
                    className="mt-1 w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-white/20 focus:outline-none focus:border-blue-400/50 text-sm" />
                </div>
              ))}
              <div>
                <label className="text-xs text-white/40 uppercase tracking-wider">Gender</label>
                <select name="gender" value={form.gender} onChange={handle}
                  className="mt-1 w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none text-sm">
                  <option>Male</option><option>Female</option><option>Other</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-white/40 uppercase tracking-wider">Diabetes Status</label>
                <select name="is_diabetic" value={form.is_diabetic} onChange={handle}
                  className="mt-1 w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none text-sm">
                  <option>Unknown</option><option>Diabetic</option><option>Non-Diabetic</option>
                </select>
              </div>
              {error && <div className="col-span-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2">{error}</div>}
              <div className="col-span-2 flex gap-3">
                <button type="submit" disabled={submitting}
                  className="bg-blue-500 hover:bg-blue-400 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-all">
                  {submitting ? 'Saving...' : 'Save Patient'}
                </button>
                <button type="button" onClick={() => setShowForm(false)}
                  className="text-white/40 hover:text-white px-4 py-2.5 rounded-xl text-sm transition-colors">Cancel</button>
              </div>
            </form>
          </div>
        )}

        {patients.length === 0 ? (
          <div className="bg-white/3 border border-white/8 rounded-2xl py-20 text-center">
            <p className="text-white/20 text-sm">No patients yet. Add your first patient!</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {patients.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedPatient(p)}
                className="w-full text-left bg-white/3 border border-white/8 rounded-2xl px-6 py-4 flex items-center justify-between hover:bg-white/5 hover:border-blue-500/20 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 font-bold">
                    {p.full_name[0]}
                  </div>
                  <div>
                    <p className="text-white font-medium text-sm">{p.full_name}</p>
                    <p className="text-white/30 text-xs">{p.age} yrs • {p.gender} • {p.is_diabetic}</p>
                    <p className="text-white/20 text-xs">{p.email}{p.contact ? ` • ${p.contact}` : ''}</p>
                  </div>
                </div>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => remove(e, p.id, p.full_name)}
                  onKeyDown={(e) => e.key === 'Enter' && remove(e, p.id, p.full_name)}
                  className="text-white/20 hover:text-red-400 p-1.5 rounded-lg transition-colors"
                  aria-label="Delete patient"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedPatient && (
        <PatientDetailModal
          patient={selectedPatient}
          onClose={() => setSelectedPatient(null)}
        />
      )}
    </div>
  );
}
