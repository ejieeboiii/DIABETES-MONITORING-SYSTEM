import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { changeProviderPassword } from '../../utils/api';
import { apiErrorMessage } from '../../utils/errors';
import { setAuthNotice } from '../../utils/authNotice';

export default function Account() {
  const { user, updateProfile, logout } = useAuth();
  const [profile, setProfile] = useState({ full_name: user.full_name, profession: user.profession || '' });
  const [password, setPassword] = useState({ current_password: '', new_password: '' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const submit = async (event, kind) => {
    event.preventDefault();
    setBusy(true); setError(''); setMessage('');
    try {
      if (kind === 'profile') { await updateProfile(profile); setMessage('Profile saved.'); }
      else {
        await changeProviderPassword(password);
        setPassword({ current_password: '', new_password: '' });
        setAuthNotice('success', 'Password changed. Sign in with your new password.');
        logout();
      }
    } catch (err) { setError(apiErrorMessage(err)); }
    finally { setBusy(false); }
  };
  const input = 'mt-1 w-full rounded-xl border border-slate-300 p-3';
  return (
    <div className="min-h-full bg-slate-100 p-6 text-slate-800">
      <div className="mx-auto max-w-xl space-y-6">
        <h1 className="text-3xl font-bold">My account</h1>
        {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-rose-700">{error}</p>}
        {message && <p role="status" className="rounded-xl bg-sky-50 p-3">{message}</p>}
        <form onSubmit={(event) => submit(event, 'profile')} className="space-y-4 rounded-2xl bg-white p-5">
          <p className="text-sm text-slate-500">Login email: {user.email}</p>
          {['full_name', 'profession'].map((field) => <label key={field} className="block">{field === 'full_name' ? 'Full name' : 'Profession'}<input className={input} value={profile[field]} required={field === 'full_name'} onChange={(event) => setProfile({ ...profile, [field]: event.target.value })} /></label>)}
          <button disabled={busy} className="rounded-xl bg-sky-600 px-4 py-3 text-white">Save profile</button>
        </form>
        <form onSubmit={(event) => submit(event, 'password')} className="space-y-4 rounded-2xl bg-white p-5">
          <h2 className="font-semibold">Change password</h2>
          <p className="text-sm text-slate-500">Changing your password invalidates previous sessions.</p>
          {['current_password', 'new_password'].map((field) => <label key={field} className="block">{field === 'current_password' ? 'Current password' : 'New password (8 characters minimum)'}<input className={input} type="password" autoComplete={field === 'current_password' ? 'current-password' : 'new-password'} required minLength={field === 'new_password' ? 8 : undefined} maxLength={72} value={password[field]} onChange={(event) => setPassword({ ...password, [field]: event.target.value })} /></label>)}
          <button disabled={busy} className="rounded-xl bg-sky-600 px-4 py-3 text-white">Change password</button>
        </form>
        <button onClick={logout} className="rounded-xl border border-slate-300 bg-white px-4 py-3">Sign out</button>
      </div>
    </div>
  );
}
