import { useCallback, useEffect, useRef, useState } from 'react';
import { getLatestReading, getArmedPatient, getReadingsWebSocketUrl, startListener, stopListener, getScanStatus, getAcquisition } from '../utils/api';
import { apiErrorMessage } from '../utils/errors';

export default function useLiveScan(patientId, onReading) {
  const [active, setActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('Select a patient, then start listening.');
  const [error, setError] = useState('');
  const live = useRef(false);
  const pending = useRef(false);
  const latestId = useRef(0);
  const ownedSession = useRef(null);
  const callback = useRef(onReading);
  useEffect(() => { callback.current = onReading; }, [onReading]);
  useEffect(() => {
    live.current = true;
    return () => { live.current = false; };
  }, []);

  const start = async () => {
    if (pending.current || active || !patientId) return;
    pending.current = true;
    setStarting(true);
    setError('');
    try {
      // Snapshot before arming; ID zero also handles a patient with no history.
      const latest = await getLatestReading(Number(patientId)).catch((err) => {
        if (err.response?.status === 404 && err.response?.data?.detail === 'No readings found.') return { data: null };
        throw err;
      });
      latestId.current = latest.data?.id || 0;
      const response = await startListener(Number(patientId));
      if (!live.current) { await stopListener(response.data.session_id); return; }
      ownedSession.current = response.data.session_id;
      setActive(true);
      setStatus('armed');
      setMessage(response.data.message);
    } catch (err) {
      if (live.current) setError(apiErrorMessage(err));
    } finally {
      pending.current = false;
      if (live.current) setStarting(false);
    }
  };

  const stop = useCallback(async () => {
    const sessionId = ownedSession.current;
    if (!sessionId) return;
    ownedSession.current = null;
    setActive(false);
    setConnected(false);
    setStatus('idle');
    setMessage('Listener stopped.');
    try { await stopListener(sessionId); }
    catch (err) { if (live.current) setError(apiErrorMessage(err, 'Could not confirm listener stop. It expires after 15 minutes.')); }
  }, []);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let timer;
    const sessionId = ownedSession.current;
    const receive = (reading) => {
      if (cancelled || reading.patient_id !== Number(patientId) || reading.scan_session_id !== sessionId || reading.id <= latestId.current) return;
      latestId.current = reading.id;
      callback.current(reading);
      setStatus('packet');
      setMessage(`New reading received at ${new Date(reading.taken_at).toLocaleTimeString()}.`);
    };
    const ws = new WebSocket(getReadingsWebSocketUrl({ patientId }));
    ws.onopen = () => {
      if (cancelled) return;
      ws.send(JSON.stringify({ type: 'authenticate', token: localStorage.getItem('token'), patient_id: Number(patientId) }));
    };
    ws.onmessage = (event) => {
      if (cancelled) return;
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'connected') { setConnected(true); ws.send('ping'); }
        if (payload.type === 'reading_created') receive(payload.reading);
      } catch { /* Ignore invalid events; polling can still retrieve saved readings. */ }
    };
    ws.onclose = () => {
      if (!cancelled) {
        setConnected(false);
        setStatus('fallback');
        setMessage('Live connection unavailable. Checking for new readings every 3 seconds.');
      }
    };
    ws.onerror = () => { if (!cancelled) setConnected(false); };
    const poll = async () => {
      try {
        const session = await getArmedPatient();
        if (cancelled) return;
        if (!session.data.armed || session.data.patient_id !== Number(patientId) || session.data.session_id !== sessionId) {
          const scan = await getScanStatus(sessionId);
          if (cancelled) return;
          if (scan.data.status === 'completed' && scan.data.acquisition_id) {
            const saved = await getAcquisition(scan.data.acquisition_id).catch((err) => {
              if (err.response?.status === 410) return { data: null };
              throw err;
            });
            if (cancelled) return;
            if (saved.data) receive(saved.data.reading);
          }
          setActive(false);
          setConnected(false);
          setStatus(scan.data.status);
          setMessage(scan.data.status === 'completed' ? 'Scan completed and saved. Start a new session for another scan.' : `Scan ${scan.data.status}. Start again to continue.`);
          return;
        }
        if (ws.readyState !== WebSocket.OPEN) {
          const result = await getLatestReading(Number(patientId)).catch((err) => {
            if (err.response?.status === 404 && err.response?.data?.detail === 'No readings found.') return { data: null };
            throw err;
          });
          if (result.data) receive(result.data);
        }
      } catch (err) {
        if (!cancelled) { setStatus('error'); setMessage(apiErrorMessage(err)); }
      } finally {
        if (!cancelled) timer = setTimeout(poll, 3000);
      }
    };
    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      ws.close();
      // Server TTL also protects abandoned tabs if this request cannot be delivered.
      if (ownedSession.current === sessionId) ownedSession.current = null;
      stopListener(sessionId).catch(() => {});
    };
  }, [active, patientId]);

  return { active, starting, connected, status, message, error, start, stop };
}
