import { View, Text, StyleSheet } from 'react-native';
import LevelBadge from './LevelBadge';
import { estimationMessage } from '../utils/estimation';

export default function PatientReadingCard({ reading, compact = false }) {
  return (
    <View style={[styles.card, compact && styles.compact]}>
      {reading.is_simulated && <Text style={styles.simulation}>SIMULATED — synthetic test data, not a patient measurement</Text>}
      <View style={styles.topRow}>
        <View>
          <Text style={styles.label}>Acetone PPM</Text>
          <Text style={styles.value}>{reading.acetone_ppm == null ? 'Unavailable' : reading.acetone_ppm} {reading.acetone_ppm != null && <Text style={styles.unit}>ppm</Text>}</Text>
        </View>
        <LevelBadge level={reading.diabetes_level} small />
      </View>

      {reading.sensor_configuration === 'tgs822_tgs2620' ? (
        <View style={styles.environmentRow}>
          <Text style={styles.environmentValue}>TGS822: <Text style={styles.detailValue}>{reading.tgs822_raw_adc} ADC</Text></Text>
          <Text style={styles.environmentValue}>TGS2620: <Text style={styles.detailValue}>{reading.tgs2620_raw_adc} ADC</Text></Text>
        </View>
      ) : <Text style={styles.detailLabel}>Legacy MQ-138 reading</Text>}

      {!compact && (
        <>
          {(
            <View style={styles.glucoseRow}>
              <Text style={styles.detailLabel}>Experimental glucose estimate</Text>
              <Text style={styles.detailValue}>{reading.predicted_bgl != null ? `${reading.predicted_bgl} mg/dL` : 'Unavailable'}</Text>
              <Text style={styles.detailLabel}>{estimationMessage(reading)}</Text>
            </View>
          )}
          <View style={styles.environmentRow}>
            <Text style={styles.environmentValue}>Temperature  <Text style={styles.detailValue}>{reading.temperature}°C</Text></Text>
            <Text style={styles.environmentValue}>Humidity  <Text style={styles.detailValue}>{reading.humidity}%</Text></Text>
          </View>
          {(reading.suggestion || reading.advice) ? <Text style={styles.suggestion}>{reading.suggestion || reading.advice}</Text> : null}
        </>
      )}

      <View style={styles.dateRow}>
        <Text style={styles.detailLabel}>{compact ? 'Last checked' : 'Date'}</Text>
        <Text style={styles.detailValue}>{new Date(reading.taken_at).toLocaleString()}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  simulation: { color: '#0369a1', backgroundColor: '#f0f9ff', padding: 10, borderRadius: 10, fontSize: 12, fontWeight: '700', marginBottom: 12 },
  card: {
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 18,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  compact: { marginHorizontal: 0, padding: 14 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  label: { fontSize: 11, color: '#64748b', fontWeight: '600' },
  value: { marginTop: 4, color: '#0f172a', fontSize: 21, fontWeight: '700' },
  unit: { fontSize: 13, color: '#64748b', fontWeight: '500' },
  glucoseRow: { marginTop: 12, paddingTop: 11, borderTopWidth: 1, borderTopColor: '#e2e8f0', gap: 3 },
  detailLabel: { fontSize: 11, color: '#64748b' },
  detailValue: { fontSize: 12, color: '#334155', fontWeight: '600' },
  environmentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 12 },
  environmentValue: { fontSize: 11, color: '#64748b' },
  suggestion: { marginTop: 12, paddingTop: 11, borderTopWidth: 1, borderTopColor: '#e2e8f0', fontSize: 12, color: '#475569', lineHeight: 18 },
  dateRow: { marginTop: 12, paddingTop: 11, borderTopWidth: 1, borderTopColor: '#e2e8f0', gap: 3 },
});
