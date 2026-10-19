import usePatientReadings from '../../hooks/usePatientReadings';
import RequestError from '../../components/RequestError';

import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';

const RECENT_PREVIEW = 3;

import { useAuth } from '../../context/AuthContext';
import { computeSevenDayAvg, computeTrend, getWellnessTips } from '../../utils/monitoring';
import ScreenHeader from '../../components/ScreenHeader';
import PatientLatestReadingCard from '../../components/PatientLatestReadingCard';
import PatientMetricCard from '../../components/PatientMetricCard';
import PatientReadingCard from '../../components/PatientReadingCard';
import EmptyState from '../../components/EmptyState';
import LoadingView from '../../components/LoadingView';

export default function PatientDashboardScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const { readings, latest, loading, refreshing, error, load, refresh } = usePatientReadings();

  const trend = computeTrend(readings);
  const weekAvg = computeSevenDayAvg(readings);
  const tips = latest && !latest.is_simulated ? getWellnessTips(latest.diabetes_level, trend.direction) : [];
  const displayedRecent = readings.slice(0, RECENT_PREVIEW);

  if (loading) return <LoadingView color="#10b981" />;
  if (error) return <ScrollView style={styles.container}><ScreenHeader title="Monitoring" /><RequestError message={error} onRetry={load} /></ScrollView>;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#34d399" />}
    >
      <ScreenHeader
        title={`Good day, ${user?.full_name?.split(' ')[0] || 'there'} 👋`}
        subtitle="Your personal health monitoring overview"
        accent="#10b981"
      />

      {latest ? (
        <PatientLatestReadingCard reading={latest} />
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyLabel}>Latest reading</Text>
          <View style={styles.emptyState}><EmptyState message="No readings yet. Ask your provider to run a breath scan." icon="🫁" /></View>
        </View>
      )}

      <View style={styles.statsGrid}>
        <PatientMetricCard label="7-day avg" value={weekAvg ?? '—'} unit="ppm" icon="↗" tone="gray" compact />
        <PatientMetricCard label="Total scans" value={readings.length} icon="▤" tone="blue" compact />
      </View>

      <View style={styles.trendCard}>
        <PatientMetricCard label="Trend" value={trend.label} icon="↗" tone="gray" />
      </View>

      {tips.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Wellness suggestions</Text>
          {tips.map((t) => (
            <View key={t.title} style={styles.tipCard}>
              <Text style={styles.tipTitle}>{t.title}</Text>
              <Text style={styles.tipText}>{t.text}</Text>
            </View>
          ))}
        </View>
      )}

      {readings.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent scans</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Results')}>
              <Text style={styles.viewAllLink}>View all</Text>
            </TouchableOpacity>
          </View>
          {displayedRecent.map((r) => (
            <PatientReadingCard key={r.id} reading={r} compact />
          ))}
        </View>
      )}
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f7fb' },
  emptyCard: { marginBottom: 12 },
  emptyLabel: { marginHorizontal: 16, marginBottom: 8, fontSize: 12, fontWeight: '600', color: '#64748b' },
  emptyState: { marginHorizontal: 16 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 16 },
  trendCard: { marginHorizontal: 16, marginTop: 10 },
  section: { paddingHorizontal: 16, marginTop: 22 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  viewAllLink: { color: '#0284c7', fontSize: 12, fontWeight: '600' },
  tipCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#17345f',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 1,
  },
  tipTitle: { color: '#047857', fontWeight: '600', fontSize: 13 },
  tipText: { color: '#475569', fontSize: 12, marginTop: 4, lineHeight: 18 },
});
