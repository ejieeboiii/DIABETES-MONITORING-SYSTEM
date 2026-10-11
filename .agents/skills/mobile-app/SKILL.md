---
name: mobile-app
description: Inspect or develop the active BreathDX Expo patient mobile app, its navigation, authentication, history, trends, and existing components while distinguishing inactive medical screens.
---

# Purpose and When to Use

Use for patient mobile features, mobile API integration, navigation, or layout changes. Preserve the active application's functionality and navigation unless specifically instructed otherwise.

# Framework and Important Files

The manifest declares React 19.2.3, React Native 0.86.3, Expo ~57.0.25, React Navigation bottom-tabs/native/stack, Axios, AsyncStorage, lucide-react-native, expo-linear-gradient, and react-native-svg.

- App.js: AuthProvider and AppNavigator.
- src/navigation/AppNavigator.js: actual auth stack and patient tabs.
- src/context/AuthContext.js: patient login, session restoration, logout.
- src/screens/AuthScreen.js: sign-in UI.
- src/screens/patient/: active patient screens.
- src/components/: reading/metric cards, header, loading/empty states, chart.
- src/utils/api.js, apiBaseUrl.js, monitoring.js: transport and derived data.
- src/theme/colors.js: palette and status styles.
- app.json, package.json, .env.example: platform/runtime configuration.
- AGENTS.md: local instructions to read before code work.

AGENTS.md references Expo v54 documentation, while package.json declares Expo 57. Respect applicable instructions and establish the installed API/version before making framework changes. Do not change either file as part of skill documentation.

# Active Navigation and Screens

AppNavigator shows Auth unless an authenticated user has role patient. Authenticated navigation exposes four bottom tabs:

| Tab | Active screen | Behavior |
| --- | --- | --- |
| Dashboard | patient/DashboardScreen.js | Latest reading, seven-day PPM average, scan count, trend, wellness suggestions, recent scans, link to Results |
| Results | patient/MyResultsScreen.js | Personal reading history and existing filtering/refresh behavior |
| Trend | patient/MyTrendScreen.js | Acetone trend summary, 30-day chart window, historical reading cards |
| Tips | patient/HealthTipsScreen.js | Wellness suggestions derived from readings and trend |

PatientNavigator.js and MedicalNavigator.js are empty files. Medical screens, including LiveScanScreen.js, remain under src/screens/medical but are not imported by the active navigator. Dashboard.Screen.js and TrebdsScreen.js are alternate files; follow active imports instead of filenames alone.

There is no active patient Live Scan tab or dedicated Profile screen. ScreenHeader displays user identity and supports logout; backend profile data exists, but a profile editor is not implemented in current navigation.

# Authentication and API

AuthContext uses loginPatient and validates that the server response has patient role, access_token, and user. It stores token/role in AsyncStorage, restores via /auth/patient/me, rejects stored non-patient roles, and clears invalid sessions. Logout clears storage and in-memory state.

Axios attaches bearer tokens from AsyncStorage and has a 15-second timeout. getApiBaseUrl prioritizes EXPO_PUBLIC_API_URL, then Expo host detection, Android emulator fallback at 10.0.2.2:8001, then loopback:8001. Inspect resolver branches rather than assuming every LAN/tunnel host is accepted. .env.example describes an explicit laptop LAN URL. Expo tunnel connectivity is distinct from backend reachability.

Dashboard/Tips retrieve /readings/my and /readings/my/latest. Results/Trend use /readings/my. api.js also retains provider/sensor/WebSocket helpers, which do not establish reachable provider features in this patient-only app.

The start script specifies Expo port 8001, also used by backend configuration; check actual process ports during connectivity work instead of changing them automatically.

# Derived Data and Design

monitoring.js calculates PPM trends and seven-day averages locally; these are not glucose estimates. Trend charts use MiniBarChart. Reuse PatientLatestReadingCard, PatientMetricCard, PatientReadingCard, ScreenHeader, LoadingView, and EmptyState.

The active patient style uses a light background, white cards, dark text, blue gradient headers, blue active tab icons, and rounded containers. Read ui-design for exact source-observed palette/spacing. app.json configures portrait orientation, light UI, and Android cleartext traffic.

# Workflow and Verification

Trace the active navigator, screen, shared component, API helper, backend response, and monitoring utility. Handle loading, empty readings, refresh, authentication expiry, and nullable predictions without implying diagnostic certainty.

For authorized changes, verify affected tabs, session restoration/logout, real-device/backend reachability, and scroll/safe-area behavior using the available environment. Check package scripts before execution. A web build does not verify React Native behavior. Report unavailable runtime checks; do not install dependencies, activate medical navigation, or add Profile/Live Scan during documentation work.

