import { NavLink } from 'react-router-dom';
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

  return (
    <aside className="w-64 h-full shrink-0 bg-slate-900 border-r border-white/5 flex flex-col overflow-hidden">
      <div className="p-6 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-lg">🧑</div>
          <div>
            <p className="text-white font-bold text-sm">BreathDx</p>
            <p className="text-emerald-400/60 text-xs">Patient Portal</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 p-4 space-y-1 overflow-hidden">
        {links.map((link) => (
          <NavLink key={link.to} to={link.to}
            className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${isActive ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' : 'text-white/40 hover:text-white hover:bg-white/5'}`}>
            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">{link.icon}</svg>
            {link.label}
          </NavLink>
        ))}
      </nav>
      <div className="p-4 border-t border-white/5">
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold text-sm">{user?.full_name?.[0]}</div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-medium truncate">{user?.full_name}</p>
            <p className="text-white/30 text-xs truncate">Patient</p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="text-white/20 hover:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
