import { useCallback, useEffect, useRef, useState } from 'react';
import { getMyReadings } from '../utils/api';
import { apiErrorMessage } from '../utils/errors';
import { useFocusEffect } from '@react-navigation/native';
import { AppState } from 'react-native';
import { useAuth } from '../context/AuthContext';

export default function usePatientReadings() {
  const { refreshProfile } = useAuth();
  const [readings, setReadings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const active = useRef(false);
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const request = ++sequence.current;
    try {
      const [response] = await Promise.all([getMyReadings(), refreshProfile()]);
      if (!active.current || request !== sequence.current) return;
      setReadings(response.data);
      setError('');
    } catch (err) {
      if (active.current && request === sequence.current) setError(apiErrorMessage(err));
    } finally {
      if (active.current && request === sequence.current) { setLoading(false); setRefreshing(false); }
    }
  }, [refreshProfile]);
  const refresh = () => { setRefreshing(true); load(); };
  useFocusEffect(useCallback(() => {
    active.current = true;
    load();
    return () => { active.current = false; sequence.current++; };
  }, [load]));
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active' && active.current) load();
    });
    return () => subscription.remove();
  }, [load]);
  return { readings, latest: readings[0] || null, loading, refreshing, error, load, refresh };
}
