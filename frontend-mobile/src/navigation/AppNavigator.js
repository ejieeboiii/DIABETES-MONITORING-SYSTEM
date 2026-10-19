import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { House, ClipboardList, ChartNoAxesCombined, Lightbulb } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import LoadingView from '../components/LoadingView';
import RequestError from '../components/RequestError';

import AuthScreen from '../screens/AuthScreen';

import PatientDashboardScreen from '../screens/patient/DashboardScreen';
import MyResultsScreen from '../screens/patient/MyResultsScreen';
import MyTrendScreen from '../screens/patient/MyTrendScreen';
import HealthTipsScreen from '../screens/patient/HealthTipsScreen';
import AccountScreen from '../screens/patient/AccountScreen';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

function TabIcon({ name, focused, color }) {
  const icons = {
    Dashboard: House,
    Results: ClipboardList,
    Trend: ChartNoAxesCombined,
    Tips: Lightbulb,
  };
  const Icon = icons[name] || House;
  return (
    <View style={{ width: 44, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: focused ? '#dbeafe' : 'transparent' }}>
      <Icon size={focused ? 27 : 25} strokeWidth={focused ? 2.5 : 2.2} color={focused ? color : '#8290a3'} />
    </View>
  );
}

const tabScreenOptions = (activeColor, bottomInset) => ({
  headerShown: false,
  tabBarStyle: {
    backgroundColor: '#ffffff',
    borderTopWidth: 0,
    borderWidth: 1,
    borderColor: '#e7edf5',
    borderRadius: 22,
    marginHorizontal: 12,
    marginBottom: Math.max(bottomInset, 8),
    paddingHorizontal: 8,
    paddingBottom: 6,
    paddingTop: 7,
    height: 86,
    elevation: 12,
    shadowColor: '#17345f',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
  },
  tabBarActiveTintColor: activeColor,
  tabBarInactiveTintColor: '#8290a3',
  tabBarLabelStyle: { fontSize: 12, fontWeight: '600', marginTop: 3 },
});

function PatientTabs() {
  const active = '#2563eb';
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        ...tabScreenOptions(active, insets.bottom),
        tabBarIcon: ({ focused }) => <TabIcon name={route.name} focused={focused} color={active} />,
      })}
    >
      <Tab.Screen name="Dashboard" component={PatientDashboardScreen} />
      <Tab.Screen name="Results" component={MyResultsScreen} />
      <Tab.Screen name="Trend" component={MyTrendScreen} />
      <Tab.Screen name="Tips" component={HealthTipsScreen} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { user, role, loading, sessionError, retrySession, logout } = useAuth();

  if (loading) return <LoadingView />;
  if (sessionError) return <View style={{ flex: 1, paddingTop: 48, backgroundColor: '#f4f7fb' }}><RequestError message={sessionError} onRetry={retrySession} onLogout={logout} /></View>;

  return (
    <NavigationContainer>
      {user && role === 'patient' ? (
        <Stack.Navigator key={`${role}:${user.id}`} screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Main" component={PatientTabs} />
          <Stack.Screen name="Account" component={AccountScreen} options={{ headerShown: true, title: 'My account' }} />
        </Stack.Navigator>
      ) : (
        <Stack.Navigator key="auth" screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Auth" component={AuthScreen} />
        </Stack.Navigator>
      )}
    </NavigationContainer>
  );
}
