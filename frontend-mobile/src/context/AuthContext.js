import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  loginPatient,
  getPatientMe,
  subscribeSessionExpiry,
  updatePatientProfile,
} from '../utils/api';

import { apiErrorMessage } from '../utils/errors';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  const [sessionError, setSessionError] = useState('');
  const live = useRef(false);
  const profileSequence = useRef(0);
  const clearInvalidSession = useCallback(async () => {
    profileSequence.current++;
    try { await AsyncStorage.multiRemove(['token', 'role']); }
    finally { if (live.current) { setUser(null); setRole(null); setSessionError(''); } }
  }, []);
  const restore = useCallback(async () => {
    if (!live.current) return;
    setLoading(true);
    let token;
    try {
      token = await AsyncStorage.getItem('token');
      const savedRole = await AsyncStorage.getItem('role');
      if (!token || savedRole !== 'patient') { await clearInvalidSession(); return; }
      const response = await getPatientMe();
      if (!live.current || token !== await AsyncStorage.getItem('token')) return;
      setUser(response.data); setRole('patient'); setSessionError('');
    } catch (err) {
      if (!live.current || (token && token !== await AsyncStorage.getItem('token'))) return;
      if ([401, 403].includes(err.response?.status)) await clearInvalidSession();
      else setSessionError(apiErrorMessage(err, 'Could not restore your session.'));
    } finally { if (live.current) setLoading(false); }
  }, [clearInvalidSession]);
  useEffect(() => {
    live.current = true;
    const unsubscribe = subscribeSessionExpiry(() => { clearInvalidSession().catch(() => {}); });
    restore();
    return () => { live.current = false; unsubscribe(); };
  }, [restore, clearInvalidSession]);

  const applyAuthResponse = async (data) => {
    if (data?.role !== 'patient' || !data?.access_token || !data?.user) {
      throw new Error('Invalid response from server');
    }
    profileSequence.current++;
    await AsyncStorage.setItem('token', data.access_token);
    await AsyncStorage.setItem('role', 'patient');
    setUser(data.user);
    setRole('patient');
    setSessionError('');
    return data;
  };

  const login = async (email, password) => {
    const res = await loginPatient({ email, password });
    return applyAuthResponse(res.data);
  };

  const logout = async () => {
    profileSequence.current++;
    setSessionError('');
    try {
      await AsyncStorage.multiRemove(['token', 'role']);
    } catch (err) {
      console.error('Logout storage error:', err);
      setUser(null);
      setRole(null);
      return {
        success: false,
        message: 'Could not clear saved session data. You have been signed out on this device.',
      };
    }
    setUser(null);
    setRole(null);
    return { success: true };
  };

  const updateProfile = async (data) => {
    const token = await AsyncStorage.getItem('token');
    const request = ++profileSequence.current;
    const response = await updatePatientProfile(data);
    if (live.current && request === profileSequence.current && token === await AsyncStorage.getItem('token')) setUser(response.data);
    return response.data;
  };
  const refreshProfile = useCallback(async () => {
    const token = await AsyncStorage.getItem('token');
    if (!token) return;
    const request = ++profileSequence.current;
    const response = await getPatientMe();
    if (live.current && request === profileSequence.current && token === await AsyncStorage.getItem('token')) setUser(response.data);
    return response.data;
  }, []);

  return (
    <AuthContext.Provider value={{ user, role, login, logout, loading, sessionError, retrySession: restore, updateProfile, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
