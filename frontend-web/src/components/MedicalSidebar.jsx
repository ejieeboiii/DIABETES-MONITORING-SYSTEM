import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLogout } from '../hooks/useLogout';

const links = [
  { to: '/medical/dashboard', label: 'Dashboard', icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
        <path d="M3 11.5 12 4l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5 10.5V19a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ) },
  { to: '/medical/patients', label: 'Patients', icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
        <path d="M16 19v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="10" cy="7" r="3.5" />
        <path d="M20 19v-1a4 4 0 0 0-3-3.87" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M16 4.13a3.5 3.5 0 0 1 0 6.74" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ) },
  { to: '/medical/readings', label: 'Readings', icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
        <path d="M5 18V6.5A1.5 1.5 0 0 1 6.5 5H18a1 1 0 0 1 1 1v12.5A1.5 1.5 0 0 1 17.5 20H6.5A1.5 1.5 0 0 1 5 18Z" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8 9h8M8 13h8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ) },
  { to: '/medical/trends', label: 'Trends', icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
        <path d="M4 17.5 9.5 12l3 3 7-8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M17 7h3v3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ) },
  { to: '/medical/livescan', label: 'Live Scan', icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
        <rect x="3" y="5" width="18" height="14" rx="3" />
        <path d="M9 9h6v6H9z" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M15 3v4M9 3v4M3 10h3M18 10h3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ) },
];

export default function MedicalSidebar() {
  const { user } = useAuth();
  const { handleLogout, loggingOut } = useLogout();
  const location = useLocation();

  return (
    <aside className="w-full max-w-[280px] shrink-0 border-b border-slate-200 bg-white/90 backdrop-blur-xl shadow-[0_10px_30px_rgba(15,23,42,0.05)] lg:h-full lg:border-b-0 lg:border-r">
      <div className="flex items-center gap-3 border-b border-slate-200 p-6">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-cyan-500 text-lg font-bold text-white shadow-lg shadow-sky-500/20">
          B
        </div>
        <div>
          <p className="text-lg font-bold tracking-tight text-slate-900">BreathDx</p>
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-slate-500">Provider</p>
        </div>
      </div>

      <nav className="flex flex-wrap gap-2 p-4 lg:flex-col lg:flex-nowrap">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-sky-50 text-sky-700 shadow-sm ring-1 ring-sky-100'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`
            }
          >
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-xl ${
                location.pathname === link.to ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-500'
              }`}
            >
              {link.icon}
            </span>
            {link.label}
          </NavLink>
        ))}
      </nav>

      <div className="p-4 lg:mt-auto lg:border-t lg:border-slate-200">
        <div className="rounded-2xl bg-slate-100 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-800">{user?.full_name || 'Provider'}</p>
              <p className="text-xs text-slate-500">Healthcare provider</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-600 transition-colors hover:border-red-200 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loggingOut ? 'Signing out…' : 'Logout'}
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
