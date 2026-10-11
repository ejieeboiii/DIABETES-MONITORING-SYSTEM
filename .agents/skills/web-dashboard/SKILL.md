---
name: web-dashboard
description: Inspect or develop BreathDX healthcare-provider React pages, patient management, readings, trends, and Live Scan while preserving current routes and API behavior.
---

# Purpose and When to Use

Use for provider web features, API integration, dashboard behavior, or web page redesign. Read ui-design for visual consistency and backend-api for actual contracts.

# Framework and Project Structure

React 19, Vite 8, React Router 7, Axios, Recharts, Tailwind CSS/PostCSS. Read package.json for exact dependencies/scripts; Vite config uses the React plugin and backend proxy.

- src/main.jsx and App.jsx: entry and routes.
- src/context/AuthContext.jsx: provider session.
- src/pages/AuthPage.jsx: authentication.
- src/pages/medical/: active provider pages.
- src/components/: MedicalSidebar, MetricCard, LevelBadge, TrendChart, patient detail/credentials components.
- src/utils/api.js: Axios and WebSocket helpers.
- src/utils/monitoring.js: PPM summaries, chart data, alerts.
- index.css, tailwind.config.js, postcss.config.js: styling setup.

# Active Routes and Features

| Route | Page | Actual responsibility |
| --- | --- | --- |
| / | AuthPage | Provider authentication/registration |
| /medical/dashboard | medical/Dashboard.jsx | Patient count, reading-band counts, review alerts, recent readings, quick links |
| /medical/patients | medical/Patients.jsx | Patient list, creation, deletion, detail modal and credentials flow |
| /medical/readings | medical/Readings.jsx | Reading history, patient filter, client pagination, acetone chart, deletion |
| /medical/trends | medical/Trends.jsx | Patient/range filtering, band distribution and PPM chart |
| /medical/livescan | medical/LiveScan.jsx | Manual data entry and partially integrated ESP32 listener UI |

MedicalLayout requires authenticated role medical and includes MedicalSidebar. Unknown routes redirect to /. Patient pages under src/pages/patient exist but are not registered in App.jsx. src/pages/Patients.jsx is not the active medical Patients import. No separate admin role or profile-edit route exists; provider identity/logout appear in the sidebar.

# Authentication and API Integration

AuthContext persists token/role in localStorage, restores /auth/medical/me, and clears non-medical or invalid sessions. Provider registration/login call their actual role-specific backend paths. Axios attaches bearer tokens.

Development API requests are relative and Vite proxies /auth, /patients, /readings and /health to http://127.0.0.1:8001; /readings proxy supports WebSocket. Production code hard-codes loopback:8001. Do not describe this as a deployed backend URL.

Patient detail/credential components use existing API helpers, including reset-password. Reading endpoints are /readings/all, /readings/patient/{id}, and latest variants. Trends are calculated client-side; there is no dedicated backend trend endpoint.

# Dashboard and Trends

Dashboard counts patients separately from reading-band counts. getProviderAlerts derives no-data, missed-scan, rising-trend, and latest-band notices from returned readings; these are not persisted notifications. Recent readings initially show five entries and support expanding the preview. Preserve patient query parameters in links to filtered reading views.

monitoring.computeTrend uses the last up to seven readings, not a seven-day time window. computeSevenDayAvg uses elapsed days. Recharts and TrendChart display PPM history, not validated blood glucose.

Dashboard's estimated-glucose display reads estimated_glucose_mg_dl and glucose_level, which current ReadingResponse does not provide; it falls back to a dash. Database predicted_bgl is a different field and is not populated by current upload code. Do not claim working prediction integration from display markup alone.

# Live Scan Status

Manual mode posts patient_id, raw_sensor_value, temperature, and humidity to /readings/sensor. Listener mode checks /readings/listener/ping and calls /start and /stop; these backend routes are absent.

The page contains Start Listening, patient selection, medical WebSocket handling, and three-second fallback polling, but arming fails with the inspected backend. Its button/Serial-command guidance and port-8000 messages disagree with current sketch/configuration. Record these as implementation gaps, not functioning routes or instructions to repair during documentation.

# Existing Design Patterns

Use medical/Dashboard.jsx as the primary visual reference: slate-100 workspace, white bordered cards, sky accents, rounded cards/buttons, compact table metadata, responsive grids, and dark provider sidebar. Reuse current components and loading/empty/error states. Not all components use identical status colors; inspect the target component before changing it.

# Development Rules and Verification

Preserve all current content, datasets, filters, actions, navigation/query parameters, and API behavior in a redesign unless the user explicitly changes scope. Do not expose credentials in screenshots/logs. Keep monitoring labels distinct from clinical diagnosis.

For authorized code work, use existing npm run build and npm run lint scripts as applicable and inspect affected layouts/flows. Include narrow-width table overflow, patient selection, auth redirect, and error handling. For skill creation alone, do not run builds or repair functionality; report source-inspection limits.

