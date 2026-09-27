import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getPatients, getAllReadings } from '../../utils/api';
import MetricCard from '../../components/MetricCard';
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
      <div className="flex-1 flex items-center justify-center bg-slate-100">
        <div className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-500 shadow-sm">Loading trends...</div>
      </div>
    );
  }

  return (
    <div className="min-h-full flex-1 overflow-auto bg-slate-100 text-slate-800">
      <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-sky-600">Analytics workspace</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Clinic Trends</h1>
          <p className="mt-1 text-sm text-slate-500">Population and per-patient acetone monitoring trends</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedPatient('all')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              selectedPatient === 'all' ? 'bg-sky-600 text-white shadow-sm' : 'border border-slate-200 bg-white text-slate-500 hover:border-sky-200 hover:text-sky-700'
            }`}
          >
            All patients
          </button>
          {patients.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedPatient(String(p.id))}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                selectedPatient === String(p.id) ? 'bg-sky-600 text-white shadow-sm' : 'border border-slate-200 bg-white text-slate-500 hover:border-sky-200 hover:text-sky-700'
              }`}
            >
              {p.full_name}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {[7, 30, 90].map((days) => (
            <button
              key={days}
              onClick={() => setRange(days)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                range === days ? 'bg-slate-900 text-white shadow-sm' : 'border border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
              }`}
            >
              {days} days
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            { label: 'Normal band', value: bandCounts.Normal, status: 'Normal', tone: 'green', icon: 'normal' },
            { label: 'Elevated band', value: bandCounts['Pre-Diabetic'], status: 'Elevated', tone: 'amber', icon: 'elevated' },
            { label: 'High band', value: bandCounts.Diabetic, status: 'High', tone: 'red', icon: 'high' },
          ].map((metric) => (
            <MetricCard key={metric.label} {...metric} />
          ))}
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/50 sm:p-6">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Acetone PPM trend</h2>
          <TrendChart data={chartData} height={280} />
        </div>
      </div>
    </div>
  );
}
