import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';
import { useLogout } from '../hooks/useLogout';
import { useNavigation } from '@react-navigation/native';

export default function ScreenHeader({ title, subtitle, accent = '#3b82f6', showLogout = true, showAccount = true }) {
  const { user } = useAuth();
  const { handleLogout, loggingOut } = useLogout();
  const navigation = useNavigation();

  return (
    <LinearGradient
      colors={['#1768d2', '#183b83']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.wrap}
    >
      <View style={styles.left}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}
        {user?.full_name ? (
          <Text style={[styles.user, { color: '#bfdbfe' }]}>{user.full_name}</Text>
        ) : null}
      </View>
      <View style={{ gap: 8 }}>
      {showAccount && user && <TouchableOpacity accessibilityRole="button" accessibilityLabel="My account" onPress={() => navigation.navigate('Account')} style={styles.logout}><Text style={styles.logoutText}>Account</Text></TouchableOpacity>}
      {showLogout && (
        <TouchableOpacity
          onPress={handleLogout}
          disabled={loggingOut}
          style={[styles.logout, loggingOut && styles.logoutDisabled]}
        >
          {loggingOut ? (
            <ActivityIndicator size="small" color="#f87171" />
          ) : (
            <Text style={styles.logoutText}>Logout</Text>
          )}
        </TouchableOpacity>
      )}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 22,
    marginBottom: 14,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    overflow: 'hidden',
  },
  left: { flex: 1, paddingRight: 12 },
  title: { fontSize: 22, fontWeight: '700', color: '#ffffff' },
  sub: { fontSize: 12, color: '#dbeafe', marginTop: 5, lineHeight: 17 },
  user: { fontSize: 11, marginTop: 6, fontWeight: '600' },
  logout: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.32)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    minWidth: 72,
    alignItems: 'center',
  },
  logoutDisabled: { opacity: 0.6 },
  logoutText: { color: '#ffffff', fontSize: 12, fontWeight: '600' },
});
