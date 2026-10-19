import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { startSimulation, getSimulation, advanceSimulation, cancelSimulation } from '../utils/api';
import { createAcquisitionId } from '../utils/acquisition';
import { apiErrorMessage } from '../utils/errors';

const STAGES = {
  instructions: 'Instructions', waiting: 'Waiting for simulated breath',
  detecting: 'Simulated breath detection', capturing: 'Capturing synthetic sensor data',
  processing: 'Processing raw test data', completed: 'Completed — saved to history',
  failed: 'Failed — no reading saved', cancelled: 'Cancelled', timed_out: 'Timed out', replaced: 'Replaced by another scan',
};
const TERMINAL = ['completed', 'failed', 'cancelled', 'timed_out', 'replaced'];
const DEFAULTS = {
  tgs822: [1100, 1600], tgs2620: [1300, 1800], tgs822_baseline: [700, 1000],
  tgs2620_baseline: [800, 1100], temperature: [24, 30], humidity: [40, 70],
};
const LABELS = { tgs822: 'TGS822 ADC', tgs2620: 'TGS2620 ADC', tgs822_baseline: 'TGS822 baseline ADC', tgs2620_baseline: 'TGS2620 baseline ADC', temperature: 'Temperature (°C)', humidity: 'Humidity (%)' };

export default function SimulationScan({ patientId, onCompleted, onActiveChange, onPatientRestored, onReset }) {
  const { user } = useAuth();
  const storageKey = `breathdx-simulation-${user.id}`;
  const [pending, setPending] = useState(() => {
    try { return JSON.parse(localStorage.getItem(storageKey)) || null; } catch { return null; }
  });
  const [run, setRun] = useState(null);
  const [ranges, setRanges] = useState(DEFAULTS);
  const [duration, setDuration] = useState(2);
  const [timeout, setTimeoutSeconds] = useState(120);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const mounted = useRef(true);
  const delivered = useRef(null);
  const active = Boolean(pending && (!run || !TERMINAL.includes(run.stage)));

  useEffect(() => { onActiveChange(active); }, [active, onActiveChange]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const accept = (data) => {
    if (!mounted.current) return;
    setRun(data); setError('');
    onPatientRestored(data.patient_id);
    if (data.stage === 'completed' && data.reading && delivered.current !== data.acquisition_id) {
      delivered.current = data.acquisition_id;
      onCompleted(data.reading);
    }
  };
  // Serial requests; HTTP errors pause automatic advancing until explicit Retry.
  const perform = async (action) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try { accept((await action()).data); }
    catch (err) {
      if (mounted.current) setError(apiErrorMessage(err, 'Request interrupted. Check status and retry this same test; do not start another acquisition.'));
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  useEffect(() => {
    if (!pending || error || (run && TERMINAL.includes(run.stage))) return;
    let disposed = false;
    const poll = async () => {
      if (disposed || busyRef.current) return;
      await perform(() => getSimulation(pending.session_id));
    };
    // Restores durable state on reload. Advancing is handled separately below.
    poll();
    const timer = window.setInterval(poll, 1500);
    return () => { disposed = true; window.clearInterval(timer); };
    // accept uses the current parent callback; restarting polling is harmless.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, error, onCompleted, run?.stage]);

  useEffect(() => {
    if (!run || error || run.stage === 'instructions' || TERMINAL.includes(run.stage)) return;
    const timer = window.setInterval(() => perform(() => advanceSimulation(run.session_id)), 1000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.stage, run?.session_id, error]);

  const start = () => {
    if (Object.values(ranges).some(values => values.some(value => String(value).trim() === '')) || String(duration).trim() === '' || String(timeout).trim() === '') {
      setError('Complete every synthetic range and timing field before starting.');
      return;
    }
    const data = { patient_id: Number(patientId), session_id: createAcquisitionId(), stage_seconds: Number(duration), timeout_seconds: Number(timeout) };
    Object.entries(ranges).forEach(([name, [minimum, maximum]]) => { data[name] = { minimum: Number(minimum), maximum: Number(maximum) }; });
    localStorage.setItem(storageKey, JSON.stringify(data));
    onReset(); setError('');
    setPending(data); setRun(null); delivered.current = null;
    perform(() => startSimulation(data));
  };
  const retry = () => perform(async () => {
    try { return await getSimulation(pending.session_id); }
    catch (err) {
      // A start acknowledgement may have been lost. The saved UUID/settings
      // make repeating start safe; never replace them while outcome is unknown.
      if (err.response?.status === 404) return startSimulation(pending);
      throw err;
    }
  });
  const cancel = () => perform(async () => {
    await cancelSimulation(pending.session_id);
    return getSimulation(pending.session_id);
  });
  const reset = () => { localStorage.removeItem(storageKey); setPending(null); setRun(null); setError(''); onReset(); };
  const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm';
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
        <p className="font-semibold text-sky-800">SIMULATION — synthetic test data</p>
        <p className="mt-1 text-sm text-slate-600">No ESP32 required. Timed detection is scripted. This test creates raw counts and environmental values only; concentration, monitoring band and glucose estimates remain unavailable.</p>
      </div>
      {!pending && <>
        <details className="rounded-xl border border-slate-200 p-3">
          <summary className="cursor-pointer text-sm font-semibold">Configure synthetic test ranges</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {Object.entries(ranges).map(([name, values]) => <fieldset key={name}>
              <legend className="text-xs text-slate-500">{LABELS[name]}</legend>
              <div className="mt-1 flex gap-2">{values.map((value, index) => <label key={index} className="flex-1 text-xs text-slate-500">
                {index === 0 ? 'Minimum' : 'Maximum'}
                <input aria-label={`${LABELS[name]} ${index === 0 ? 'minimum' : 'maximum'}`} type="number" step={name.includes('tgs') ? 1 : 'any'} className={inputClass} value={value} onChange={(event) => setRanges({ ...ranges, [name]: values.map((v, i) => i === index ? event.target.value : v) })} />
              </label>)}</div>
            </fieldset>)}
            <label className="text-xs text-slate-500">Seconds per stage (0.5–10)<input aria-label="Seconds per stage" type="number" min="0.5" max="10" step="0.5" className={inputClass} value={duration} onChange={(event) => setDuration(event.target.value)} /></label>
            <label className="text-xs text-slate-500">Session timeout (15–900 seconds)<input aria-label="Session timeout" type="number" min="15" max="900" step="1" className={inputClass} value={timeout} onChange={(event) => setTimeoutSeconds(event.target.value)} /></label>
          </div>
        </details>
        <button type="button" disabled={!patientId || busy} onClick={start} className="w-full rounded-xl bg-sky-600 py-3 font-semibold text-white disabled:opacity-50">Start Test — Simulation</button>
      </>}
      {run && <div aria-live="polite" className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <p className="font-semibold">{STAGES[run.stage] || run.stage}</p>
        <progress aria-label="Simulation progress" value={run.progress} max="100" className="mt-3 w-full accent-sky-600" />
        <p className="mt-1 text-xs text-slate-500">Test patient ID: {run.patient_id} · {run.progress}% · expires {new Date(run.expires_at).toLocaleTimeString()}</p>
        {run.stage === 'instructions' && <>
          <p className="mt-3 text-sm text-slate-600">Confirm the selected test patient. Continue to simulate waiting for breath, detection, capture and processing. Results are saved automatically once, with a SIMULATED label. These values are not patient measurements.</p>
          <button type="button" disabled={busy} onClick={() => perform(() => advanceSimulation(run.session_id))} className="mt-3 rounded-xl bg-sky-600 px-4 py-2 font-semibold text-white">Continue simulated test</button>
        </>}
        {run.stage === 'completed' && <p className="mt-2 text-sm">{run.reading ? 'Results saved to patient history. Open Readings or refresh the patient app to view the synthetic record.' : 'The test was saved, but its reading has since been deleted. It will not be recreated.'}</p>}
        {run.error && <p className="mt-2 text-sm text-rose-700">{run.error}</p>}
      </div>}
      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
        <p>{error}</p>
        {pending && <button type="button" disabled={busy} onClick={retry} className="mt-2 font-semibold underline">Check status / retry same test</button>}
        {pending && !run && <button type="button" disabled={busy} onClick={async () => {
          try { await getSimulation(pending.session_id); await retry(); }
          catch (err) { if (err.response?.status === 404) reset(); }
        }} className="ml-4 font-semibold underline">Discard only if no session exists</button>}
      </div>}
      {active && <button type="button" disabled={busy || !run} onClick={cancel} className="w-full rounded-xl bg-slate-900 py-3 font-semibold text-white disabled:opacity-50">Cancel simulated test</button>}
      {run && TERMINAL.includes(run.stage) && <button type="button" disabled={busy} onClick={reset} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold">Prepare another test</button>}
    </div>
  );
}
