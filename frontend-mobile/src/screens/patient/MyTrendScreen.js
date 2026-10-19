import usePatientReadings from '../../hooks/usePatientReadings';
import RequestError from '../../components/RequestError';

import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native';

import { computeTrend, filterByDays, toChartData } from '../../utils/monitoring';
import ScreenHeader from '../../components/ScreenHeader';
import PatientMetricCard from '../../components/PatientMetricCard';
import PatientReadingCard from '../../components/PatientReadingCard';
import MiniBarChart from '../../components/MiniBarChart';
import EmptyState from '../../components/EmptyState';
import LoadingView from '../../components/LoadingView';

export default function MyTrendScreen() {
  const { readings, loading, refreshing, error, load, refresh } = usePatientReadings();

  const trend = computeTrend(readings);
  const ranged = filterByDays(readings, 30);
  const chartData = toChartData(ranged, 14);
  const sorted = [...readings].sort((a, b) => new Date(b.taken_at) - new Date(a.taken_at));

  if (loading) return <LoadingView color="#10b981" />;
  if (error) return <ScrollView style={styles.container}><ScreenHeader title="Monitoring" /><RequestError message={error} onRetry={load} /></ScrollView>;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#34d399" />}
    >
      <ScreenHeader title="My Trend" subtitle="Track how your acetone readings change" accent="#10b981" showLogout={false} />

      <View style={styles.metricWrap}>
        <PatientMetricCard
          label="Trend summary"
          value={trend.label}
          caption={`${readings.length} total readings`}
          icon={trend.direction === 'up' ? '↑' : trend.direction === 'down' ? '↓' : '→'}
          tone="gray"
        />
      </View>

      <View style={styles.chartCard}>
        <Text style={styles.chartTitle}>Last 30 days</Text>
        <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 8 }}>Uncalibrated TGS readings are excluded from PPM trends and averages.</Text>
        <MiniBarChart data={chartData} height={150} />
      </View>

      {sorted.length === 0 ? (
        <View style={styles.pad}>
          <EmptyState message="No trend data yet." />
        </View>
      ) : (
        <View style={styles.list}>
          <Text style={styles.listTitle}>History</Text>
          {sorted.slice(0, 20).map((r) => (
            <PatientReadingCard key={r.id} reading={r} compact />
          ))}
        </View>
      )}
      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f7fb' },
  metricWrap: { marginHorizontal: 16, marginBottom: 12 },
  chartCard: {
    marginHorizontal: 16,
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 16,
    shadowColor: '#17345f',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  chartTitle: { color: '#0f172a', fontWeight: '600', fontSize: 13, marginBottom: 12 },
  pad: { paddingHorizontal: 16 },
  list: { paddingHorizontal: 16 },
  listTitle: { fontSize: 14, fontWeight: '600', color: '#0f172a', marginBottom: 8 },
});
