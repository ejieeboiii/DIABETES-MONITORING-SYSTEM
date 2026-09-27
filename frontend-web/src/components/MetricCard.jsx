const tones = {
  blue: { icon: 'bg-sky-50 text-sky-700', badge: 'bg-sky-50 text-sky-700', dot: 'bg-sky-500' },
  green: { icon: 'bg-emerald-50 text-emerald-700', badge: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
  amber: { icon: 'bg-amber-50 text-amber-700', badge: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
  red: { icon: 'bg-rose-50 text-rose-700', badge: 'bg-rose-50 text-rose-700', dot: 'bg-rose-500' },
};

const icons = {
  patients: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19v-1a5.5 5.5 0 0 1 11 0v1" />
      <path d="M16 5.5a3 3 0 0 1 0 5.8M17 14a5 5 0 0 1 3.5 4.8v.2" />
    </>
  ),
  normal: <path d="m5 12 4 4L19 6" />,
  elevated: <path d="M4 17 10 11l4 4 6-8M16 7h4v4" />,
  high: <path d="M12 4v9m0 4v.01M5.5 20h13a1.5 1.5 0 0 0 1.3-2.2l-6.5-12a1.5 1.5 0 0 0-2.6 0l-6.5 12A1.5 1.5 0 0 0 5.5 20Z" />,
};

export default function MetricCard({ label, value, status, tone = 'blue', icon = 'normal', live = false }) {
  const color = tones[tone] || tones.blue;

  return (
    <article className="flex min-h-[148px] flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_3px_12px_rgba(15,23,42,0.04)] transition-shadow hover:shadow-[0_8px_20px_rgba(15,23,42,0.08)]">
      <div className="flex items-start justify-between gap-3">
        <p className="text-3xl font-semibold leading-none text-slate-900">{value}</p>
        <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${color.icon}`} aria-hidden="true">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            {icons[icon] || icons.normal}
          </svg>
        </span>
      </div>
      <p className="mt-3 text-sm font-medium text-slate-600">{label}</p>
      <div className="mt-auto flex items-center gap-2 pt-3">
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] ${color.badge}`}>{status}</span>
        {live && <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-slate-500"><span className={`h-1.5 w-1.5 rounded-full ${color.dot}`} />Live</span>}
      </div>
    </article>
  );
}