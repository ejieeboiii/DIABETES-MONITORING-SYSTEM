import { Text, View, StyleSheet } from 'react-native';
import { levelStyles } from '../theme/colors';

const labels = {
  Normal: 'Normal band',
  'Pre-Diabetic': 'Elevated band',
  Diabetic: 'High band',
};

export default function LevelBadge({ level, small }) {
  const s = levelStyles[level] || { bg: '#f1f5f9', border: '#e2e8f0', color: '#64748b' };
  return (
    <View style={[styles.badge, { backgroundColor: s.bg, borderColor: s.border }, small && styles.small]}>
      <Text style={[styles.text, { color: s.color }, small && styles.textSmall]}>
        {labels[level] || level || 'Calibration unverified'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, alignSelf: 'flex-start' },
  small: { paddingHorizontal: 8, paddingVertical: 2 },
  text: { fontSize: 11, fontWeight: '700' },
  textSmall: { fontSize: 10 },
});
