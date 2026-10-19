import { useState } from 'react';
import { updatePatientDetails } from '../utils/api';
import { apiErrorMessage } from '../utils/errors';

export default function PatientEditForm({ patient, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ full_name: patient.full_name, age: patient.age, gender: patient.gender, contact: patient.contact || '', is_diabetic: patient.is_diabetic || 'Unknown' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await updatePatientDetails(patient.id, { ...form, age: Number(form.age) });
      onSaved?.(response.data); setEditing(false);
    } catch (err) { setError(apiErrorMessage(err)); }
    finally { setBusy(false); }
  };
  if (!editing) return <button type="button" onClick={() => setEditing(true)} className="text-sky-300">Edit patient details</button>;
  return <form onSubmit={save} className="space-y-3 text-slate-100">
    {['full_name', 'age', 'gender', 'contact', 'is_diabetic'].map((field) => <label key={field} className="block text-sm">{{ full_name: 'Full name', age: 'Age', gender: 'Gender', contact: 'Contact', is_diabetic: 'Reported diabetes status' }[field]}<input className="mt-1 block w-full rounded-lg border border-slate-600 bg-slate-800 p-2" type={field === 'age' ? 'number' : 'text'} required={field !== 'contact'} min={field === 'age' ? 0 : undefined} max={field === 'age' ? 130 : undefined} value={form[field]} onChange={(event) => setForm({ ...form, [field]: event.target.value })} /></label>)}
    {error && <p role="alert" className="text-rose-300">{error}</p>}
    <button disabled={busy} className="rounded-lg bg-sky-700 px-4 py-2">Save details</button>
    <button type="button" disabled={busy} onClick={() => setEditing(false)} className="ml-3 rounded-lg border px-4 py-2">Cancel</button>
  </form>;
}
