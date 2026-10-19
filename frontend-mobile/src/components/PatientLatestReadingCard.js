import { View, Text, StyleSheet } from 'react-native';
import LevelBadge from './LevelBadge';
import { levelStyles } from '../theme/colors';
import { estimationMessage } from '../utils/estimation';

const statusIcons = {
  Normal: '✓',
  'Pre-Diabetic': '↗',
  Diabetic: '!',
};

export default function PatientLatestReadingCard({ reading }) {
  const tone = levelStyles[reading.diabetes_level] || { bg: '#f1f5f9', color: '#64748b' };

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Latest reading</Text>
      {reading.is_simulated && <Text style={styles.simulation}>SIMULATED — synthetic test data, not a patient measurement</Text>}
      <View style={styles.statusRow}>
        <View style={[styles.statusIcon, { backgroundColor: tone.bg }]} accessible={false}>
          <Text style={[styles.statusIconText, { color: tone.color }]}>{statusIcons[reading.diabetes_level] || '•'}</Text>
        </View>
        <View style={styles.statusCopy}>
          <Text style={styles.statusLabel}>Monitoring status</Text>
          <LevelBadge level={reading.diabetes_level} small />
        </View>
      </View>

      <View style={styles.glucoseBlock}>
        <Text style={styles.glucoseLabel}>Experimental glucose estimate</Text>
        <Text style={styles.glucoseValue}>
          {reading.predicted_bgl ?? 'Unavailable'}
          {reading.predicted_bgl != null && <Text style={styles.glucoseUnit}> mg/dL</Text>}
        </Text>
        <Text style={styles.glucoseLevel}>For monitoring only; not a diagnosis.</Text>
        <Text style={styles.glucoseLevel}>{estimationMessage(reading)}</Text>
      </View>

      <View style={styles.metrics}>
        <View style={styles.metric}>
          <View style={[styles.metricIconBox, { backgroundColor: '#f0f9ff' }]} accessible={false}><Text style={[styles.metricIcon, { color: '#0369a1' }]}>◌</Text></View>
          <View style={styles.metricCopy}><Text style={styles.metricLabel}>Acetone-related concentration</Text><Text style={styles.metricValue}>{reading.acetone_ppm == null ? 'Unavailable' : `${reading.acetone_ppm} ppm`}</Text></View>
        </View>
        <View style={styles.metric}>
          <View style={[styles.metricIconBox, { backgroundColor: '#fffbeb' }]} accessible={false}><Text style={[styles.metricIcon, { color: '#b45309' }]}>°</Text></View>
          <View style={styles.metricCopy}><Text style={styles.metricLabel}>Temperature</Text><Text style={styles.metricValue}>{reading.temperature}°C</Text></View>
        </View>
        <View style={styles.metric}>
          <View style={[styles.metricIconBox, { backgroundColor: '#eff6ff' }]} accessible={false}><Text style={[styles.metricIcon, { color: '#0369a1' }]}>⌁</Text></View>
          <View style={styles.metricCopy}><Text style={styles.metricLabel}>Humidity</Text><Text style={styles.metricValue}>{reading.humidity}%</Text></View>
        </View>
      </View>

      {reading.sensor_configuration === 'tgs822_tgs2620' ? (
        <View style={styles.dateRow}>
          <Text style={styles.dateValue}>TGS822 (primary): {reading.tgs822_raw_adc} ADC</Text>
          <Text style={styles.dateValue}>TGS2620 (secondary): {reading.tgs2620_raw_adc} ADC</Text>
          <Text style={styles.dateLabel}>Physical calibration unverified</Text>
        </View>
      ) : <Text style={styles.dateLabel}>Legacy MQ-138 reading</Text>}

      <View style={styles.dateRow}>
        <Text style={styles.dateLabel}>Last checked</Text>
        <Text style={styles.dateValue}>{new Date(reading.taken_at).toLocaleString()}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  simulation: { color: '#0369a1', backgroundColor: '#f0f9ff', padding: 10, borderRadius: 10, fontSize: 12, fontWeight: '700', marginBottom: 12 },
  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 18,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 20,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 3,
  },
  cardTitle: { marginBottom: 14, fontSize: 16, fontWeight: '700', color: '#0f172a' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statusIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  statusIconText: { fontSize: 21, fontWeight: '700' },
  statusCopy: { flex: 1, gap: 5 },
  statusLabel: { fontSize: 12, fontWeight: '600', color: '#64748b' },
  glucoseBlock: { marginTop: 16, padding: 14, borderRadius: 16, backgroundColor: '#f1f6ff' },
  glucoseLabel: { fontSize: 12, fontWeight: '600', color: '#64748b' },
  glucoseValue: { marginTop: 3, color: '#0f172a', fontSize: 32, fontWeight: '700' },
  glucoseUnit: { fontSize: 15, fontWeight: '500', color: '#64748b' },
  glucoseLevel: { marginTop: 3, fontSize: 12, color: '#64748b' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 18, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#e2e8f0' },
  metric: { flexDirection: 'row', alignItems: 'center', gap: 8, flexGrow: 1, flexBasis: '45%', minWidth: 0 },
  metricIconBox: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  metricIcon: { fontSize: 17, fontWeight: '600' },
  metricCopy: { flex: 1, minWidth: 0 },
  metricLabel: { fontSize: 10, color: '#64748b' },
  metricValue: { marginTop: 2, fontSize: 13, fontWeight: '700', color: '#0f172a' },
  dateRow: { marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#e2e8f0', gap: 3 },
  dateLabel: { fontSize: 10, fontWeight: '600', color: '#64748b' },
  dateValue: { fontSize: 12, color: '#334155' },
});
