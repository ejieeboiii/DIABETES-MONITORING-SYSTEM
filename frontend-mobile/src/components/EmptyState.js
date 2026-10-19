import { View, Text, StyleSheet } from 'react-native';

export default function EmptyState({ message, icon = '📭' }) {
  return (
    <View style={styles.box}>
      <Text style={styles.icon}>{icon}</Text>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  icon: { fontSize: 28, marginBottom: 8 },
  text: { color: '#64748b', fontSize: 13, textAlign: 'center', lineHeight: 20 },
});
