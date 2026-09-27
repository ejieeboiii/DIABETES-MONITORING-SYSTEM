export default function RecommendationCards({ tips, accent = 'emerald' }) {
  const border = accent === 'blue' ? 'border-sky-100 bg-sky-50' : 'border-emerald-100 bg-emerald-50';
  const title = accent === 'blue' ? 'text-sky-700' : 'text-emerald-700';

  if (!tips?.length) {
    return (
      <div className="py-6 text-center text-sm text-slate-400">
        Complete a reading to receive wellness suggestions.
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {tips.map((tip) => (
        <div key={tip.title} className={`rounded-2xl border p-4 ${border}`}>
          <p className={`text-sm font-semibold ${title}`}>{tip.title}</p>
          <p className="mt-2 text-xs leading-relaxed text-slate-600">{tip.text}</p>
        </div>
      ))}
    </div>
  );
}
