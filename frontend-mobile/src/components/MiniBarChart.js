import { View, Text, StyleSheet } from 'react-native';
import { levelStyles } from '../theme/colors';

export default function MiniBarChart({ data, height = 140 }) {
  if (!data?.length) {
    return (
      <View style={[styles.empty, { height }]}>
        <Text style={styles.emptyText}>No chart data in this range</Text>
      </View>
    );
  }

  const maxPpm = Math.max(...data.map((d) => d.ppm), 1);

  return (
    <View style={{ height }}>
      <View style={styles.bars}>
        {data.map((d, i) => {
          const barH = Math.max(8, (d.ppm / maxPpm) * (height - 36));
          const c = levelStyles[d.level] || levelStyles.Normal;
          return (
            <View key={`${d.date}-${i}`} style={styles.col}>
              <View style={[styles.bar, { height: barH, backgroundColor: c.color }]} />
              <Text style={styles.label} numberOfLines={1}>{d.date}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bars: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: 4, paddingHorizontal: 4 },
  col: { flex: 1, alignItems: 'center', minWidth: 20 },
  bar: { width: '80%', borderRadius: 8, minHeight: 8 },
  label: { fontSize: 8, color: '#64748b', marginTop: 4, textAlign: 'center' },
  empty: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: 12 },
  emptyText: { color: '#94a3b8', fontSize: 12 },
});
