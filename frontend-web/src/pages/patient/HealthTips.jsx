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
      <div className="flex-1 flex items-center justify-center bg-slate-950">
        <div className="text-white/30 text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-slate-950 overflow-auto">
      <div className="p-8 max-w-6xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Health Tips</h1>
          <p className="text-white/30 text-sm mt-1">Personalized wellness guidance based on your monitoring data</p>
        </div>

        <div>
          <h2 className="text-white font-semibold text-sm mb-4">Recommended for you</h2>
          <RecommendationCards tips={personalTips} />
        </div>

        <div>
          <h2 className="text-white font-semibold text-sm mb-4">General wellness library</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {ALL_TIPS.map((tip) => (
              <div key={tip.title} className="bg-white/3 border border-white/8 rounded-2xl p-5">
                <p className="text-emerald-400/70 text-xs uppercase tracking-wider">{tip.category}</p>
                <p className="text-white font-medium text-sm mt-1">{tip.title}</p>
                <p className="text-white/50 text-xs mt-2 leading-relaxed">{tip.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
