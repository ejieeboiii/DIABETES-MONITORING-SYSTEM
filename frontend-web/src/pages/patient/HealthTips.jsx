import { useEffect, useState } from 'react';
import { getMyReadings, getMyLatestReading } from '../../utils/api';
import RecommendationCards from '../../components/RecommendationCards';
import { computeTrend, getWellnessTips } from '../../utils/monitoring';

const ALL_TIPS = [
  {
    category: 'Nutrition',
    title: 'Balanced meals',
    text: 'Include vegetables, lean protein, and whole grains. Limit sugary drinks and processed snacks.',
  },
  {
    category: 'Activity',
    title: 'Daily movement',
    text: 'Aim for at least 30 minutes of moderate activity most days, such as brisk walking.',
  },
  {
    category: 'Sleep',
    title: 'Rest and recovery',
    text: 'Consistent sleep supports metabolic wellness. Target 7–8 hours per night when possible.',
  },
  {
    category: 'Hydration',
    title: 'Water intake',
    text: 'Stay hydrated throughout the day, especially before and after physical activity.',
  },
  {
    category: 'Follow-up',
    title: 'Share with your provider',
    text: 'Bring your trend charts to appointments. This app supports monitoring only, not diagnosis.',
  },
];

export default function HealthTips() {
  const [personalTips, setPersonalTips] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getMyReadings().then((r) => r.data).catch(() => []),
      getMyLatestReading().then((r) => r.data).catch(() => null),
    ]).then(([readings, latest]) => {
      const trend = computeTrend(readings);
      const tips = latest
        ? getWellnessTips(latest.diabetes_level, trend.direction)
        : getWellnessTips('Normal', 'stable');
      setPersonalTips(tips);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-100">
        <div className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-500 shadow-sm">Loading health tips...</div>
      </div>
    );
  }

  return (
    <div className="min-h-full flex-1 overflow-auto bg-slate-100 text-slate-800">
      <div className="mx-auto max-w-6xl space-y-8 p-4 sm:p-6 lg:p-8">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-sky-600">Wellness guidance</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Health Tips</h1>
          <p className="mt-1 text-sm text-slate-500">Personalized wellness guidance based on your monitoring data</p>
        </div>

        <div>
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Recommended for you</h2>
          <RecommendationCards tips={personalTips} />
        </div>

        <div>
          <h2 className="mb-4 text-lg font-semibold text-slate-900">General wellness library</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {ALL_TIPS.map((tip) => (
              <div key={tip.title} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/50">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-600">{tip.category}</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{tip.title}</p>
                <p className="mt-2 text-xs leading-relaxed text-slate-600">{tip.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
