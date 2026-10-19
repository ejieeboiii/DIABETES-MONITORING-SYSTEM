import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';

export default function LoadingView({ color = '#3b82f6' }) {
  return (
    <View style={styles.wrap}>
      <ActivityIndicator size="large" color={color} />
      <Text style={styles.text}>Loading...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center' },
  text: { color: '#64748b', marginTop: 12, fontSize: 14 },
});
