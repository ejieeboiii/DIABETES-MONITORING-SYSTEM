import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { getPatients, getAllReadings } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { getProviderAlerts } from '../../utils/monitoring';
import ScreenHeader from '../../components/ScreenHeader';
import StatCard from '../../components/StatCard';
import LevelBadge from '../../components/LevelBadge';
import EmptyState from '../../components/EmptyState';
import LoadingView from '../../components/LoadingView';

export default function DashboardScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const [patients, setPatients] = useState([]);
  const [readings, setReadings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  const load = async () => {
    try {
      const [p, r] = await Promise.all([getPatients(), getAllReadings()]);
      setPatients(p.data);
      setReadings(r.data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) return <LoadingView />;

  const stats = {
    total: patients.length,
    normal: readings.filter((r) => r.diabetes_level === 'Normal').length,
    preDiabetic: readings.filter((r) => r.diabetes_level === 'Pre-Diabetic').length,
    diabetic: readings.filter((r) => r.diabetes_level === 'Diabetic').length,
  };

  const alerts = getProviderAlerts(patients, readings);
  const totalPages = Math.ceil(readings.length / itemsPerPage);
  const paginated = readings.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const patientName = (id) => patients.find((p) => p.id === id)?.full_name || `Patient #${id}`;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#3b82f6" />
      }
    >
      <ScreenHeader
        title={`Good day, ${user?.full_name?.split(' ')[0] || 'Provider'} 👋`}
        subtitle="Healthcare provider monitoring overview"
        showLogout
      />

      <View style={styles.statsRow}>
        <StatCard label="Total patients" value={stats.total} preset="blue" />
        <StatCard label="Normal band" value={stats.normal} preset="green" />
        <StatCard label="Elevated band" value={stats.preDiabetic} preset="yellow" />
        <StatCard label="High band" value={stats.diabetic} preset="red" />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Patients needing review</Text>
        <Text style={styles.sectionSub}>Trends, missed scans, and latest bands</Text>
        {alerts.length === 0 ? (
          <EmptyState message="No alerts right now. All patients look stable." icon="✓" />
        ) : (
          alerts.map((alert, i) => (
            <View key={`${alert.patientId}-${i}`} style={styles.alertCard}>
              <Text style={styles.alertName}>{alert.patientName}</Text>
              <Text style={styles.alertMsg}>{alert.message}</Text>
            </View>
          ))
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent readings</Text>
          {readings.length > 0 && (
            <TouchableOpacity onPress={() => navigation.navigate('Readings')}>
              <Text style={styles.viewAllLink}>View all</Text>
            </TouchableOpacity>
          )}
        </View>
        {readings.length === 0 ? (
          <EmptyState message="No readings yet. Start a live scan!" icon="⚡" />
        ) : (
          <>
            {paginated.map((r) => (
              <View key={r.id} style={styles.readingCard}>
                <View style={styles.readingLeft}>
                  <Text style={styles.readingPpm}>{r.acetone_ppm} ppm</Text>
                  {r.estimated_glucose_mg_dl && (
                    <Text style={styles.readingGlucose}>
                      Est. glucose: {r.estimated_glucose_mg_dl} mg/dL
                      {r.glucose_level && <Text style={styles.readingGlucoseLevel}> ({r.glucose_level})</Text>}
                    </Text>
                  )}
                  <Text style={styles.readingMeta}>
                    {patientName(r.patient_id)} · {r.temperature}°C · {r.humidity}%
                  </Text>
                  <Text style={styles.readingDate}>{new Date(r.taken_at).toLocaleString()}</Text>
                </View>
                <LevelBadge level={r.diabetes_level} small />
              </View>
            ))}
            {totalPages > 1 && (
              <View style={styles.pagination}>
                <Text style={styles.paginationInfo}>
                  {((currentPage - 1) * itemsPerPage) + 1}-{Math.min(currentPage * itemsPerPage, readings.length)} of {readings.length}
                </Text>
                <View style={styles.paginationButtons}>
                  <TouchableOpacity
                    onPress={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    style={[styles.paginationBtn, currentPage === 1 && styles.paginationBtnDisabled]}
                  >
                    <Text style={[styles.paginationBtnText, currentPage === 1 && styles.paginationBtnTextDisabled]}>Previous</Text>
                  </TouchableOpacity>
                  <Text style={styles.paginationPage}>Page {currentPage} of {totalPages}</Text>
                  <TouchableOpacity
                    onPress={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    style={[styles.paginationBtn, currentPage === totalPages && styles.paginationBtnDisabled]}
                  >
                    <Text style={[styles.paginationBtnText, currentPage === totalPages && styles.paginationBtnTextDisabled]}>Next</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </>
        )}
      </View>
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  greetingWrap: { paddingHorizontal: 20, marginBottom: 8 },
  greeting: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  greetingSub: { fontSize: 12, color: '#64748b', marginTop: 2 },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, justifyContent: 'space-between' },
  section: { paddingHorizontal: 16, marginTop: 20 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  viewAllLink: { color: '#0284c7', fontSize: 12, fontWeight: '600' },
  sectionSub: { fontSize: 11, color: '#64748b', marginTop: 2, marginBottom: 12 },
  pagination: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 4, marginTop: 8, borderTopWidth: 1, borderTopColor: '#e2e8f0' },
  paginationInfo: { color: '#64748b', fontSize: 12 },
  paginationButtons: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  paginationBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#f1f5f9' },
  paginationBtnDisabled: { opacity: 0.4 },
  paginationBtnText: { color: '#334155', fontSize: 12, fontWeight: '600' },
  paginationBtnTextDisabled: { color: '#94a3b8' },
  paginationPage: { color: '#64748b', fontSize: 12 },
  alertCard: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  alertName: { color: '#0f172a', fontWeight: '600', fontSize: 14 },
  alertMsg: { color: '#64748b', fontSize: 12, marginTop: 4 },
  readingCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  readingLeft: { flex: 1, paddingRight: 12 },
  readingPpm: { color: '#0f172a', fontWeight: '700', fontSize: 16 },
  readingGlucose: { color: '#047857', fontSize: 12, marginTop: 4 },
  readingGlucoseLevel: { fontSize: 10, color: '#64748b' },
  readingMeta: { color: '#64748b', fontSize: 11, marginTop: 4 },
  readingDate: { color: '#94a3b8', fontSize: 10, marginTop: 2 },
});
