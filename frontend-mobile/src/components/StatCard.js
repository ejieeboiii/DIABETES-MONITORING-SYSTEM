import { View, Text, StyleSheet } from 'react-native';
import { statPresets } from '../theme/colors';

export default function StatCard({ label, value, preset = 'blue' }) {
  const s = statPresets[preset] || statPresets.blue;
  return (
    <View style={[styles.card, { backgroundColor: s.bg, borderColor: '#e2e8f0' }]}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, { color: s.color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: '47%', borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: 1 },
  label: { fontSize: 10, color: '#64748b', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  value: { fontSize: 28, fontWeight: 'bold', marginTop: 6 },
});
