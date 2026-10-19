import { useCallback, useEffect, useRef, useState } from 'react';
import { getAllReadings, getPatients } from '../utils/api';
import { apiErrorMessage } from '../utils/errors';

export default function useProviderData() {
  const [data, setData] = useState({ patients: [], readings: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const active = useRef(false);
  const sequence = useRef(0);
  const invalidateRequests = useCallback(() => { sequence.current++; }, []);
  const load = useCallback(async () => {
    const request = ++sequence.current;
    try {
      const [p, r] = await Promise.all([getPatients(), getAllReadings()]);
      if (!active.current || request !== sequence.current) return;
      setData({ patients: p.data, readings: r.data });
      setError('');
    } catch (err) {
      if (active.current && request === sequence.current) setError(apiErrorMessage(err));
    } finally {
      if (active.current && request === sequence.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    active.current = true;
    const refreshVisible = () => { if (document.visibilityState === 'visible' && active.current) load(); };
    window.addEventListener('focus', refreshVisible);
    document.addEventListener('visibilitychange', refreshVisible);
    queueMicrotask(() => { if (active.current) load(); });
    return () => {
      active.current = false; invalidateRequests();
      window.removeEventListener('focus', refreshVisible);
      document.removeEventListener('visibilitychange', refreshVisible);
    };
  }, [load, invalidateRequests]);
  return { ...data, loading, error, load };
}
