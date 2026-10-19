import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import { useAuth } from '../context/AuthContext';

export function useLogout() {
  const { logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = useCallback(async () => {
    if (loggingOut) return;

    Alert.alert('Sign out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          setLoggingOut(true);
          try {
            const result = await logout();
            if (result && !result.success) {
              Alert.alert(
                'Signed out locally',
                result.message || 'Your session was cleared on this device.',
              );
            }
          } catch (err) {
            Alert.alert(
              'Sign out issue',
              err?.message || 'Something went wrong, but you were signed out on this device.',
            );
          } finally {
            setLoggingOut(false);
          }
        },
      },
    ]);
  }, [logout, loggingOut]);

  return { handleLogout, loggingOut };
}
