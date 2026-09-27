import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLogout } from '../hooks/useLogout';

const links = [
  { to: '/patient/dashboard', label: 'My Dashboard', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /> },
  { to: '/patient/results', label: 'My Results', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" /> },
  { to: '/patient/trend', label: 'My Trend', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" /> },
  { to: '/patient/tips', label: 'Health Tips', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" /> },
];

export default function PatientSidebar() {
  const { user } = useAuth();
  const { handleLogout, loggingOut } = useLogout();
  const location = useLocation();

  return (
    <aside className="w-full max-w-[280px] shrink-0 border-b border-slate-700 bg-slate-800 shadow-xl shadow-slate-900/10 backdrop-blur-xl lg:h-full lg:border-b-0 lg:border-r">
      <div className="flex items-center gap-3 border-b border-slate-700 p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 via-sky-500 to-blue-600 text-lg font-bold text-white shadow-lg shadow-sky-500/20">
            <svg viewBox="0 0 48 48" fill="none" className="h-9 w-9" aria-label="BreathDx logo" role="img">
              <path d="M16 8h12c6 0 10 3.5 10 8.5 0 3.3-1.9 5.8-5.1 7.1 3.7 1.2 5.8 3.9 5.8 7.5C38.7 36.8 34 40 27 40H16V8Z" fill="white" fillOpacity="0.96" />
              <path d="M23 14v8h6c2.7 0 4.4-1.4 4.4-4s-1.7-4-4.4-4H23ZM23 27v8h4.7c3.2 0 5.1-1.4 5.1-4s-1.9-4-5.1-4H23Z" fill="#1687df" />
              <path d="M10 23c4.2 4.1 8.3 4.1 12.5 0M10 28c4.2 4.1 8.3 4.1 12.5 0" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M34.5 30.5c0 3-2.2 5.1-4.8 5.1s-4.8-2.1-4.8-5.1c0-2.5 4.8-8.2 4.8-8.2s4.8 5.7 4.8 8.2Z" fill="#1687df" stroke="white" strokeWidth="1.4" />
              <path d="M29.7 29.4v2.8M28.3 30.8h2.8" stroke="white" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <p className="text-lg font-bold tracking-tight text-white">BreathDx</p>
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-sky-300">Patient Portal</p>
          </div>
        </div>
      </div>
      <nav className="flex flex-wrap gap-2 overflow-hidden p-4 lg:flex-col lg:flex-nowrap">
        {links.map((link) => (
          <NavLink key={link.to} to={link.to}
            className={({ isActive }) => `flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${isActive ? 'bg-sky-400/15 text-sky-200 shadow-sm ring-1 ring-sky-300/20' : 'text-slate-300 hover:bg-slate-700 hover:text-white'}`}>
            <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${location.pathname === link.to ? 'bg-sky-400/20 text-sky-200' : 'bg-slate-700 text-slate-400'}`}>
              <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">{link.icon}</svg>
            </span>
            {link.label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-slate-700 p-4 lg:mt-auto">
        <div className="flex items-center gap-3 rounded-2xl bg-slate-700 p-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-100 text-sm font-bold text-sky-700">{user?.full_name?.[0]}</div>
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-semibold text-slate-100">{user?.full_name}</p>
            <p className="truncate text-xs text-slate-300">Patient</p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="rounded-lg p-1 text-slate-300 transition-colors hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={loggingOut ? 'Signing out' : 'Logout'}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
