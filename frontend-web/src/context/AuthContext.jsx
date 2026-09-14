import { createContext, useContext, useState, useEffect } from 'react';
import { loginProvider, registerProvider, loginPatient, getProviderMe, getPatientMe } from '../utils/api';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const savedRole = localStorage.getItem('role');
    if (token && savedRole) {
      const fetchMe = savedRole === 'medical' ? getProviderMe : getPatientMe;
      fetchMe()
        .then((res) => { setUser(res.data); setRole(savedRole); })
        .catch(() => {
          localStorage.removeItem('token');
          localStorage.removeItem('role');
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const loginMedical = async (email, password) => {
    const res = await loginProvider({ email, password });
    localStorage.setItem('token', res.data.access_token);
    localStorage.setItem('role', 'medical');
    setUser(res.data.user);
    setRole('medical');
    return res.data;
  };

  const registerMedical = async (full_name, email, password, profession) => {
    const res = await registerProvider({ full_name, email, password, profession });
    localStorage.setItem('token', res.data.access_token);
    localStorage.setItem('role', 'medical');
    setUser(res.data.user);
    setRole('medical');
    return res.data;
  };

  const loginPatient = async (email, password) => {
    const res = await patientLogin({ email, password });
    localStorage.setItem('token', res.data.access_token);
    localStorage.setItem('role', 'patient');
    setUser(res.data.user);
    setRole('patient');
    return res.data;
  };

  const login = async (email, password, role = 'patient') => {
    if (role === 'medical') return loginMedical(email, password);
    return loginPatient(email, password);
  };

  const register = async (full_name, email, password, role = 'patient', profession = 'Doctor') => {
    if (role === 'medical') return registerMedical(full_name, email, password, profession);
    throw new Error('Patient registration is not supported in this app. Please contact your provider.');
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    setUser(null);
    setRole(null);
  };

  return (
    <AuthContext.Provider value={{ user, role, login, register, loginMedical, registerMedical, loginPatient, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);