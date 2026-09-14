import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getPatients, getAllReadings } from '../../utils/api';
import TrendChart from '../../components/TrendChart';
import { filterByDays, toChartData } from '../../utils/monitoring';

export default function Trends() {
  const [patients, setPatients] = useState([]);
  const [readings, setReadings] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState('all');
  const [range, setRange] = useState(30);
  const [loading, setLoading] = useState(true);
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const pid = searchParams.get('patient');
    if (pid) setSelectedPatient(pid);
    Promise.all([getPatients(), getAllReadings()])
      .then(([p, r]) => { setPatients(p.data); setReadings(r.data); })
      .finally(() => setLoading(false));
  }, [searchParams]);

  const filteredReadings = selectedPatient === 'all'
    ? readings
    : readings.filter((r) => r.patient_id === parseInt(selectedPatient));

  const ranged = filterByDays(filteredReadings, range);
  const chartData = toChartData(ranged);

  const bandCounts = {
    Normal: ranged.filter((r) => r.diabetes_level === 'Normal').length,
    'Pre-Diabetic': ranged.filter((r) => r.diabetes_level === 'Pre-Diabetic').length,
    Diabetic: ranged.filter((r) => r.diabetes_level === 'Diabetic').length,
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-950">
        <div className="text-white/30 text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-slate-950 overflow-auto">
      <div className="p-8 max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Clinic Trends</h1>
          <p className="text-white/30 text-sm mt-1">Population and per-patient acetone monitoring trends</p>
        </div>

        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setSelectedPatient('all')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              selectedPatient === 'all' ? 'bg-blue-500 text-white' : 'bg-white/5 text-white/40 hover:text-white border border-white/10'
            }`}
          >
            All patients
          </button>
          {patients.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedPatient(String(p.id))}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                selectedPatient === String(p.id) ? 'bg-blue-500 text-white' : 'bg-white/5 text-white/40 hover:text-white border border-white/10'
              }`}
            >
              {p.full_name}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          {[7, 30, 90].map((days) => (
            <button
              key={days}
              onClick={() => setRange(days)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                range === days ? 'bg-blue-500/80 text-white' : 'bg-white/5 text-white/40 border border-white/10'
              }`}
            >
              {days} days
            </button>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Normal band', value: bandCounts.Normal, color: 'text-emerald-400' },
            { label: 'Elevated band', value: bandCounts['Pre-Diabetic'], color: 'text-yellow-400' },
            { label: 'High band', value: bandCounts.Diabetic, color: 'text-red-400' },
          ].map((s) => (
            <div key={s.label} className="bg-white/3 border border-white/8 rounded-2xl p-5">
              <p className="text-white/40 text-xs uppercase tracking-wider">{s.label}</p>
              <p className={`text-2xl font-bold mt-2 ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        <div className="bg-white/3 border border-white/8 rounded-2xl p-6">
          <h2 className="text-white font-semibold text-sm mb-4">Acetone PPM trend</h2>
          <TrendChart data={chartData} height={280} />
        </div>
      </div>
    </div>
  );
}
