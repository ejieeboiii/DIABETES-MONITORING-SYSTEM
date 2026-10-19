import { useEffect, useState } from 'react';
import {
  View, Text, Modal, TouchableOpacity, TextInput, StyleSheet,
  ScrollView, ActivityIndicator, Pressable,
} from 'react-native';
import { getLatestReading, resetPatientPassword } from '../utils/api';
import LevelBadge from './LevelBadge';
import PatientCredentialsBanner from './PatientCredentialsBanner';

export default function PatientDetailModal({ patient, visible, onClose, navigation }) {
  const [latest, setLatest] = useState(null);
  const [loadingReading, setLoadingReading] = useState(true);
  const [resetMode, setResetMode] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState('');
  const [credentials, setCredentials] = useState(null);

  useEffect(() => {
    if (!visible || !patient?.id) return;
    setLoadingReading(true);
    setResetMode(false);
    setNewPassword('');
    setResetError('');
    getLatestReading(patient.id)
      .then((r) => setLatest(r.data))
      .catch(() => setLatest(null))
      .finally(() => setLoadingReading(false));
  }, [visible, patient?.id]);

  if (!patient) return null;

  const handleReset = async () => {
    setResetting(true);
    setResetError('');
    try {
      const body = newPassword.trim() ? { new_password: newPassword.trim() } : {};
      const res = await resetPatientPassword(patient.id, body);
      setCredentials({ email: res.data.email, password: res.data.temporary_password });
      setNewPassword('');
      setResetMode(false);
    } catch (err) {
      setResetError(err.response?.data?.detail || 'Failed to reset password.');
    } finally {
      setResetting(false);
    }
  };

  const goTo = (screen) => {
    onClose();
    navigation.navigate(screen, { patientId: patient.id });
  };

  const created = patient.created_at
    ? new Date(patient.created_at).toLocaleDateString()
    : '—';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
        <View style={styles.handle} />
        <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{patient.full_name[0]}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{patient.full_name}</Text>
              <Text style={styles.sub}>Patient profile</Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.close}>×</Text>
            </TouchableOpacity>
          </View>

          {credentials && (
            <PatientCredentialsBanner
              email={credentials.email}
              password={credentials.password}
              title="New temporary password"
              onDismiss={() => setCredentials(null)}
            />
          )}

          <View style={styles.grid}>
            {[
              { label: 'Age', value: `${patient.age} years` },
              { label: 'Gender', value: patient.gender },
              { label: 'Diabetes', value: patient.is_diabetic || 'Unknown' },
              { label: 'Registered', value: created },
            ].map((row) => (
              <View key={row.label} style={styles.gridItem}>
                <Text style={styles.gridLabel}>{row.label}</Text>
                <Text style={styles.gridValue}>{row.value}</Text>
              </View>
            ))}
          </View>

          <View style={styles.block}>
            <Text style={styles.blockLabel}>CONTACT & LOGIN</Text>
            <Text style={styles.blockText}>Email: {patient.email}</Text>
            {patient.contact ? <Text style={styles.blockText}>Phone: {patient.contact}</Text> : null}
            <Text style={styles.blockHint}>Password is hidden. Reset below if needed.</Text>
          </View>

          <View style={styles.block}>
            <Text style={styles.blockLabel}>LATEST READING</Text>
            {loadingReading ? (
              <ActivityIndicator color="#3b82f6" style={{ marginTop: 8 }} />
            ) : latest ? (
              <View style={styles.latestRow}>
                <View>
                  <Text style={styles.ppm}>{latest.acetone_ppm} ppm</Text>
                  <Text style={styles.meta}>{new Date(latest.taken_at).toLocaleString()}</Text>
                </View>
                <LevelBadge level={latest.diabetes_level} small />
              </View>
            ) : (
              <Text style={styles.blockHint}>No readings yet.</Text>
            )}
          </View>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.actionBtn} onPress={() => goTo('Readings')}>
              <Text style={styles.actionText}>View readings</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, styles.actionSecondary]} onPress={() => goTo('Trends')}>
              <Text style={styles.actionText}>Trends</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, styles.actionSecondary]} onPress={() => goTo('Live Scan')}>
              <Text style={styles.actionText}>Live scan</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.resetSection}>
            {!resetMode ? (
              <TouchableOpacity onPress={() => setResetMode(true)}>
                <Text style={styles.resetLink}>Reset patient password</Text>
              </TouchableOpacity>
            ) : (
              <>
                <Text style={styles.blockHint}>Leave blank to auto-generate a temporary password.</Text>
                <TextInput
                  style={styles.input}
                  placeholder="New password (optional)"
                  placeholderTextColor="#94a3b8"
                  value={newPassword}
                  onChangeText={setNewPassword}
                />
                {resetError ? <Text style={styles.error}>{resetError}</Text> : null}
                <View style={styles.resetBtns}>
                  <TouchableOpacity style={styles.resetConfirm} onPress={handleReset} disabled={resetting}>
                    {resetting ? <ActivityIndicator color="#fff" /> : <Text style={styles.resetConfirmText}>Confirm reset</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setResetMode(false); setNewPassword(''); }}>
                    <Text style={styles.cancel}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    maxHeight: '88%',
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  handle: { width: 40, height: 4, backgroundColor: '#cbd5e1', borderRadius: 2, alignSelf: 'center', marginTop: 10 },
  scroll: { padding: 20, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 14, backgroundColor: '#e0f2fe', justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#0369a1', fontWeight: 'bold', fontSize: 18 },
  name: { color: '#0f172a', fontWeight: '700', fontSize: 18 },
  sub: { color: '#64748b', fontSize: 12 },
  close: { color: '#64748b', fontSize: 28 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  gridItem: { width: '47%', backgroundColor: '#ffffff', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  gridLabel: { fontSize: 10, color: '#64748b', textTransform: 'uppercase' },
  gridValue: { color: '#0f172a', fontSize: 13, marginTop: 4, fontWeight: '600' },
  block: { backgroundColor: '#ffffff', borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  blockLabel: { fontSize: 10, color: '#64748b', fontWeight: '600', marginBottom: 8 },
  blockText: { color: '#0f172a', fontSize: 13, marginBottom: 4 },
  blockHint: { color: '#64748b', fontSize: 11, marginTop: 4 },
  latestRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  ppm: { color: '#0f172a', fontSize: 20, fontWeight: 'bold' },
  meta: { color: '#64748b', fontSize: 11, marginTop: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  actionBtn: { backgroundColor: '#0284c7', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: '#0284c7' },
  actionSecondary: { backgroundColor: '#f1f5f9', borderColor: '#e2e8f0' },
  actionText: { color: '#ffffff', fontSize: 12, fontWeight: '600' },
  resetSection: { borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingTop: 16 },
  resetLink: { color: '#b45309', fontWeight: '600', fontSize: 14 },
  input: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, padding: 12, color: '#0f172a', marginTop: 8 },
  error: { color: '#be123c', fontSize: 12, marginTop: 8 },
  resetBtns: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
  resetConfirm: { backgroundColor: '#d97706', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, minWidth: 120, alignItems: 'center' },
  resetConfirmText: { color: '#fff', fontWeight: '700' },
  cancel: { color: '#64748b', fontSize: 14 },
});
