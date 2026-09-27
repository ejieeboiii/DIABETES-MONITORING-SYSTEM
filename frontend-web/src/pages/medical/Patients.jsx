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

  if (loading) return <div className="flex-1 flex items-center justify-center bg-slate-100"><div className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-500 shadow-sm">Loading patients...</div></div>;

  return (
    <div className="min-h-full flex-1 overflow-auto bg-slate-100 text-slate-800">
      <div className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-sky-600">Care directory</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Patients</h1>
            <p className="mt-1 text-sm text-slate-500">{patients.length} registered · select a patient for details</p>
          </div>
          <button onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-sky-600/20 transition-all hover:bg-sky-500">
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
          <div className="mb-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/50 sm:p-6">
            <h3 className="mb-1 text-lg font-semibold text-slate-900">New Patient Account</h3>
            <p className="mb-4 text-sm text-slate-500">Credentials are shown once after you save.</p>
            <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {[
                { name: 'full_name', label: 'Full Name', placeholder: 'Juan Dela Cruz', type: 'text' },
                { name: 'email', label: 'Email', placeholder: 'patient@email.com', type: 'email' },
                { name: 'password', label: 'Password', placeholder: 'Set patient password', type: 'password' },
                { name: 'age', label: 'Age', placeholder: '45', type: 'number' },
                { name: 'contact', label: 'Contact (Optional)', placeholder: '09XX-XXX-XXXX', type: 'text' },
              ].map((f) => (
                <div key={f.name}>
                  <label className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{f.label}</label>
                  <input name={f.name} type={f.type} placeholder={f.placeholder} value={form[f.name]} onChange={handle}
                    required={f.name !== 'contact'}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100" />
                </div>
              ))}
              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Gender</label>
                <select name="gender" value={form.gender} onChange={handle}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100">
                  <option>Male</option><option>Female</option><option>Other</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Diabetes Status</label>
                <select name="is_diabetic" value={form.is_diabetic} onChange={handle}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100">
                  <option>Unknown</option><option>Diabetic</option><option>Non-Diabetic</option>
                </select>
              </div>
              {error && <div className="sm:col-span-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}
              <div className="flex gap-3 sm:col-span-2">
                <button type="submit" disabled={submitting}
                  className="rounded-xl bg-sky-600 px-6 py-2.5 text-sm font-medium text-white transition-all hover:bg-sky-500 disabled:opacity-50">
                  {submitting ? 'Saving...' : 'Save Patient'}
                </button>
                <button type="button" onClick={() => setShowForm(false)}
                  className="rounded-xl px-4 py-2.5 text-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800">Cancel</button>
              </div>
            </form>
          </div>
        )}

        {patients.length === 0 ? (
          <div className="rounded-3xl border border-slate-200 bg-white py-20 text-center shadow-sm">
            <p className="text-sm text-slate-500">No patients yet. Add your first patient!</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {patients.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedPatient(p)}
                className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-4 text-left shadow-sm transition-colors hover:border-sky-200 hover:bg-sky-50/40 sm:px-6"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-100 bg-sky-50 font-bold text-sky-700">
                    {p.full_name[0]}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{p.full_name}</p>
                    <p className="text-xs text-slate-500">{p.age} yrs • {p.gender} • {p.is_diabetic}</p>
                    <p className="text-xs text-slate-400">{p.email}{p.contact ? ` • ${p.contact}` : ''}</p>
                  </div>
                </div>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => remove(e, p.id, p.full_name)}
                  onKeyDown={(e) => e.key === 'Enter' && remove(e, p.id, p.full_name)}
                  className="rounded-lg p-1.5 text-slate-300 transition-colors hover:text-rose-500"
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
