import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { sendSensorData } from '../../utils/api';
import { apiErrorMessage } from '../../utils/errors';
import { LEVEL_LABELS, rawSensorSummary } from '../../utils/monitoring';
import useProviderData from '../../hooks/useProviderData';
import useLiveScan from '../../hooks/useLiveScan';
import RequestError from '../../components/RequestError';
import { createAcquisitionId } from '../../utils/acquisition';
import SimulationScan from '../../components/SimulationScan';
import { useAuth } from '../../context/AuthContext';
import { estimationMessage } from '../../utils/estimation';

const levelConfig = { Normal: { icon: '✓' }, 'Pre-Diabetic': { icon: '⚠' }, Diabetic: { icon: '!' }, unavailable: { icon: '•' } };

export default function LiveScan() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const { patients, error: loadError, load } = useProviderData();
  const [form, setForm] = useState(() => ({ patient_id: searchParams.get('patient') || '', tgs822_raw_adc: '', tgs2620_raw_adc: '', temperature: '', humidity: '' }));
  const [result, setResult] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [mode, setMode] = useState(() => localStorage.getItem(`breathdx-simulation-${user.id}`) ? 'simulation' : 'manual');
  const [error, setError] = useState('');
  const [simulationActive, setSimulationActive] = useState(false);
  const pendingAcquisition = useRef(null);
  const listener = useLiveScan(form.patient_id, (reading) => setResult({
    patient_name: patients.find((p) => p.id === reading.patient_id)?.full_name || 'Selected patient',
    acetone_ppm: reading.acetone_ppm, diabetes_level: reading.diabetes_level,
    suggestion: reading.suggestion, predicted_bgl: reading.predicted_bgl,
    source: 'New saved reading', reading,
  }));
  const listenerActive = listener.active;
  const socketConnected = listener.connected;
  const listenerStatus = listener.status;
  const listenerMessage = listener.message;
  const startListening = () => { setResult(null); listener.start(); };
  const stopListening = listener.stop;
  const handle = (event) => {
    pendingAcquisition.current = null;
    if (event.target.name === 'patient_id') { setResult(null); setError(''); }
    setForm({ ...form, [event.target.name]: event.target.value });
  };
  const scan = async (event) => {
    event.preventDefault();
    setScanning(true);
    setResult(null);
    setError('');
    try {
      pendingAcquisition.current ??= {
        acquisition_id: createAcquisitionId(),
        patient_id: Number(form.patient_id), sensor_configuration: 'tgs822_tgs2620',
        tgs822_raw_adc: Number(form.tgs822_raw_adc), tgs2620_raw_adc: Number(form.tgs2620_raw_adc),
        temperature: Number(form.temperature), humidity: Number(form.humidity),
      };
      const response = await sendSensorData(pendingAcquisition.current);
      pendingAcquisition.current = null;
      setResult({ ...response.data, source: 'Manual entry' });
    } catch (err) { setError(apiErrorMessage(err, 'Scan failed. Check your inputs.')); }
    finally { setScanning(false); }
  };
  if (loadError) return <RequestError message={loadError} onRetry={load} />;

  const cfg = result ? levelConfig[result.diabetes_level || 'unavailable'] : null;

  return (
    <div className="min-h-full flex-1 overflow-auto bg-slate-100 text-slate-800">
      <div className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-sky-600">Monitoring workspace</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Live Scan</h1>
            <p className="mt-1 text-sm text-slate-500">Select a patient to record and review experimental breath readings.</p>
          </div>
        </div>

        <div className="mb-6 rounded-3xl border border-slate-200 bg-white p-2 shadow-sm shadow-slate-200/50">
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              disabled={scanning || listener.starting || simulationActive} onClick={() => { listener.stop(); setMode('manual'); setResult(null); }}
              className={`rounded-xl px-4 py-2.5 text-sm font-medium transition-all ${
                mode === 'manual' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
              }`}
            >
              Manual Entry
            </button>
            <button
              type="button"
              disabled={scanning || listener.starting || simulationActive} onClick={() => { setMode('listener'); setResult(null); }}
              className={`rounded-xl px-4 py-2.5 text-sm font-medium transition-all ${
                mode === 'listener' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
              }`}
            >
              ESP32 Listener
            </button>
            <button type="button" disabled={scanning || listener.starting || listenerActive} onClick={() => { if (mode !== 'simulation') { setMode('simulation'); setResult(null); } }} className={`rounded-xl px-4 py-2.5 text-sm font-medium ${mode === 'simulation' ? 'bg-sky-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>Simulation</button>
          </div>
        </div>

        <div className="mb-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/50 sm:p-6">
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Select Patient</label>
              <select aria-label="Select patient" disabled={listenerActive || listener.starting || scanning || simulationActive} name="patient_id" value={form.patient_id} onChange={handle} required
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-sm outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100">
                <option value="">-- Select a patient --</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>{p.full_name}</option>
                ))}
              </select>
              {form.patient_id && mode === 'listener' && (
                <div className="mt-2 space-y-1 text-xs leading-relaxed text-slate-500">
                  <p>Start listening, then submit a new scan from the configured device.</p>
                  <p>The session expires after 15 minutes. Stop it before changing patients.</p>
                </div>
              )}
            </div>
            {mode === 'simulation' ? <SimulationScan patientId={form.patient_id} onActiveChange={setSimulationActive} onReset={() => setResult(null)} onPatientRestored={(patientId) => setForm(previous => previous.patient_id === String(patientId) ? previous : { ...previous, patient_id: String(patientId) })} onCompleted={(reading) => setResult({ reading, patient_name: patients.find(p => p.id === reading.patient_id)?.full_name || 'Test patient', acetone_ppm: null, diabetes_level: null, predicted_bgl: null, suggestion: reading.suggestion, source: 'SIMULATED — saved synthetic test data' })} /> : mode === 'manual' ? (
              <form onSubmit={scan} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {[
                    { name: 'tgs822_raw_adc', label: 'TGS822 ADC (primary)', placeholder: 'e.g. 1200', hint: '1 – 4094 raw counts', min: 1, max: 4094, step: 1 },
                    { name: 'tgs2620_raw_adc', label: 'TGS2620 ADC (secondary)', placeholder: 'e.g. 1500', hint: '1 – 4094 raw counts', min: 1, max: 4094, step: 1 },
                    { name: 'temperature', label: 'Temperature (°C)', placeholder: 'e.g. 28.5', hint: '', min: -40, max: 80, step: 'any' },
                    { name: 'humidity', label: 'Humidity (%)', placeholder: 'e.g. 65.0', hint: '', min: 0, max: 100, step: 'any' },
                  ].map(f => (
                    <div key={f.name}>
                      <label className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{f.label}</label>
                      <input name={f.name} type="number" step={f.step} min={f.min} max={f.max} aria-label={f.label} placeholder={f.placeholder} value={form[f.name]} onChange={handle} required
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100" />
                      {f.hint && <p className="mt-1 text-xs text-slate-400">{f.hint}</p>}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-slate-500">TGS calibration is unverified. Raw readings are saved without a concentration, monitoring band or glucose estimate.</p>
                <button type="submit" disabled={scanning || !form.patient_id}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 py-3 font-semibold text-white shadow-lg shadow-sky-600/20 transition-all hover:bg-sky-500 disabled:opacity-50">
                  {scanning ? (
                    <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Analyzing...</>
                  ) : 'Run Manual Scan'}
                </button>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Listener Status</p>
                  <p className={`mt-1 text-sm ${listenerStatus === 'error' ? 'text-rose-600' : listenerStatus === 'fallback' ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {listenerMessage}
                  </p>
                  <div className="mt-2 inline-flex items-center gap-2 rounded-lg bg-white px-2.5 py-1 ring-1 ring-slate-200">
                    <span className={`h-2 w-2 rounded-full ${!listenerActive ? 'bg-slate-400' : socketConnected ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                    <span className="text-xs text-slate-500">{!listenerActive ? 'Scan inactive' : socketConnected ? 'WebSocket connected' : 'Polling fallback'}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {!listenerActive ? (
                    <button
                      type="button"
                      disabled={listener.starting || !form.patient_id} onClick={startListening}
                      className="rounded-xl bg-sky-600 py-3 font-semibold text-white shadow-lg shadow-sky-600/20 transition-all hover:bg-sky-500"
                    >
                      {listener.starting ? 'Starting…' : 'Start Listening'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={stopListening}
                      className="rounded-xl bg-slate-900 py-3 font-semibold text-white transition-all hover:bg-slate-800"
                    >
                      Stop Listening
                    </button>
                  )}
                </div>
              </div>
            )}
            {listener.error && <RequestError message={listener.error} />}
            {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div>}
          </div>
        </div>

        {result && cfg && (
          <div className={`mb-6 rounded-3xl border ${!result.diabetes_level ? 'border-slate-200 bg-slate-50' : result.diabetes_level === 'Normal' ? 'border-emerald-200 bg-emerald-50' : result.diabetes_level === 'Pre-Diabetic' ? 'border-amber-200 bg-amber-50' : 'border-rose-200 bg-rose-50'} p-5 shadow-sm sm:p-6`}>
            <div className="mb-4 flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Patient</p>
                <p className="mt-1 font-semibold text-slate-900">{patients.find(patient => patient.id === result.reading.patient_id)?.full_name || result.patient_name}</p>
              </div>
              <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border bg-white text-2xl font-bold shadow-sm ${!result.diabetes_level ? 'border-slate-200 text-slate-600' : result.diabetes_level === 'Normal' ? 'border-emerald-200 text-emerald-600' : result.diabetes_level === 'Pre-Diabetic' ? 'border-amber-200 text-amber-600' : 'border-rose-200 text-rose-600'}`}>
                {cfg.icon}
              </div>
            </div>
            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                { label: 'Acetone-related concentration', value: result.acetone_ppm == null ? 'Unavailable' : `${result.acetone_ppm} ppm` },
                { label: 'Temperature', value: `${result.reading.temperature}°C` },
                { label: 'Humidity', value: `${result.reading.humidity}%` },
              ].map(s => (
                <div key={s.label} className="rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-sm">
                  <p className="text-xs text-slate-500">{s.label}</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">{s.value}</p>
                </div>
              ))}
            </div>
            <p className="mb-4 text-sm text-slate-600">{rawSensorSummary(result.reading)}</p>
            <p className="mb-4 text-sm text-slate-600">{estimationMessage(result.reading)}</p>
            {result.predicted_bgl != null ? (
              <div className="mb-4 rounded-2xl border border-sky-200 bg-sky-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-700">Experimental glucose estimate</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">{result.predicted_bgl.toFixed(1)} mg/dL</p>
              </div>
            ) : <p className="mb-4 text-sm text-slate-600">Experimental glucose estimate unavailable.</p>}
            <div className="rounded-2xl border border-white/80 bg-white/70 p-4">
              <p className={`text-lg font-bold ${!result.diabetes_level ? 'text-slate-700' : result.diabetes_level === 'Normal' ? 'text-emerald-700' : result.diabetes_level === 'Pre-Diabetic' ? 'text-amber-700' : 'text-rose-700'}`}>{LEVEL_LABELS[result.diabetes_level || 'unavailable']}</p>
              <p className="mt-1 text-sm text-slate-600">{result.suggestion}</p>
              {result.source && <p className="mt-3 text-xs text-slate-500">{result.source}</p>}
            </div>
          </div>
        )}

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/50 sm:p-6">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Historical MQ-138 prototype bands</p>
          <div className="space-y-2">
            {[
              { label: 'Normal', range: '< 1.8 PPM', color: 'text-emerald-700', bg: 'bg-emerald-50' },
              { label: 'Pre-Diabetic', range: '1.8 to < 3.5 PPM', color: 'text-amber-700', bg: 'bg-amber-50' },
              { label: 'Diabetic', range: '≥ 3.5 PPM', color: 'text-rose-700', bg: 'bg-rose-50' },
            ].map(r => (
              <div key={r.label} className={`flex items-center justify-between rounded-xl px-4 py-2.5 ${r.bg}`}>
                <span className={`text-sm font-medium ${r.color}`}>{LEVEL_LABELS[r.label]}</span>
                <span className="font-mono text-sm text-slate-500">{r.range}</span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-center text-xs text-slate-400">These historical thresholds are not applied to uncalibrated TGS sensors. Not for medical diagnosis.</p>
        </div>
      </div>
    </div>
  );
}
