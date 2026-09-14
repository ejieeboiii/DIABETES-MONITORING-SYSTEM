import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getLatestReading, resetPatientPassword } from '../utils/api';
import LevelBadge from './LevelBadge';
import PatientCredentialsBanner from './PatientCredentialsBanner';

export default function PatientDetailModal({ patient, onClose, onPasswordReset }) {
  const [latest, setLatest] = useState(null);
  const [loadingReading, setLoadingReading] = useState(true);
  const [resetMode, setResetMode] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState('');
  const [credentials, setCredentials] = useState(null);

  useEffect(() => {
    if (!patient?.id) return;
    setLoadingReading(true);
    getLatestReading(patient.id)
      .then((r) => setLatest(r.data))
      .catch(() => setLatest(null))
      .finally(() => setLoadingReading(false));
  }, [patient?.id]);

  if (!patient) return null;

  const handleReset = async (e) => {
    e.preventDefault();
    setResetting(true);
    setResetError('');
    try {
      const body = newPassword.trim() ? { new_password: newPassword.trim() } : {};
      const res = await resetPatientPassword(patient.id, body);
      setCredentials({ email: res.data.email, password: res.data.temporary_password });
      setNewPassword('');
      setResetMode(false);
      onPasswordReset?.();
    } catch (err) {
      setResetError(err.response?.data?.detail || 'Failed to reset password.');
    } finally {
      setResetting(false);
    }
  };

  const created = patient.created_at
    ? new Date(patient.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })
    : '—';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <button type="button" className="absolute inset-0 bg-black/60" onClick={onClose} aria-label="Close" />
      <div className="relative w-full sm:max-w-lg max-h-[90vh] overflow-auto bg-slate-900 border border-white/10 rounded-t-2xl sm:rounded-2xl shadow-2xl">
        <div className="sticky top-0 bg-slate-900/95 backdrop-blur border-b border-white/10 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 font-bold text-lg">
              {patient.full_name[0]}
            </div>
            <div>
              <h2 className="text-white font-semibold">{patient.full_name}</h2>
              <p className="text-white/40 text-xs">Patient profile</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-white/40 hover:text-white p-2">×</button>
        </div>

        <div className="p-6 space-y-5">
          {credentials && (
            <PatientCredentialsBanner
              email={credentials.email}
              password={credentials.password}
              title="New temporary password"
              onDismiss={() => setCredentials(null)}
            />
          )}

          <div className="grid grid-cols-2 gap-3 text-sm">
            {[
              { label: 'Age', value: `${patient.age} years` },
              { label: 'Gender', value: patient.gender },
              { label: 'Diabetes status', value: patient.is_diabetic || 'Unknown' },
              { label: 'Registered', value: created },
            ].map((row) => (
              <div key={row.label} className="bg-white/3 border border-white/8 rounded-xl px-4 py-3">
                <p className="text-white/40 text-xs uppercase tracking-wider">{row.label}</p>
                <p className="text-white mt-1">{row.value}</p>
              </div>
            ))}
          </div>

          <div className="bg-white/3 border border-white/8 rounded-xl px-4 py-3 space-y-2">
            <p className="text-white/40 text-xs uppercase tracking-wider">Contact & login</p>
            <p className="text-white text-sm break-all">
              <span className="text-white/40">Email: </span>{patient.email}
            </p>
            {patient.contact && (
              <p className="text-white text-sm">
                <span className="text-white/40">Phone: </span>{patient.contact}
              </p>
            )}
            <p className="text-white/30 text-xs">Password is hidden for security. Reset below if the patient forgot it.</p>
          </div>

          <div className="bg-white/3 border border-white/8 rounded-xl p-4">
            <p className="text-white/40 text-xs uppercase tracking-wider mb-2">Latest reading</p>
            {loadingReading ? (
              <p className="text-white/30 text-sm">Loading...</p>
            ) : latest ? (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-white text-xl font-bold">{latest.acetone_ppm} ppm</p>
                  <p className="text-white/40 text-xs mt-1">
                    {new Date(latest.taken_at).toLocaleString()} · {latest.temperature}°C · {latest.humidity}%
                  </p>
                </div>
                <LevelBadge level={latest.diabetes_level} />
              </div>
            ) : (
              <p className="text-white/30 text-sm">No readings recorded yet.</p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              to={`/medical/readings?patient=${patient.id}`}
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-blue-500/20 text-blue-300 text-sm font-medium border border-blue-500/30 hover:bg-blue-500/30"
            >
              View readings
            </Link>
            <Link
              to={`/medical/trends?patient=${patient.id}`}
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white/5 text-white/70 text-sm font-medium border border-white/10 hover:text-white"
            >
              Trends
            </Link>
            <Link
              to={`/medical/livescan?patient=${patient.id}`}
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white/5 text-white/70 text-sm font-medium border border-white/10 hover:text-white"
            >
              Live scan
            </Link>
          </div>

          <div className="border-t border-white/10 pt-4">
            {!resetMode ? (
              <button
                type="button"
                onClick={() => setResetMode(true)}
                className="text-amber-400/90 hover:text-amber-300 text-sm font-medium"
              >
                Reset patient password
              </button>
            ) : (
              <form onSubmit={handleReset} className="space-y-3">
                <p className="text-white/50 text-xs">Leave blank to auto-generate a temporary password.</p>
                <input
                  type="text"
                  placeholder="New password (optional, min 6 chars)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-amber-400/50"
                />
                {resetError && <p className="text-red-400 text-xs">{resetError}</p>}
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={resetting}
                    className="bg-amber-500/80 hover:bg-amber-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-xl"
                  >
                    {resetting ? 'Resetting...' : 'Confirm reset'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setResetMode(false); setNewPassword(''); setResetError(''); }}
                    className="text-white/40 text-sm px-3"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
