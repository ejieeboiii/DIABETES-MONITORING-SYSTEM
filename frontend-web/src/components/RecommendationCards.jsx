export default function RecommendationCards({ tips, accent = 'emerald' }) {
  const border = accent === 'blue' ? 'border-blue-500/20 bg-blue-500/5' : 'border-emerald-500/20 bg-emerald-500/5';
  const title = accent === 'blue' ? 'text-blue-300' : 'text-emerald-300';

  if (!tips?.length) {
    return (
      <div className="text-white/30 text-sm py-6 text-center">
        Complete a reading to receive wellness suggestions.
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {tips.map((tip) => (
        <div key={tip.title} className={`rounded-xl border p-4 ${border}`}>
          <p className={`text-sm font-semibold ${title}`}>{tip.title}</p>
          <p className="text-white/60 text-xs mt-2 leading-relaxed">{tip.text}</p>
        </div>
      ))}
    </div>
  );
}
