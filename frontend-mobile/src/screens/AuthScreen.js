import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../utils/api';
import { getApiSetupHint } from '../utils/apiBaseUrl';

function formatAuthError(err) {
  if (err.message === 'Invalid response from server') {
    return 'Login succeeded but server response was unexpected. Check backend is running.';
  }
  const detail = err.response?.data?.detail;
  if (Array.isArray(detail)) {
    return detail.map((e) => e.msg).join(', ');
  }
  if (typeof detail === 'string') {
    return detail;
  }
  if (!err.response) {
    return `Cannot reach the server at ${API_BASE_URL}. ${getApiSetupHint()}`;
  }
  return 'Something went wrong. Try again.';
}

export default function AuthScreen() {
  const [form, setForm] = useState({ full_name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handle = (key, val) => setForm({ ...form, [key]: val });

  const submit = async () => {
    setError('');
    if (!form.email || !form.password) {
      setError('Email and password are required.');
      return;
    }
    setLoading(true);
    try {
      await login(form.email, form.password);
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const buttonLabel = loading ? 'Please wait...' : 'Login as Patient';

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <StatusBar style="light" backgroundColor="#174a99" />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.content}>
          <LinearGradient colors={['#1768d2', '#183b83']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
            <View style={styles.headerActions}>
              <View style={styles.headerIconButton} accessibilityRole="image" accessibilityLabel="Back">
                <Text style={styles.backIcon}>‹</Text>
              </View>
              <View style={styles.headerIconButton} accessibilityRole="image" accessibilityLabel="Settings">
                <Text style={styles.settingsIcon}>⚙</Text>
              </View>
            </View>

            <View style={styles.logoContainer}>
              <LinearGradient colors={['#20B8E8', '#1475C9']} style={styles.logoBox}>
                <Text style={styles.logoIcon}>⚕</Text>
              </LinearGradient>
              <Text style={styles.logoTitle}>BreathDx</Text>
              <Text style={styles.logoSub}>Health Monitoring System</Text>
            </View>

            <View pointerEvents="none" style={styles.waveBack} />
            <View pointerEvents="none" style={styles.waveFront} />
          </LinearGradient>

          <View style={styles.card}>
            <Text style={styles.roleHint}>For personal health monitoring</Text>

            <View style={styles.field}>
              <Text style={styles.label}>EMAIL</Text>
              <View style={styles.inputWrap}>
                <Text style={styles.inputIcon}>✉</Text>
                <TextInput
                  style={styles.input}
                  placeholder="patient@email.com"
                  placeholderTextColor="#91A8BF"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={form.email}
                  onChangeText={(v) => handle('email', v)}
                />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>PASSWORD</Text>
              <View style={styles.inputWrap}>
                <View style={styles.lockIcon}>
                  <View style={styles.lockShackle} />
                  <View style={styles.lockBody}><View style={styles.lockKey} /></View>
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="••••••••"
                  placeholderTextColor="#91A8BF"
                  secureTextEntry
                  value={form.password}
                  onChangeText={(v) => handle('password', v)}
                />
              </View>
            </View>

            <Text style={styles.patientNote}>
              Patient accounts are created by your healthcare provider. Use the credentials they gave you.
            </Text>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TouchableOpacity style={styles.btn} onPress={submit} disabled={loading} activeOpacity={0.86}>
              <LinearGradient colors={['#2563eb', '#174a99']} style={styles.btnGradient}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>{buttonLabel}</Text>}
              </LinearGradient>
            </TouchableOpacity>
          </View>

        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f4f7fb' },
  flex: { flex: 1 },
  content: { flex: 1 },
  header: { height: 230, position: 'relative', zIndex: 2, overflow: 'visible' },
  headerActions: { position: 'absolute', top: 12, left: 20, right: 20, zIndex: 3, flexDirection: 'row', justifyContent: 'space-between' },
  headerIconButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(169,196,223,0.12)', alignItems: 'center', justifyContent: 'center' },
  backIcon: { color: '#bfdbfe', fontSize: 38, lineHeight: 42, marginTop: -4 },
  settingsIcon: { color: '#D7E8F7', fontSize: 23 },
  logoContainer: { position: 'absolute', top: 48, left: 0, right: 0, alignItems: 'center', zIndex: 2 },
  logoBox: { width: 68, height: 68, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginBottom: 8, elevation: 8 },
  logoIcon: { fontSize: 36, color: '#FFFFFF' },
  logoTitle: { fontSize: 29, fontWeight: '800', color: '#FFFFFF' },
  logoSub: { fontSize: 14, color: '#A9C4DF', marginTop: 2 },
  waveBack: { position: 'absolute', height: 120, width: '140%', left: '-20%', bottom: -48, borderRadius: 100, backgroundColor: '#1b4c91', transform: [{ rotate: '-5deg' }] },
  waveFront: { position: 'absolute', height: 96, width: '145%', left: '20%', bottom: -58, borderRadius: 100, backgroundColor: '#2864aa', opacity: 0.72, transform: [{ rotate: '7deg' }] },
  card: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 30, borderTopRightRadius: 30, marginHorizontal: 20, marginTop: 60, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 22, zIndex: 1, elevation: 9, shadowColor: '#163653', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.11, shadowRadius: 18 },
  roleHint: { textAlign: 'center', color: '#426482', fontSize: 16, fontWeight: '500', marginBottom: 20 },
  field: { marginBottom: 16 },
  label: { fontSize: 12, color: '#426482', fontWeight: '700', letterSpacing: 1.6, marginBottom: 8 },
  inputWrap: { minHeight: 56, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#D4E2EF', borderRadius: 17, paddingHorizontal: 18 },
  inputIcon: { width: 34, color: '#6686A6', fontSize: 24, marginRight: 12, textAlign: 'center' },
  input: { flex: 1, minHeight: 54, paddingVertical: 10, paddingHorizontal: 0, color: '#19263D', fontSize: 16 },
  lockIcon: { width: 24, height: 27, alignItems: 'center', justifyContent: 'flex-end', marginRight: 22 },
  lockShackle: { width: 14, height: 12, borderWidth: 2, borderColor: '#6686A6', borderBottomWidth: 0, borderTopLeftRadius: 8, borderTopRightRadius: 8, marginBottom: -1 },
  lockBody: { width: 23, height: 17, borderWidth: 2, borderColor: '#6686A6', borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  lockKey: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#6686A6' },
  patientNote: { color: '#526F8B', fontSize: 13, marginBottom: 18, lineHeight: 19 },
  error: { color: '#A5233C', fontSize: 13, marginBottom: 14, backgroundColor: '#FFF0F2', padding: 12, borderRadius: 10 },
  btn: { borderRadius: 17, marginTop: 2, elevation: 5, shadowColor: '#174a99', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.2, shadowRadius: 9 },
  btnGradient: { minHeight: 58, borderRadius: 17, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  btnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 17 },
});
