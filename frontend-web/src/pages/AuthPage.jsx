import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { consumeAuthNotice } from '../utils/authNotice';

export default function AuthPage() {
  const [userRole, setUserRole] = useState('patient');
  const [isLogin, setIsLogin] = useState(true);
  const [form, setForm] = useState({ full_name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const authNotice = consumeAuthNotice();
    if (authNotice?.message) setNotice(authNotice);
  }, []);

  const isProvider = userRole === 'medical';

  const handle = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setNotice(null);
    setLoading(true);
    try {
      let authData;
      if (isLogin) {
        authData = await login(form.email, form.password, userRole);
      } else {
        authData = await register(form.full_name, form.email, form.password);
      }
      navigate(authData.role === 'patient' ? '/patient/dashboard' : '/medical/dashboard');
    } catch (err) {
      const detail = err.response?.data?.detail;
      const message = Array.isArray(detail)
        ? detail.map((item) => item.msg).join(', ')
        : detail || (err.request && !err.response
          ? 'Cannot reach the server. Start the backend (uvicorn) on port 8000.'
          : 'Something went wrong. Please try again.');
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(59,130,246,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.03)_1px,transparent_1px)] bg-[size:64px_64px]" />

      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <div className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl ${isProvider ? 'bg-blue-500/10 border-blue-500/20' : 'bg-emerald-500/10 border-emerald-500/20'} border mb-4`}>
            <svg className={`w-8 h-8 ${isProvider ? 'text-blue-400' : 'text-emerald-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">BreathDx</h1>
          <p className="text-blue-300/60 text-sm mt-1">Health Monitoring System</p>
        </div>

        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
          <div className="flex bg-white/5 rounded-xl p-1 mb-6">
            <button
              type="button"
              onClick={() => { setUserRole('patient'); setIsLogin(true); setError(''); setNotice(null); }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${userRole === 'patient' ? 'bg-emerald-500 text-white shadow-lg' : 'text-white/50 hover:text-white'}`}
            >
              Patient
            </button>
            <button
              type="button"
              onClick={() => { setUserRole('medical'); setError(''); setNotice(null); }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${userRole === 'medical' ? 'bg-blue-500 text-white shadow-lg' : 'text-white/50 hover:text-white'}`}
            >
              Healthcare Provider
            </button>
          </div>

          <p className="text-white/40 text-xs text-center mb-4">
            {isProvider ? 'For hospital staff and clinicians' : 'For personal health monitoring'}
          </p>

          {isProvider && (
            <div className="flex bg-white/5 rounded-xl p-1 mb-6">
              <button
                type="button"
                onClick={() => { setIsLogin(true); setError(''); setNotice(null); }}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${isLogin ? 'bg-blue-500 text-white shadow-lg' : 'text-white/50 hover:text-white'}`}
              >
                Login
              </button>
              <button
                type="button"
                onClick={() => { setIsLogin(false); setError(''); setNotice(null); }}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${!isLogin ? 'bg-blue-500 text-white shadow-lg' : 'text-white/50 hover:text-white'}`}
              >
                Register
              </button>
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            {!isLogin && isProvider && (
              <div>
                <label className="text-xs font-medium text-blue-300/70 uppercase tracking-wider">Full Name</label>
                <input
                  name="full_name"
                  type="text"
                  placeholder="Dr. Juan Dela Cruz"
                  value={form.full_name}
                  onChange={handle}
                  required
                  className="mt-1 w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-blue-400/50 text-sm"
                />
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-blue-300/70 uppercase tracking-wider">Email</label>
              <input
                name="email"
                type="email"
                placeholder={isProvider ? 'provider@hospital.com' : 'patient@email.com'}
                value={form.email}
                onChange={handle}
                required
                className="mt-1 w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-blue-400/50 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-blue-300/70 uppercase tracking-wider">Password</label>
              <input
                name="password"
                type="password"
                placeholder="••••••••"
                value={form.password}
                onChange={handle}
                required
                className="mt-1 w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-blue-400/50 text-sm"
              />
            </div>

            {!isProvider && (
              <p className="text-white/30 text-xs">
                Patient accounts are created by your healthcare provider. Use the credentials they gave you.
              </p>
            )}

            {notice && (
              <div
                role="alert"
                className={`rounded-xl px-4 py-3 text-sm border ${
                  notice.type === 'success'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p>{notice.message}</p>
                  <button
                    type="button"
                    onClick={() => setNotice(null)}
                    className="text-white/40 hover:text-white shrink-0"
                    aria-label="Dismiss"
                  >
                    ×
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={`w-full ${isProvider ? 'bg-blue-500 hover:bg-blue-400 shadow-blue-500/20' : 'bg-emerald-500 hover:bg-emerald-400 shadow-emerald-500/20'} disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-all shadow-lg mt-2`}
            >
              {loading ? 'Please wait...' : isLogin ? (isProvider ? 'Login as Provider' : 'Login as Patient') : 'Create Provider Account'}
            </button>
          </form>

        </div>
      </div>
    </div>
  );
}
