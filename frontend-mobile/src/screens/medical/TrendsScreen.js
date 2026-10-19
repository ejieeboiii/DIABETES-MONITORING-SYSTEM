import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { getPatients, getAllReadings } from '../../utils/api';
import { filterByDays, toChartData } from '../../utils/monitoring';
import ScreenHeader from '../../components/ScreenHeader';
import StatCard from '../../components/StatCard';
import MiniBarChart from '../../components/MiniBarChart';
import LoadingView from '../../components/LoadingView';

export default function TrendsScreen() {
  const route = useRoute();
  const [patients, setPatients] = useState([]);
  const [readings, setReadings] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(
    route.params?.patientId ? String(route.params.patientId) : 'all'
  );
  const [range, setRange] = useState(30);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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

  useEffect(() => {
    if (route.params?.patientId) {
      setSelectedPatient(String(route.params.patientId));
    }
  }, [route.params?.patientId]);

  if (loading) return <LoadingView />;

  const filtered =
    selectedPatient === 'all'
      ? readings
      : readings.filter((r) => r.patient_id === parseInt(selectedPatient, 10));

  const ranged = filterByDays(filtered, range);
  const chartData = toChartData(ranged, 20);

  const bandCounts = {
    Normal: ranged.filter((r) => r.diabetes_level === 'Normal').length,
    'Pre-Diabetic': ranged.filter((r) => r.diabetes_level === 'Pre-Diabetic').length,
    Diabetic: ranged.filter((r) => r.diabetes_level === 'Diabetic').length,
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#3b82f6" />
      }
    >
      <ScreenHeader title="Clinic Trends" subtitle="Population and per-patient acetone trends" showLogout={false} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <TouchableOpacity
          style={[styles.chip, selectedPatient === 'all' && styles.chipActive]}
          onPress={() => setSelectedPatient('all')}
        >
          <Text style={[styles.chipText, selectedPatient === 'all' && styles.chipTextActive]}>All patients</Text>
        </TouchableOpacity>
        {patients.map((p) => (
          <TouchableOpacity
            key={p.id}
            style={[styles.chip, selectedPatient === String(p.id) && styles.chipActive]}
            onPress={() => setSelectedPatient(String(p.id))}
          >
            <Text style={[styles.chipText, selectedPatient === String(p.id) && styles.chipTextActive]}>{p.full_name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.rangeRow}>
        {[7, 30, 90].map((days) => (
          <TouchableOpacity
            key={days}
            style={[styles.rangeBtn, range === days && styles.rangeBtnActive]}
            onPress={() => setRange(days)}
          >
            <Text style={[styles.rangeText, range === days && styles.rangeTextActive]}>{days} days</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.statsRow}>
        <StatCard label="Normal band" value={bandCounts.Normal} preset="green" />
        <StatCard label="Elevated band" value={bandCounts['Pre-Diabetic']} preset="yellow" />
        <StatCard label="High band" value={bandCounts.Diabetic} preset="red" />
        <StatCard label="Readings" value={ranged.length} preset="blue" />
      </View>

      <View style={styles.chartCard}>
        <Text style={styles.chartTitle}>Acetone PPM trend</Text>
        <MiniBarChart data={chartData} height={160} />
      </View>

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  chips: { paddingHorizontal: 16, gap: 8, paddingBottom: 12 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  chipActive: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  chipText: { color: '#64748b', fontSize: 12, fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  rangeRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 8 },
  rangeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  rangeBtnActive: { backgroundColor: '#0284c7', borderColor: '#0284c7' },
  rangeText: { color: '#64748b', fontSize: 12, fontWeight: '600' },
  rangeTextActive: { color: '#ffffff' },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, justifyContent: 'space-between' },
  chartCard: {
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  chartTitle: { color: '#0f172a', fontWeight: '600', fontSize: 14, marginBottom: 12 },
});
