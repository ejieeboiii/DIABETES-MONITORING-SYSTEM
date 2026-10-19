import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';

export default function PatientCredentialsBanner({ email, password, onDismiss, title = 'Login credentials (shown once)' }) {
  if (!email || !password) return null;

  const copy = () => {
    const text = `Email: ${email}\nPassword: ${password}`;
    Alert.alert('Patient login credentials', text, [{ text: 'OK' }]);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.title}>{title}</Text>
        {onDismiss && (
          <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.close}>×</Text>
          </TouchableOpacity>
        )}
      </View>
      <Text style={styles.hint}>Share with the patient. Password cannot be viewed again after dismiss.</Text>
      <View style={styles.row}>
        <View style={styles.box}>
          <Text style={styles.label}>EMAIL</Text>
          <Text style={styles.value}>{email}</Text>
        </View>
        <View style={styles.box}>
          <Text style={styles.label}>PASSWORD</Text>
          <Text style={styles.value}>{password}</Text>
        </View>
      </View>
      <TouchableOpacity style={styles.btn} onPress={copy}>
        <Text style={styles.btnText}>Copy credentials</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: 'rgba(16,185,129,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
    borderRadius: 16,
    padding: 16,
  },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { color: '#047857', fontWeight: '700', fontSize: 14, flex: 1 },
  close: { color: '#64748b', fontSize: 22, lineHeight: 22 },
  hint: { color: '#475569', fontSize: 11, marginTop: 6, marginBottom: 12 },
  row: { gap: 8 },
  box: { backgroundColor: '#ffffff', borderRadius: 10, padding: 12, marginBottom: 8 },
  label: { fontSize: 10, color: '#64748b', fontWeight: '600' },
  value: { color: '#0f172a', fontSize: 13, marginTop: 4 },
  btn: { backgroundColor: '#059669', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
