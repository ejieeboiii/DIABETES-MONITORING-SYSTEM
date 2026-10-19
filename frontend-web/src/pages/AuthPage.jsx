import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { consumeAuthNotice } from '../utils/authNotice';

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [form, setForm] = useState({ full_name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(() => consumeAuthNotice());
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { loginMedical, registerMedical } = useAuth();
  const navigate = useNavigate();

  const handle = (e) => setForm({ ...form, [e.target.name]: e.target.value });
  const switchMode = (nextIsLogin) => {
    setIsLogin(nextIsLogin);
    setForm({ full_name: '', email: '', password: '' });
    setError('');
    setNotice(null);
    setShowPassword(false);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setNotice(null);
    setLoading(true);
    try {
      if (isLogin) {
        await loginMedical(form.email, form.password);
      } else {
        await registerMedical(form.full_name, form.email, form.password);
      }
      navigate('/medical/dashboard');
    } catch (err) {
      const detail = err.response?.data?.detail;
      const message = Array.isArray(detail)
        ? detail.map((item) => item.msg).join(', ')
        : detail || (err.request && !err.response
          ? 'Cannot reach the server. Start the backend on port 8001.'
          : err.response?.status
            ? `Request failed (${err.response.status}). Please try again.`
            : err.message || 'Something went wrong. Please try again.');
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen overflow-hidden bg-slate-100 text-slate-800">
      <div className="mx-auto grid min-h-screen max-w-[1500px] grid-cols-1 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative hidden overflow-hidden bg-slate-50 px-10 py-10 lg:flex lg:flex-col xl:px-16">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(14,165,233,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(14,165,233,0.04)_1px,transparent_1px)] bg-[size:64px_64px]" />
          <div className="relative flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 via-sky-500 to-blue-600 text-lg font-bold text-white shadow-lg shadow-sky-500/20">B</div>
            <div>
              <p className="text-xl font-bold tracking-tight text-slate-900">BreathDx</p>
              <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-500">Health Monitoring System</p>
            </div>
          </div>
          <div className="relative mt-24 max-w-xl xl:mt-28">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-600">Breathe today,</p>
            <h1 className="mt-3 text-5xl font-bold leading-tight tracking-tight text-slate-900 xl:text-6xl">A <span className="text-sky-600">Healthier</span> Tomorrow</h1>
            <p className="mt-5 max-w-md text-lg leading-relaxed text-slate-500">Non-invasive diabetes monitoring system using breath analysis for a healthier you.</p>
            <div className="mt-10 flex flex-wrap gap-8">
              {[
                { label: 'Safe', detail: 'Non-invasive', color: 'bg-sky-100 text-sky-600', icon: '+' },
                { label: 'Real-time', detail: 'Instant results', color: 'bg-emerald-100 text-emerald-600', icon: 'o' },
                { label: 'Track', detail: 'Monitor your trends', color: 'bg-indigo-100 text-indigo-600', icon: '^' },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl text-lg font-bold ${item.color}`}>{item.icon}</div>
                  <div><p className="text-sm font-semibold text-slate-800">{item.label}</p><p className="text-xs text-slate-500">{item.detail}</p></div>
                </div>
              ))}
            </div>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-64 overflow-hidden">
            <div className="absolute -bottom-40 -left-20 h-72 w-[80%] rounded-[50%] border-t-2 border-sky-300/70 bg-sky-100/50 blur-[1px]" />
            <div className="absolute bottom-16 left-[38%] flex h-36 w-36 items-center justify-center rounded-full border border-sky-300/70 bg-white/70 shadow-[0_0_50px_rgba(14,165,233,0.18)]"><div className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-sky-400 text-4xl text-sky-500">o</div></div>
            <div className="absolute bottom-32 left-[55%] rounded-2xl border border-sky-200 bg-white/80 px-4 py-3 shadow-sm"><p className="text-[10px] text-slate-500">Raw sensor acquisition</p><p className="text-lg font-bold text-emerald-600">Calibration pending</p></div>
          </div>
        </section>

        <section className="flex min-h-screen items-center justify-center px-4 py-8 sm:px-8 lg:px-12">
          <div className="w-full max-w-[560px] rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/60 sm:p-8 lg:p-10">
            <div className="mb-7"><p className="text-xs font-semibold uppercase tracking-[0.25em] text-sky-600">Healthcare provider portal</p><h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{isLogin ? 'Sign in to your account' : 'Create provider account'}</h2><p className="mt-2 text-sm text-slate-500">Access clinic monitoring tools and patient records.</p></div>
            <div className="mb-6 flex rounded-2xl bg-slate-100 p-1"><button type="button" onClick={() => switchMode(true)} className={`flex-1 rounded-xl py-2.5 text-sm font-medium transition-all ${isLogin ? 'bg-sky-600 text-white shadow-lg shadow-sky-600/20' : 'text-slate-500 hover:text-slate-900'}`}>Login</button><button type="button" onClick={() => switchMode(false)} className={`flex-1 rounded-xl py-2.5 text-sm font-medium transition-all ${!isLogin ? 'bg-sky-600 text-white shadow-lg shadow-sky-600/20' : 'text-slate-500 hover:text-slate-900'}`}>Register</button></div>
            <form onSubmit={submit} className="space-y-5">
              {!isLogin && <div><label className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Full Name</label><input aria-label="Full name" name="full_name" type="text" placeholder="Dr. Juan Dela Cruz" value={form.full_name} onChange={handle} required className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100" /></div>}
              <div><label className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Email</label><input aria-label="Email" autoComplete="email" name="email" type="email" placeholder="provider@hospital.com" value={form.email} onChange={handle} required className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100" /></div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Password</label>
                <div className="mt-2 flex items-center rounded-xl border border-slate-200 bg-white shadow-sm transition focus-within:border-sky-400 focus-within:ring-4 focus-within:ring-sky-100">
                  <input aria-label="Password" autoComplete={isLogin ? "current-password" : "new-password"} minLength={isLogin ? undefined : 8} name="password" type={showPassword ? 'text' : 'password'} placeholder="********" value={form.password} onChange={handle} required className="min-w-0 flex-1 rounded-xl border-0 bg-transparent px-4 py-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:ring-0" />
                  <button type="button" onClick={() => setShowPassword((visible) => !visible)} className="flex h-10 w-12 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:text-sky-600" aria-label={showPassword ? 'Hide password' : 'Show password'}>
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                      {showPassword ? <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" strokeLinecap="round" strokeLinejoin="round" /><circle cx="12" cy="12" r="2.5" /></> : <><path d="M3 3l18 18" strokeLinecap="round" /><path d="M10.6 6.2A9.8 9.8 0 0 1 12 6c6 0 9.5 6 9.5 6a16.8 16.8 0 0 1-3.2 3.8M6.2 6.3C3.9 7.8 2.5 12 2.5 12s3.5 6 9.5 6c1.2 0 2.3-.2 3.3-.6" strokeLinecap="round" strokeLinejoin="round" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" strokeLinecap="round" /></>}
                    </svg>
                  </button>
                </div>
              </div>
              {notice && <div role="alert" className={`rounded-xl border px-4 py-3 text-sm ${notice.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}><div className="flex items-start justify-between gap-2"><p>{notice.message}</p><button type="button" onClick={() => setNotice(null)} className="shrink-0 text-slate-400 hover:text-slate-800" aria-label="Dismiss">x</button></div></div>}
              {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div>}
              <button type="submit" disabled={loading} className="mt-2 w-full rounded-xl bg-sky-600 py-3 font-semibold text-white shadow-lg shadow-sky-600/20 transition-all hover:bg-sky-500 disabled:opacity-50">{loading ? 'Please wait...' : isLogin ? 'Login as Provider' : 'Create Provider Account'}</button>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}
