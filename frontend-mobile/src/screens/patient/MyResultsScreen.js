import usePatientReadings from '../../hooks/usePatientReadings';
import RequestError from '../../components/RequestError';
import { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity } from 'react-native';

import ScreenHeader from '../../components/ScreenHeader';
import PatientReadingCard from '../../components/PatientReadingCard';
import { pageWithinRange } from '../../utils/pagination';
import EmptyState from '../../components/EmptyState';
import LoadingView from '../../components/LoadingView';

export default function MyResultsScreen() {
  const { readings, loading, refreshing, error, load, refresh } = usePatientReadings();
  const [requestedPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  const totalPages = Math.ceil(readings.length / itemsPerPage);
  const currentPage = pageWithinRange(requestedPage, readings.length, itemsPerPage);
  const paginated = readings.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  if (loading) return <LoadingView color="#10b981" />;
  if (error) return <ScrollView style={styles.container}><ScreenHeader title="Monitoring" /><RequestError message={error} onRetry={() => { setCurrentPage(1); load(); }} /></ScrollView>;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setCurrentPage(1); refresh(); }} tintColor="#34d399" />}
    >
      <ScreenHeader title="My Results" subtitle={`${readings.length} recorded scans`} accent="#10b981" showLogout={false} />

      {readings.length === 0 ? (
        <View style={styles.pad}>
          <EmptyState message="No results yet. Your provider will record scans during visits." />
        </View>
      ) : (
        <>
          {paginated.map((reading) => <PatientReadingCard key={reading.id} reading={reading} />)}
          {totalPages > 1 && (
            <View style={styles.pagination}>
              <Text style={styles.paginationInfo}>
                {((currentPage - 1) * itemsPerPage) + 1}-{Math.min(currentPage * itemsPerPage, readings.length)} of {readings.length}
              </Text>
              <View style={styles.paginationButtons}>
                <TouchableOpacity
                  onPress={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  style={[styles.paginationBtn, currentPage === 1 && styles.paginationBtnDisabled]}
                >
                  <Text style={[styles.paginationBtnText, currentPage === 1 && styles.paginationBtnTextDisabled]}>Previous</Text>
                </TouchableOpacity>
                <Text style={styles.paginationPage}>Page {currentPage} of {totalPages}</Text>
                <TouchableOpacity
                  onPress={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
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
      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f7fb' },
  pad: { paddingHorizontal: 16 },
  pagination: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 16, marginTop: 8, borderTopWidth: 1, borderTopColor: '#e2e8f0' },
  paginationInfo: { color: '#64748b', fontSize: 12 },
  paginationButtons: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  paginationBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: '#eaf1ff' },
  paginationBtnDisabled: { opacity: 0.4 },
  paginationBtnText: { color: '#2454a6', fontSize: 12, fontWeight: '600' },
  paginationBtnTextDisabled: { color: '#94a3b8' },
  paginationPage: { color: '#64748b', fontSize: 12 },
});
