import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, RefreshControl } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { getAllReadings, getPatients, deleteReading } from '../../utils/api';
import LevelBadge from '../../components/LevelBadge';
import EmptyState from '../../components/EmptyState';
import LoadingView from '../../components/LoadingView';

export default function ReadingsScreen() {
  const route = useRoute();
  const [readings, setReadings] = useState([]);
  const [patients, setPatients] = useState([]);
  const [selected, setSelected] = useState(
    route.params?.patientId ? String(route.params.patientId) : 'all'
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  const load = async () => {
    try {
      const [r, p] = await Promise.all([getAllReadings(), getPatients()]);
      setReadings(r.data);
      setPatients(p.data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (route.params?.patientId) {
      setSelected(String(route.params.patientId));
    }
  }, [route.params?.patientId]);

  useEffect(() => {
    setCurrentPage(1);
  }, [selected]);

  const filtered = selected === 'all' ? readings : readings.filter((r) => r.patient_id === parseInt(selected, 10));
  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const patientName = (id) => patients.find((p) => p.id === id)?.full_name || `#${id}`;

  const remove = (id) => {
    Alert.alert('Delete Reading', 'Are you sure you want to delete this reading?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteReading(id); load(); } },
    ]);
  };

  if (loading) return <LoadingView />;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#3b82f6" />}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Readings</Text>
        <Text style={styles.sub}>{filtered.length} in view</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterBtn, selected === 'all' && styles.filterBtnActive]}
          onPress={() => setSelected('all')}
        >
          <Text style={[styles.filterText, selected === 'all' && styles.filterTextActive]}>All</Text>
        </TouchableOpacity>
        {patients.map((p) => (
          <TouchableOpacity
            key={p.id}
            style={[styles.filterBtn, selected === String(p.id) && styles.filterBtnActive]}
            onPress={() => setSelected(String(p.id))}
          >
            <Text style={[styles.filterText, selected === String(p.id) && styles.filterTextActive]}>{p.full_name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.list}>
        {filtered.length === 0 ? (
          <EmptyState message="No readings found for this filter." />
        ) : (
          <>
            {paginated.map((r) => (
              <View key={r.id} style={styles.card}>
                <View style={styles.cardBody}>
                  <View style={styles.cardTop}>
                    <Text style={styles.ppm}>{r.acetone_ppm} ppm</Text>
                    <LevelBadge level={r.diabetes_level} small />
                  </View>
                  {r.estimated_glucose_mg_dl && (
                    <Text style={styles.glucose}>
                      Est. glucose: {r.estimated_glucose_mg_dl} mg/dL
                      {r.glucose_level && <Text style={styles.glucoseLevel}> ({r.glucose_level})</Text>}
                    </Text>
                  )}
                  <Text style={styles.patient}>{patientName(r.patient_id)}</Text>
                  <Text style={styles.meta}>
                    {r.temperature}°C · {r.humidity}% · {new Date(r.taken_at).toLocaleString()}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => remove(r.id)} style={styles.deleteBtn}>
                  <Text style={styles.deleteIcon}>🗑</Text>
                </TouchableOpacity>
              </View>
            ))}
            {totalPages > 1 && (
              <View style={styles.pagination}>
                <Text style={styles.paginationInfo}>
                  {((currentPage - 1) * itemsPerPage) + 1}-{Math.min(currentPage * itemsPerPage, filtered.length)} of {filtered.length}
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
      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  header: { padding: 20, paddingTop: 16 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#0f172a' },
  sub: { fontSize: 12, color: '#64748b', marginTop: 2 },
  filterRow: { paddingHorizontal: 16, gap: 8, paddingBottom: 16 },
  filterBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e8f0' },
  filterBtnActive: { backgroundColor: '#0284c7', borderColor: '#0284c7' },
  filterText: { color: '#64748b', fontSize: 13, fontWeight: '600' },
  filterTextActive: { color: '#fff' },
  list: { paddingHorizontal: 16 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff', borderRadius: 16, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#e2e8f0' },
  cardBody: { flex: 1 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  ppm: { color: '#0f172a', fontWeight: '700', fontSize: 16 },
  glucose: { color: '#047857', fontSize: 12, marginBottom: 4 },
  glucoseLevel: { fontSize: 10, color: '#64748b' },
  patient: { color: '#475569', fontSize: 12, marginBottom: 4 },
  meta: { color: '#64748b', fontSize: 11 },
  deleteBtn: { padding: 6 },
  deleteIcon: { fontSize: 15 },
  pagination: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 4, marginTop: 8, borderTopWidth: 1, borderTopColor: '#e2e8f0' },
  paginationInfo: { color: '#64748b', fontSize: 12 },
  paginationButtons: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  paginationBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#f1f5f9' },
  paginationBtnDisabled: { opacity: 0.4 },
  paginationBtnText: { color: '#334155', fontSize: 12, fontWeight: '600' },
  paginationBtnTextDisabled: { color: '#94a3b8' },
  paginationPage: { color: '#64748b', fontSize: 12 },
});
