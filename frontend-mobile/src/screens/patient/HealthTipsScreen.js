import usePatientReadings from '../../hooks/usePatientReadings';
import RequestError from '../../components/RequestError';

import { View, Text, ScrollView, StyleSheet } from 'react-native';

import { computeTrend, getWellnessTips } from '../../utils/monitoring';
import ScreenHeader from '../../components/ScreenHeader';
import LoadingView from '../../components/LoadingView';

const GENERAL_TIPS = [
  { category: 'Nutrition', title: 'Balanced meals', text: 'Include vegetables, lean protein, and whole grains.' },
  { category: 'Activity', title: 'Daily movement', text: 'Aim for at least 30 minutes of moderate activity most days.' },
  { category: 'Hydration', title: 'Water intake', text: 'Stay hydrated throughout the day.' },
];

export default function HealthTipsScreen() {
  const { readings, latest, loading, error, load } = usePatientReadings();
  const personalTips = latest && !latest.is_simulated ? getWellnessTips(latest.diabetes_level, computeTrend(readings).direction) : [];

  if (loading) return <LoadingView color="#10b981" />;
  if (error) return <ScrollView style={styles.container}><ScreenHeader title="Monitoring" /><RequestError message={error} onRetry={load} /></ScrollView>;

  return (
    <ScrollView style={styles.container}>
      <ScreenHeader title="Health Tips" subtitle="Personalized wellness guidance" accent="#10b981" showLogout={false} />

      <Text style={styles.section}>{personalTips.length ? "Recommended for you" : "Personalized tips unavailable without a monitoring band. TGS calibration is unverified."}</Text>
      {personalTips.map((t) => (
        <View key={t.title} style={styles.card}>
          <Text style={styles.cardTitle}>{t.title}</Text>
          <Text style={styles.cardText}>{t.text}</Text>
        </View>
      ))}

      <Text style={[styles.section, { marginTop: 16 }]}>General wellness</Text>
      {GENERAL_TIPS.map((t) => (
        <View key={t.title} style={styles.card}>
          <Text style={styles.category}>{t.category}</Text>
          <Text style={styles.cardTitle}>{t.title}</Text>
          <Text style={styles.cardText}>{t.text}</Text>
        </View>
      ))}
      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f7fb' },
  section: { fontSize: 13, fontWeight: '600', color: '#0f172a', marginBottom: 10, paddingHorizontal: 16 },
  card: {
    marginHorizontal: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#17345f',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 1,
  },
  category: { fontSize: 10, color: '#047857', textTransform: 'uppercase' },
  cardTitle: { fontSize: 14, fontWeight: '600', color: '#0f172a', marginTop: 4 },
  cardText: { fontSize: 12, color: '#475569', marginTop: 6, lineHeight: 18 },
});
