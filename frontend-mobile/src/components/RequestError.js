import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export default function RequestError({ message, onRetry, onLogout }) {
  return (
    <View style={styles.card} accessibilityRole="alert">
      <Text style={styles.message}>{message}</Text>
      <View style={styles.actions}>
        {onRetry && <TouchableOpacity accessibilityRole="button" onPress={onRetry} style={styles.button}><Text style={styles.label}>Retry</Text></TouchableOpacity>}
        {onLogout && <TouchableOpacity accessibilityRole="button" onPress={onLogout} style={styles.button}><Text style={styles.label}>Sign out</Text></TouchableOpacity>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { margin: 16, padding: 16, borderRadius: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: '#fecdd3' },
  message: { color: '#9f1239', fontSize: 14, lineHeight: 21 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 12 },
  button: { backgroundColor: '#2563eb', padding: 12, minHeight: 44, borderRadius: 12 },
  label: { color: '#fff', fontWeight: '600' },
});
