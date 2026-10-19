import { useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, StyleSheet, View, Alert } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { changePatientPassword } from '../../utils/api';
import { apiErrorMessage } from '../../utils/errors';
import ScreenHeader from '../../components/ScreenHeader';

export default function AccountScreen() {
  const { user, updateProfile, logout } = useAuth();
  const [profile, setProfile] = useState({ full_name: user.full_name, contact: user.contact || '' });
  const [password, setPassword] = useState({ current_password: '', new_password: '' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const submit = async (kind) => {
    setBusy(true); setError(''); setMessage('');
    try {
      if (kind === 'profile') { await updateProfile(profile); setMessage('Profile saved.'); }
      else {
        await changePatientPassword(password);
        setPassword({ current_password: '', new_password: '' });
        await logout();
        Alert.alert('Password changed', 'Sign in with your new password.');
      }
    } catch (err) { setError(apiErrorMessage(err)); }
    finally { setBusy(false); }
  };
  return <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
    <ScreenHeader title="My account" showAccount={false} />
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {message ? <Text style={styles.message}>{message}</Text> : null}
    <View style={styles.card}>
      <Text style={styles.title}>Profile</Text>
      <Text style={styles.label}>Login email: {user.email}</Text>
      {['full_name', 'contact'].map((field) => <View key={field}><Text style={styles.label}>{field === 'full_name' ? 'Full name' : 'Contact'}</Text><TextInput accessibilityLabel={field === 'full_name' ? 'Full name' : 'Contact'} style={styles.input} value={profile[field]} onChangeText={(text) => setProfile({ ...profile, [field]: text })} /></View>)}
      <TouchableOpacity accessibilityRole="button" disabled={busy} style={styles.button} onPress={() => submit('profile')}><Text style={styles.buttonText}>Save profile</Text></TouchableOpacity>
    </View>
    <View style={styles.card}>
      <Text style={styles.title}>Change password</Text>
      {['current_password', 'new_password'].map((field) => <View key={field}><Text style={styles.label}>{field === 'current_password' ? 'Current password' : 'New password (8 characters minimum)'}</Text><TextInput accessibilityLabel={field === 'current_password' ? 'Current password' : 'New password'} secureTextEntry autoCapitalize="none" autoCorrect={false} style={styles.input} maxLength={72} value={password[field]} onChangeText={(text) => setPassword({ ...password, [field]: text })} /></View>)}
      <TouchableOpacity accessibilityRole="button" disabled={busy} style={styles.button} onPress={() => submit('password')}><Text style={styles.buttonText}>Change password</Text></TouchableOpacity>
    </View>
    <TouchableOpacity accessibilityRole="button" style={[styles.button, { margin: 16 }]} onPress={logout}><Text style={styles.buttonText}>Sign out</Text></TouchableOpacity>
  </ScrollView>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f7fb' },
  card: { margin: 16, marginTop: 0, padding: 16, borderRadius: 18, backgroundColor: '#fff', gap: 12 },
  title: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  label: { fontSize: 13, color: '#475569', marginBottom: 6 },
  input: { padding: 12, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, color: '#0f172a' },
  button: { padding: 14, borderRadius: 12, backgroundColor: '#2563eb', minHeight: 44 },
  buttonText: { color: '#fff', textAlign: 'center', fontWeight: '600' },
  error: { margin: 16, color: '#9f1239' },
  message: { margin: 16, color: '#0369a1' },
});
