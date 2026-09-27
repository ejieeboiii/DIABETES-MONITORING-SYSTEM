import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  API_BASE_URL,
  checkListenerApi,
  getPatientReadings,
  getPatients,
  getReadingsWebSocketUrl,
  sendSensorData,
  startListener,
  stopListener,
} from '../../utils/api';

const levelConfig = {
  Normal: { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', ring: 'ring-emerald-500/20', icon: '✓' },
  'Pre-Diabetic': { color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', ring: 'ring-yellow-500/20', icon: '⚠' },
  Diabetic: { color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30', ring: 'ring-red-500/20', icon: '!' },
};

const apiErrorMessage = (err, fallback) => {
  const detail = err.response?.data?.detail;
  if (err.response?.status === 404) {
    return 'Listener API not found. Stop the old backend window and restart: cd backend → .\\venv\\Scripts\\uvicorn.exe main:app --host 0.0.0.0 --port 8000';
  }
  if (Array.isArray(detail)) return detail.map((item) => item.msg).join(', ');
  if (typeof detail === 'string') return detail;
  if (err.request && !err.response) {
    return 'Cannot reach the server. Start the backend on port 8000.';
  }
  return fallback;
};

export default function LiveScan() {
  const [patients, setPatients] = useState([]);
  const [form, setForm] = useState({ patient_id: '', raw_sensor_value: '', temperature: '', humidity: '' });
  const [result, setResult] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [mode, setMode] = useState('manual');
  const [listenerActive, setListenerActive] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  const [listenerStatus, setListenerStatus] = useState('idle');
  const [listenerMessage, setListenerMessage] = useState('Select a patient, then start listening for ESP32 packets.');
  const [error, setError] = useState('');
  const [backendReady, setBackendReady] = useState(true);
  const latestSeenReadingId = useRef(null);
  const pollTimerRef = useRef(null);
  const socketRef = useRef(null);
  const [searchParams] = useSearchParams();

  useEffect(() => {
    getPatients().then((r) => {
      setPatients(r.data);
      const pid = searchParams.get('patient');
      if (pid) setForm((f) => ({ ...f, patient_id: pid }));
    });
    checkListenerApi()
      .then(() => setBackendReady(true))
      .catch(() => setBackendReady(false));
  }, [searchParams]);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    // Clear result when component mounts (navigation to page)
    setResult(null);
    setError('');
  }, []);

  useEffect(() => {
    // Clear stale result when patient_id changes
    setResult(null);
    setError('');
    latestSeenReadingId.current = null;
  }, [form.patient_id]);

  const handle = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const selectedPatientName = patients.find((p) => String(p.id) === String(form.patient_id))?.full_name || 'Unknown patient';
  const nameForPatientId = (patientId) =>
    patients.find((p) => p.id == patientId)?.full_name || `Patient #${patientId}`;

  const scan = async (e) => {
    e.preventDefault();
    setScanning(true);
    setError('');
    try {
      const res = await sendSensorData({
        patient_id: parseInt(form.patient_id),
        raw_sensor_value: parseInt(form.raw_sensor_value),
        temperature: parseFloat(form.temperature),
        humidity: parseFloat(form.humidity),
      });
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Scan failed. Check your inputs.');
    } finally {
      setScanning(false);
    }
  };

  const mapReadingToResult = (reading, originMessage = 'Received from ESP32 listener') => ({
    patient_name: nameForPatientId(reading.patient_id),
    acetone_ppm: reading.acetone_ppm,
    diabetes_level: reading.diabetes_level,
    suggestion: reading.suggestion || 'No suggestion available.',
    source: originMessage,
    reading,
  });

  const pollLatestReading = async () => {
    if (socketConnected) return;
    if (!form.patient_id) return;
    try {
      const res = await getPatientReadings(parseInt(form.patient_id));
      const latest = res.data?.[0];
      if (!latest) return;

      if (latestSeenReadingId.current === null) {
        latestSeenReadingId.current = latest.id;
        setListenerStatus('armed');
        setListenerMessage('Listener armed. Waiting for the next ESP32 upload...');
        return;
      }

       if (latest.id !== latestSeenReadingId.current) {
        latestSeenReadingId.current = latest.id;
        const mapped = mapReadingToResult(latest, 'ESP32 upload (same data as Serial Monitor)');
        setResult(mapped);
        setListenerStatus('packet');
        setListenerMessage(
          `Scan received — ${mapped.patient_name}: ${mapped.acetone_ppm} ppm, ${mapped.diabetes_level} at ${new Date(latest.taken_at).toLocaleTimeString()}.`,
        );
      }
    } catch (err) {
      setListenerStatus('error');
      setListenerMessage(err.response?.data?.detail || 'Failed to poll readings.');
    }
  };

  const connectWebSocket = () => {
    const token = localStorage.getItem('token');
    if (!token || !form.patient_id) return;

    // Close existing WebSocket before creating a new one
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }

    const wsUrl = getReadingsWebSocketUrl({ token, patientId: parseInt(form.patient_id) });
    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      setSocketConnected(true);
      setListenerStatus('connected');
      setListenerMessage('WebSocket connected. Waiting for ESP32 packets...');
      ws.send('ping');
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'connected') return;
        if (payload.type === 'pong') return;
        if (payload.type !== 'reading_created') return;
        if (parseInt(form.patient_id) !== payload.patient_id) return;

        latestSeenReadingId.current = payload.reading.id;
        setResult({
          patient_name: payload.patient_name,
          acetone_ppm: payload.acetone_ppm,
          diabetes_level: payload.diabetes_level,
          suggestion: payload.suggestion,
          source: 'WebSocket push (ESP32 real-time)',
          reading: {
            id: payload.reading.id,
            temperature: payload.reading.temperature,
            humidity: payload.reading.humidity,
            taken_at: payload.reading.taken_at,
          },
        });
        setListenerStatus('packet');
        setListenerMessage(`Real-time packet received at ${new Date(payload.reading.taken_at).toLocaleTimeString()}.`);
      } catch (_err) {
        // Ignore malformed events and keep listener alive.
      }
    };

    ws.onerror = () => {
      if (ws.readyState === WebSocket.OPEN) return;
      setSocketConnected(false);
      setListenerStatus('fallback');
      setListenerMessage('WebSocket unavailable. Fallback polling is active (updates every 3s).');
    };

    ws.onclose = (event) => {
      setSocketConnected(false);
      if (!listenerActive) return;
      if (event.code === 1008) {
        setListenerStatus('error');
        setListenerMessage(event.reason || 'WebSocket closed. Log in again or check patient access.');
        return;
      }
      setListenerStatus('fallback');
      setListenerMessage('WebSocket disconnected. Fallback polling is active (updates every 3s).');
    };
  };

  const startListening = async () => {
    if (!form.patient_id) {
      setError('Please select a patient before starting listener mode.');
      return;
    }
    setError('');
    setListenerActive(true);
    setListenerStatus('starting');
    setListenerMessage('Linking ESP32 to selected patient on server...');
    latestSeenReadingId.current = null;

    try {
      const res = await startListener(parseInt(form.patient_id, 10));
      setListenerStatus('armed');
      setListenerMessage(
        res.data.message
          || `Listening for ${res.data.patient_name || selectedPatientName}. Scan on ESP32 (button or "s") — no p1/p2 needed.`,
      );
    } catch (err) {
      setListenerActive(false);
      setListenerStatus('error');
      setError(apiErrorMessage(err, 'Could not start listener.'));
      return;
    }

    await pollLatestReading();
    connectWebSocket();
    pollTimerRef.current = setInterval(pollLatestReading, 3000);
  };

  const stopListening = async () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
    try {
      await stopListener();
    } catch (_) {
      /* best effort */
    }
    setSocketConnected(false);
    setListenerActive(false);
    setListenerStatus('idle');
    setListenerMessage('Listener stopped.');
  };

  const cfg = result ? levelConfig[result.diabetes_level] : null;

  return (
    <div className="min-h-full flex-1 overflow-auto bg-slate-100 text-slate-800">
      <div className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-sky-600">Monitoring workspace</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Live Scan</h1>
            <p className="mt-1 text-sm text-slate-500">Real MQ-138 breath scan — exhale on sensor after Start Listening</p>
          </div>
        </div>

        <div className="mb-6 rounded-3xl border border-slate-200 bg-white p-2 shadow-sm shadow-slate-200/50">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMode('manual')}
              className={`rounded-xl px-4 py-2.5 text-sm font-medium transition-all ${
                mode === 'manual' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
              }`}
            >
              Manual Entry
            </button>
            <button
              type="button"
              onClick={() => setMode('listener')}
              className={`rounded-xl px-4 py-2.5 text-sm font-medium transition-all ${
                mode === 'listener' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
              }`}
            >
              ESP32 Listener
            </button>
          </div>
        </div>

        <div className="mb-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/50 sm:p-6">
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Select Patient</label>
              <select name="patient_id" value={form.patient_id} onChange={handle} required
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-sm outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100">
                <option value="">-- Select a patient --</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>{p.full_name}</option>
                ))}
              </select>
              {form.patient_id && mode === 'listener' && (
                <div className="mt-2 space-y-1 text-xs leading-relaxed text-slate-500">
                  <p>1. Click <strong>Start Listening</strong> (patient set here).</p>
                  <p>2. On ESP32: wait 3 min warmup, then press button or type <span className="font-mono">s</span>.</p>
                  <p>3. When prompted, <strong>exhale steadily</strong> 6–8 s with lips 2–3 cm from the MQ-138.</p>
                </div>
              )}
            </div>
            {mode === 'manual' ? (
              <form onSubmit={scan} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  {[
                    { name: 'raw_sensor_value', label: 'Raw ADC Value', placeholder: 'e.g. 1200', hint: '0 – 4095' },
                    { name: 'temperature', label: 'Temperature (°C)', placeholder: 'e.g. 28.5', hint: '' },
                    { name: 'humidity', label: 'Humidity (%)', placeholder: 'e.g. 65.0', hint: '' },
                  ].map(f => (
                    <div key={f.name}>
                      <label className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{f.label}</label>
                      <input name={f.name} type="number" step="any" placeholder={f.placeholder} value={form[f.name]} onChange={handle} required
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100" />
                      {f.hint && <p className="mt-1 text-xs text-slate-400">{f.hint}</p>}
                    </div>
                  ))}
                </div>
                <button type="submit" disabled={scanning}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 py-3 font-semibold text-white shadow-lg shadow-sky-600/20 transition-all hover:bg-sky-500 disabled:opacity-50">
                  {scanning ? (
                    <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Analyzing...</>
                  ) : 'Run Manual Scan'}
                </button>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">ESP32 Upload Endpoint</p>
                  <p className="mt-1 font-mono text-sm text-slate-800">POST {API_BASE_URL}/readings/sensor</p>
                  <p className="mt-2 text-xs text-slate-500">
                    ESP32 uses <span className="font-mono">API_HOST</span> (your PC IP, e.g. http://10.0.0.51:8000). Patient comes from Start Listening.
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Listener Status</p>
                  <p className={`mt-1 text-sm ${listenerStatus === 'error' ? 'text-rose-600' : listenerStatus === 'fallback' ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {listenerMessage}
                  </p>
                  <div className="mt-2 inline-flex items-center gap-2 rounded-lg bg-white px-2.5 py-1 ring-1 ring-slate-200">
                    <span className={`h-2 w-2 rounded-full ${socketConnected ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                    <span className="text-xs text-slate-500">{socketConnected ? 'WebSocket connected' : 'Polling fallback'}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {!listenerActive ? (
                    <button
                      type="button"
                      onClick={startListening}
                      className="rounded-xl bg-sky-600 py-3 font-semibold text-white shadow-lg shadow-sky-600/20 transition-all hover:bg-sky-500"
                    >
                      Start Listening
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
            {!backendReady && mode === 'listener' && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                Backend is missing the listener API. Restart uvicorn from the project <span className="font-mono">backend</span> folder, then refresh this page.
              </div>
            )}
            {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div>}
          </div>
        </div>

        {result && cfg && (
          <div className={`mb-6 rounded-3xl border ${result.diabetes_level === 'Normal' ? 'border-emerald-200 bg-emerald-50' : result.diabetes_level === 'Pre-Diabetic' ? 'border-amber-200 bg-amber-50' : 'border-rose-200 bg-rose-50'} p-5 shadow-sm sm:p-6`}>
            <div className="mb-4 flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Patient</p>
                <p className="mt-1 font-semibold text-slate-900">{result.patient_name}</p>
              </div>
              <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border bg-white text-2xl font-bold shadow-sm ${result.diabetes_level === 'Normal' ? 'border-emerald-200 text-emerald-600' : result.diabetes_level === 'Pre-Diabetic' ? 'border-amber-200 text-amber-600' : 'border-rose-200 text-rose-600'}`}>
                {cfg.icon}
              </div>
            </div>
            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                { label: 'Acetone PPM', value: result.acetone_ppm },
                { label: 'Temperature', value: `${result.reading.temperature}°C` },
                { label: 'Humidity', value: `${result.reading.humidity}%` },
              ].map(s => (
                <div key={s.label} className="rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-sm">
                  <p className="text-xs text-slate-500">{s.label}</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">{s.value}</p>
                </div>
              ))}
            </div>
            {result.predicted_bgl && (
              <div className="mb-4 rounded-2xl border border-sky-200 bg-sky-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-700">Predicted Blood Glucose</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">{result.predicted_bgl.toFixed(1)} mg/dL</p>
              </div>
            )}
            <div className="rounded-2xl border border-white/80 bg-white/70 p-4">
              <p className={`text-lg font-bold ${result.diabetes_level === 'Normal' ? 'text-emerald-700' : result.diabetes_level === 'Pre-Diabetic' ? 'text-amber-700' : 'text-rose-700'}`}>{result.diabetes_level}</p>
              <p className="mt-1 text-sm text-slate-600">{result.suggestion}</p>
              {result.source && <p className="mt-3 text-xs text-slate-500">{result.source}</p>}
            </div>
          </div>
        )}

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/50 sm:p-6">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Acetone PPM Reference</p>
          <div className="space-y-2">
            {[
              { label: 'Normal', range: '< 1.8 PPM', color: 'text-emerald-700', bg: 'bg-emerald-50' },
              { label: 'Pre-Diabetic', range: '1.8 – 3.5 PPM', color: 'text-amber-700', bg: 'bg-amber-50' },
              { label: 'Diabetic', range: '> 3.5 PPM', color: 'text-rose-700', bg: 'bg-rose-50' },
            ].map(r => (
              <div key={r.label} className={`flex items-center justify-between rounded-xl px-4 py-2.5 ${r.bg}`}>
                <span className={`text-sm font-medium ${r.color}`}>{r.label}</span>
                <span className="font-mono text-sm text-slate-500">{r.range}</span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-center text-xs text-slate-400">For health monitoring purposes only. Not for medical diagnosis.</p>
        </div>
      </div>
    </div>
  );
}