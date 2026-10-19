import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { loginProvider, registerProvider, getProviderMe, subscribeSessionExpiry, updateProviderProfile } from '../utils/api';

import { apiErrorMessage } from '../utils/errors';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  const [sessionError, setSessionError] = useState('');
  const live = useRef(false);
  const profileSequence = useRef(0);
  const clearSession = useCallback(() => {
    profileSequence.current++;
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    if (live.current) { setUser(null); setRole(null); setSessionError(''); }
  }, []);
  const restore = useCallback(async () => {
    await Promise.resolve();
    if (!live.current) return;
    setLoading(true);
    const token = localStorage.getItem('token');
    try {
      const savedRole = localStorage.getItem('role');
      if (!token || savedRole !== 'medical') { clearSession(); return; }
      const response = await getProviderMe();
      if (!live.current || token !== localStorage.getItem('token')) return;
      setUser(response.data); setRole('medical'); setSessionError('');
    } catch (err) {
      if (!live.current || token !== localStorage.getItem('token')) return;
      if ([401, 403].includes(err.response?.status)) clearSession();
      else setSessionError(apiErrorMessage(err, 'Could not restore your session.'));
    } finally { if (live.current) setLoading(false); }
  }, [clearSession]);
  useEffect(() => {
    live.current = true;
    const unsubscribe = subscribeSessionExpiry(clearSession);
    const storageChanged = (event) => {
      if (event.key !== 'token' && event.key !== 'role') return;
      if (!localStorage.getItem('token')) clearSession();
      else restore();
    };
    window.addEventListener('storage', storageChanged);
    queueMicrotask(() => { if (live.current) restore(); });
    return () => { live.current = false; unsubscribe(); window.removeEventListener('storage', storageChanged); };
  }, [restore, clearSession]);

  const loginMedical = async (email, password) => {
    const res = await loginProvider({ email, password });
    localStorage.setItem('token', res.data.access_token);
    localStorage.setItem('role', 'medical');
    setUser(res.data.user);
    setRole('medical');
    setSessionError('');
    return res.data;
  };

  const registerMedical = async (full_name, email, password, profession) => {
    const res = await registerProvider({ full_name, email, password, profession });
    localStorage.setItem('token', res.data.access_token);
    localStorage.setItem('role', 'medical');
    setUser(res.data.user);
    setRole('medical');
    setSessionError('');
    return res.data;
  };

  const logout = clearSession;
  const updateProfile = async (data) => {
    const token = localStorage.getItem('token');
    const request = ++profileSequence.current;
    const response = await updateProviderProfile(data);
    if (live.current && request === profileSequence.current && token === localStorage.getItem('token')) setUser(response.data);
    return response.data;
  };

  return (
    <AuthContext.Provider value={{ user, role, loginMedical, registerMedical, logout, loading, sessionError, retrySession: restore, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

// The shared auth hook remains at its established import path.
// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);
