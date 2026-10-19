import { View, Text, StyleSheet } from 'react-native';

const tones = {
  blue: { accent: '#0369a1', tint: '#f0f9ff', border: '#bae6fd' },
  green: { accent: '#047857', tint: '#ecfdf5', border: '#a7f3d0' },
  amber: { accent: '#b45309', tint: '#fffbeb', border: '#fde68a' },
  red: { accent: '#be123c', tint: '#fff1f2', border: '#fecdd3' },
  gray: { accent: '#475569', tint: '#f1f5f9', border: '#e2e8f0' },
};

export default function PatientMetricCard({ label, value, unit = '', icon = '◌', tone = 'blue', caption, compact = false }) {
  const colors = tones[tone] || tones.blue;

  return (
    <View style={[styles.card, compact && styles.compact, { borderColor: colors.border }]}>
      <View style={[styles.iconBox, { backgroundColor: colors.tint }]} accessible={false}>
        <Text style={[styles.icon, { color: colors.accent }]}>{icon}</Text>
      </View>
      <View style={styles.content}>
        <Text style={styles.label}>{label}</Text>
        <Text style={[styles.value, { color: colors.accent }]} numberOfLines={2}>
          {value}{unit ? <Text style={styles.unit}> {unit}</Text> : null}
        </Text>
        {caption ? <Text style={styles.caption}>{caption}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 92,
    padding: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderRadius: 18,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  compact: { width: undefined, flexGrow: 1, flexBasis: '47%', minWidth: 0, minHeight: 84, padding: 13 },
  iconBox: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 19, fontWeight: '600' },
  content: { flex: 1, minWidth: 0 },
  label: { fontSize: 12, fontWeight: '600', color: '#64748b' },
  value: { marginTop: 4, fontSize: 22, fontWeight: '700', color: '#0f172a' },
  unit: { fontSize: 14, fontWeight: '500', color: '#64748b' },
  caption: { marginTop: 4, fontSize: 11, color: '#64748b' },
});