import { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { setAuthNotice } from '../utils/authNotice';

export function useLogout() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);
  const inFlight = useRef(false);

  const handleLogout = useCallback(async () => {
    if (inFlight.current) return;

    const confirmed = window.confirm('Are you sure you want to sign out?');
    if (!confirmed) return;

    inFlight.current = true;
    setLoggingOut(true);

    try {
      const result = await logout();

      if (result?.success === false) {
        setAuthNotice(
          'warning',
          result.message || 'Could not fully clear your session. You have been signed out on this page.',
        );
      } else {
        setAuthNotice('success', 'You have been signed out successfully.');
      }

      navigate('/', { replace: true });
    } catch (err) {
      setAuthNotice(
        'warning',
        err?.message || 'Something went wrong while signing out. You have been signed out on this device.',
      );
      try {
        navigate('/', { replace: true });
      } catch {
        window.location.href = '/';
      }
    } finally {
      setLoggingOut(false);
      inFlight.current = false;
    }
  }, [logout, navigate]);

  return { handleLogout, loggingOut };
}
