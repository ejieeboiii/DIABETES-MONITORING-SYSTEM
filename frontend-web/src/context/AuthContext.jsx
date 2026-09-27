import { createContext, useContext, useState, useEffect } from 'react';
import { loginProvider, registerProvider, getProviderMe } from '../utils/api';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const savedRole = localStorage.getItem('role');
    if (token && savedRole) {
      if (savedRole !== 'medical') {
        localStorage.removeItem('token');
        localStorage.removeItem('role');
        setLoading(false);
        return;
      }
      getProviderMe()
        .then((res) => { setUser(res.data); setRole('medical'); })
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

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    setUser(null);
    setRole(null);
  };

  return (
    <AuthContext.Provider value={{ user, role, loginMedical, registerMedical, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);