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
    <div className="flex-1 bg-slate-950 overflow-auto">
      <div className="p-8 max-w-2xl mx-auto">
        <div className="mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Live Scan</h1>
            <p className="text-white/30 text-sm mt-1">Real MQ-138 breath scan — exhale on sensor after Start Listening</p>
          </div>
        </div>

        <div className="bg-white/3 border border-white/8 rounded-2xl p-2 mb-6">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMode('manual')}
              className={`rounded-xl px-4 py-2.5 text-sm font-medium transition-all ${
                mode === 'manual' ? 'bg-blue-500 text-white' : 'bg-white/5 text-white/50 hover:text-white'
              }`}
            >
              Manual Entry
            </button>
            <button
              type="button"
              onClick={() => setMode('listener')}
              className={`rounded-xl px-4 py-2.5 text-sm font-medium transition-all ${
                mode === 'listener' ? 'bg-blue-500 text-white' : 'bg-white/5 text-white/50 hover:text-white'
              }`}
            >
              ESP32 Listener
            </button>
          </div>
        </div>

        <div className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-6">
          <div className="space-y-4">
            <div>
              <label className="text-xs text-white/40 uppercase tracking-wider">Select Patient</label>
              <select name="patient_id" value={form.patient_id} onChange={handle} required
                className="mt-1 w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-400/50 text-sm">
                <option value="">-- Select a patient --</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>{p.full_name}</option>
                ))}
              </select>
              {form.patient_id && mode === 'listener' && (
                <div className="text-emerald-300/90 text-xs mt-2 space-y-1 leading-relaxed">
                  <p>1. Click <strong>Start Listening</strong> (patient set here).</p>
                  <p>2. On ESP32: wait 3 min warmup, then press button or type <span className="font-mono">s</span>.</p>
                  <p>3. When prompted, <strong>exhale steadily</strong> 6–8 s with lips 2–3 cm from the MQ-138.</p>
                </div>
              )}
            </div>
            {mode === 'manual' ? (
              <form onSubmit={scan} className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { name: 'raw_sensor_value', label: 'Raw ADC Value', placeholder: 'e.g. 1200', hint: '0 – 4095' },
                    { name: 'temperature', label: 'Temperature (°C)', placeholder: 'e.g. 28.5', hint: '' },
                    { name: 'humidity', label: 'Humidity (%)', placeholder: 'e.g. 65.0', hint: '' },
                  ].map(f => (
                    <div key={f.name}>
                      <label className="text-xs text-white/40 uppercase tracking-wider">{f.label}</label>
                      <input name={f.name} type="number" step="any" placeholder={f.placeholder} value={form[f.name]} onChange={handle} required
                        className="mt-1 w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-blue-400/50 text-sm" />
                      {f.hint && <p className="text-white/20 text-xs mt-1">{f.hint}</p>}
                    </div>
                  ))}
                </div>
                <button type="submit" disabled={scanning}
                  className="w-full bg-blue-500 hover:bg-blue-400 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2">
                  {scanning ? (
                    <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Analyzing...</>
                  ) : '⚡ Run Manual Scan'}
                </button>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="rounded-xl border border-white/10 bg-white/3 px-4 py-3">
                  <p className="text-white/70 text-xs uppercase tracking-wider">ESP32 Upload Endpoint</p>
                  <p className="text-white text-sm font-mono mt-1">POST {API_BASE_URL}/readings/sensor</p>
                  <p className="text-emerald-300/80 text-xs mt-2">
                    ESP32 uses <span className="font-mono">API_HOST</span> (your PC IP, e.g. http://10.0.0.51:8000). Patient comes from Start Listening.
                  </p>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/3 px-4 py-3">
                  <p className="text-white/70 text-xs uppercase tracking-wider">Listener Status</p>
                  <p className={`mt-1 text-sm ${listenerStatus === 'error' ? 'text-red-400' : listenerStatus === 'fallback' ? 'text-yellow-300' : 'text-emerald-300'}`}>
                    {listenerMessage}
                  </p>
                  <div className="mt-2 inline-flex items-center gap-2 rounded-lg bg-black/20 px-2.5 py-1">
                    <span className={`h-2 w-2 rounded-full ${socketConnected ? 'bg-emerald-400' : 'bg-yellow-400'}`} />
                    <span className="text-xs text-white/50">{socketConnected ? 'WebSocket connected' : 'Polling fallback'}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {!listenerActive ? (
                    <button
                      type="button"
                      onClick={startListening}
                      className="bg-blue-500 hover:bg-blue-400 text-white font-semibold py-3 rounded-xl transition-all"
                    >
                      Start Listening
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={stopListening}
                      className="bg-white/10 hover:bg-white/20 text-white font-semibold py-3 rounded-xl transition-all"
                    >
                      Stop Listening
                    </button>
                  )}
                </div>
              </div>
            )}
            {!backendReady && mode === 'listener' && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 text-amber-200 text-sm">
                Backend is missing the listener API. Restart uvicorn from the project <span className="font-mono">backend</span> folder, then refresh this page.
              </div>
            )}
            {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">{error}</div>}
          </div>
        </div>

        {result && cfg && (
          <div className={`${cfg.bg} border ${cfg.border} rounded-2xl p-6 ring-4 ${cfg.ring} mb-6`}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-white/50 text-xs uppercase tracking-wider">Patient</p>
                <p className="text-white font-semibold mt-0.5">{result.patient_name}</p>
              </div>
              <div className={`w-12 h-12 rounded-xl ${cfg.bg} border ${cfg.border} flex items-center justify-center text-2xl ${cfg.color} font-bold`}>
                {cfg.icon}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 mb-4">
              {[
                { label: 'Acetone PPM', value: result.acetone_ppm },
                { label: 'Temperature', value: `${result.reading.temperature}°C` },
                { label: 'Humidity', value: `${result.reading.humidity}%` },
              ].map(s => (
                <div key={s.label} className="bg-black/20 rounded-xl p-3 text-center">
                  <p className="text-white/30 text-xs">{s.label}</p>
                  <p className="text-white font-bold text-lg mt-1">{s.value}</p>
                </div>
              ))}
            </div>
            {result.predicted_bgl && (
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-3 mb-4">
                <p className="text-blue-300 text-xs uppercase tracking-wider">Predicted Blood Glucose</p>
                <p className="text-white font-bold text-2xl mt-1">{result.predicted_bgl.toFixed(1)} mg/dL</p>
              </div>
            )}
            <div className={`rounded-xl p-4 ${cfg.bg} border ${cfg.border}`}>
              <p className={`font-bold text-lg ${cfg.color}`}>{result.diabetes_level}</p>
              <p className="text-white/60 text-sm mt-1">{result.suggestion}</p>
              {result.source && <p className="text-white/40 text-xs mt-3">{result.source}</p>}
            </div>
          </div>
        )}

        <div className="bg-white/3 border border-white/8 rounded-2xl p-5">
          <p className="text-white/40 text-xs uppercase tracking-wider mb-3">Acetone PPM Reference</p>
          <div className="space-y-2">
            {[
              { label: 'Normal', range: '< 1.8 PPM', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
              { label: 'Pre-Diabetic', range: '1.8 – 3.5 PPM', color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
              { label: 'Diabetic', range: '> 3.5 PPM', color: 'text-red-400', bg: 'bg-red-500/10' },
            ].map(r => (
              <div key={r.label} className={`flex items-center justify-between ${r.bg} rounded-xl px-4 py-2.5`}>
                <span className={`text-sm font-medium ${r.color}`}>{r.label}</span>
                <span className="text-white/40 text-sm font-mono">{r.range}</span>
              </div>
            ))}
          </div>
          <p className="text-white/20 text-xs text-center mt-4">For health monitoring purposes only. Not for medical diagnosis.</p>
        </div>
      </div>
    </div>
  );
}