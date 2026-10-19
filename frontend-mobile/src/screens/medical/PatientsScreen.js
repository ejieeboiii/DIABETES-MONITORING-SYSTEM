import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Alert, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { getPatients, addPatient, deletePatient } from '../../utils/api';
import LoadingView from '../../components/LoadingView';
import EmptyState from '../../components/EmptyState';
import PatientDetailModal from '../../components/PatientDetailModal';
import PatientCredentialsBanner from '../../components/PatientCredentialsBanner';

export default function PatientsScreen() {
  const navigation = useNavigation();
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    password: '',
    age: '',
    gender: 'Male',
    contact: '',
    is_diabetic: 'Unknown',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [newAccountCredentials, setNewAccountCredentials] = useState(null);

  const load = async () => {
    try {
      const r = await getPatients();
      setPatients(r.data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handle = (key, val) => setForm({ ...form, [key]: val });

  const submit = async () => {
    if (!form.full_name || !form.age || !form.email || !form.password) {
      setError('Name, email, password, and age are required.');
      return;
    }
    setSubmitting(true);
    setError('');
    const emailUsed = form.email;
    const passwordUsed = form.password;
    try {
      await addPatient({ ...form, age: parseInt(form.age, 10) });
      setNewAccountCredentials({ email: emailUsed, password: passwordUsed });
      setForm({
        full_name: '',
        email: '',
        password: '',
        age: '',
        gender: 'Male',
        contact: '',
        is_diabetic: 'Unknown',
      });
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to add patient.');
    } finally {
      setSubmitting(false);
    }
  };

  const remove = (id, name) => {
    Alert.alert('Delete Patient', `Delete "${name}"? All their readings will also be deleted.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deletePatient(id);
          if (selectedPatient?.id === id) setSelectedPatient(null);
          load();
        },
      },
    ]);
  };

  if (loading) return <LoadingView />;

  return (
    <>
      <ScrollView
        style={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#3b82f6" />}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Patients</Text>
            <Text style={styles.sub}>{patients.length} registered · tap for details</Text>
          </View>
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowForm(!showForm)}>
            <Text style={styles.addBtnText}>{showForm ? 'Close' : '+ Add'}</Text>
          </TouchableOpacity>
        </View>

        {newAccountCredentials && (
          <PatientCredentialsBanner
            email={newAccountCredentials.email}
            password={newAccountCredentials.password}
            title="Patient account created"
            onDismiss={() => setNewAccountCredentials(null)}
          />
        )}

        {showForm && (
          <View style={styles.form}>
            <Text style={styles.formTitle}>New Patient Account</Text>
            <Text style={styles.formHint}>Credentials are shown once after you save.</Text>
            {[
              { key: 'full_name', label: 'Full Name', placeholder: 'Juan Dela Cruz' },
              { key: 'email', label: 'Email', placeholder: 'patient@email.com', keyboardType: 'email-address' },
              { key: 'password', label: 'Password', placeholder: 'Set patient password', secure: true },
              { key: 'age', label: 'Age', placeholder: '45', keyboardType: 'numeric' },
              { key: 'contact', label: 'Contact (Optional)', placeholder: '09XX-XXX-XXXX', keyboardType: 'phone-pad' },
            ].map((f) => (
              <View key={f.key} style={styles.field}>
                <Text style={styles.label}>{f.label.toUpperCase()}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={f.placeholder}
                  placeholderTextColor="#94a3b8"
                  keyboardType={f.keyboardType || 'default'}
                  secureTextEntry={f.secure}
                  autoCapitalize={f.key === 'email' ? 'none' : 'words'}
                  value={form[f.key]}
                  onChangeText={(v) => handle(f.key, v)}
                />
              </View>
            ))}
            <View style={styles.field}>
              <Text style={styles.label}>GENDER</Text>
              <View style={styles.genderRow}>
                {['Male', 'Female', 'Other'].map((g) => (
                  <TouchableOpacity
                    key={g}
                    style={[styles.genderBtn, form.gender === g && styles.genderBtnActive]}
                    onPress={() => handle('gender', g)}
                  >
                    <Text style={[styles.genderText, form.gender === g && styles.genderTextActive]}>{g}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>DIABETES STATUS</Text>
              <View style={styles.genderRow}>
                {['Unknown', 'Yes', 'No'].map((d) => (
                  <TouchableOpacity
                    key={d}
                    style={[styles.genderBtn, form.is_diabetic === d && styles.genderBtnActive]}
                    onPress={() => handle('is_diabetic', d)}
                  >
                    <Text style={[styles.genderText, form.is_diabetic === d && styles.genderTextActive]}>{d}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            <TouchableOpacity style={styles.saveBtn} onPress={submit} disabled={submitting}>
              <Text style={styles.saveBtnText}>{submitting ? 'Saving...' : 'Save Patient'}</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.list}>
          {patients.length === 0 ? (
            <EmptyState message="No patients yet. Add your first patient account!" />
          ) : (
            patients.map((p) => (
              <View key={p.id} style={styles.card}>
                <TouchableOpacity style={styles.cardMain} onPress={() => setSelectedPatient(p)} activeOpacity={0.7}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{p.full_name[0]}</Text>
                  </View>
                  <View style={styles.cardInfo}>
                    <Text style={styles.cardName}>{p.full_name}</Text>
                    <Text style={styles.cardMeta}>
                      {p.age} yrs · {p.gender}
                      {p.is_diabetic && p.is_diabetic !== 'Unknown' ? ` · ${p.is_diabetic}` : ''}
                    </Text>
                    {p.email ? <Text style={styles.cardEmail}>{p.email}</Text> : null}
                  </View>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => remove(p.id, p.full_name)} style={styles.deleteBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={styles.deleteIcon}>🗑</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>
        <View style={{ height: 32 }} />
      </ScrollView>

      <PatientDetailModal
        patient={selectedPatient}
        visible={!!selectedPatient}
        onClose={() => setSelectedPatient(null)}
        navigation={navigation}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 16 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#0f172a' },
  sub: { fontSize: 12, color: '#64748b', marginTop: 2 },
  addBtn: { backgroundColor: '#0284c7', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12 },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  form: { marginHorizontal: 16, backgroundColor: '#ffffff', borderRadius: 18, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: '#e2e8f0' },
  formTitle: { color: '#0f172a', fontWeight: '700', fontSize: 15, marginBottom: 4 },
  formHint: { color: '#64748b', fontSize: 11, marginBottom: 14 },
  field: { marginBottom: 14 },
  label: { fontSize: 10, color: '#64748b', fontWeight: '600', letterSpacing: 1, marginBottom: 6 },
  input: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, color: '#0f172a', fontSize: 14 },
  genderRow: { flexDirection: 'row', gap: 8 },
  genderBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center' },
  genderBtnActive: { backgroundColor: '#f0f9ff', borderColor: '#7dd3fc' },
  genderText: { color: '#64748b', fontWeight: '600', fontSize: 12 },
  genderTextActive: { color: '#0369a1' },
  errorText: { color: '#be123c', fontSize: 13, marginBottom: 10 },
  saveBtn: { backgroundColor: '#0284c7', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  list: { paddingHorizontal: 16 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff', borderRadius: 16, marginBottom: 8, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' },
  cardMain: { flex: 1, flexDirection: 'row', alignItems: 'center', padding: 14 },
  avatar: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#e0f2fe', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText: { color: '#0369a1', fontWeight: 'bold', fontSize: 16 },
  cardInfo: { flex: 1 },
  cardName: { color: '#0f172a', fontWeight: '600', fontSize: 14 },
  cardMeta: { color: '#64748b', fontSize: 12, marginTop: 2 },
  cardEmail: { color: '#0369a1', fontSize: 11, marginTop: 2 },
  deleteBtn: { padding: 6 },
  deleteIcon: { fontSize: 16 },
});
