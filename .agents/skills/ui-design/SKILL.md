---
name: ui-design
description: Preserve and extend BreathDX source-defined UI conventions across the provider dashboard and patient mobile app without changing content, data, functionality, APIs, or navigation during redesign.
---

# Purpose and When to Use

Use for UI layout changes, component styling, or redesign requests. The existing provider Dashboard is the primary web visual reference; the active patient Dashboard and shared mobile components are the mobile reference.

**Redesign rule:** Preserve existing content, data, functionality, API behavior, and navigation unless specifically instructed otherwise.

# Evidence and Important Files

These conventions were inspected in source, not verified from a running browser/device. They are observations of implemented styles, not a centralized formal design specification.

- Web: src/pages/medical/Dashboard.jsx, components/MedicalSidebar.jsx, MetricCard.jsx, LevelBadge.jsx, pages/medical/LiveScan.jsx, index.css.
- Mobile: src/screens/patient/DashboardScreen.js, components/ScreenHeader.js, PatientMetricCard.js, PatientReadingCard.js, PatientLatestReadingCard.js, navigation/AppNavigator.js, theme/colors.js.
- Both: utils/monitoring for monitoring-band labels.

Paths are beneath frontend-web or frontend-mobile as indicated. Follow active imports; inactive patient web and medical mobile files are not the primary runtime reference.

# Colors

Web provider Dashboard uses Tailwind slate-100 canvas, white cards, slate-200 borders, slate-900 headings, slate-600 body text, and slate-500 secondary text. Primary actions use sky-600 with sky-500 hover; secondary actions use white/slate surfaces. MedicalSidebar is slate-800 with slate-700 borders, slate-300 inactive text, and sky-tinted active states. index.css sets a dark #020617 body background; individual provider pages override the content canvas with light surfaces.

Mobile theme/colors.js defines:

| Token | Value |
| --- | --- |
| bg | #f4f7fb |
| bgCard | #ffffff |
| border | #e5ebf3 |
| text | #0f172a |
| textMuted | #64748b |
| textDim | #94a3b8 |
| blue | #2563eb |
| blueLight | #1d4ed8 |
| emerald / emeraldLight | #059669 / #047857 |
| red / yellow | #e11d48 / #d97706 |

ScreenHeader uses a #1768d2 → #183b83 gradient, white title, and pale blue secondary text. Patient Dashboard also uses literal colors and is not wholly token-driven.

Normal, elevated, and high monitoring bands use green, amber/yellow, and red/rose. theme.levelStyles, utils/monitoring, and individual components differ in exact shades. Preserve the component's current mapping; do not silently impose one global shade or convert monitoring bands into diagnosis labels.

# Typography

Web index.css declares 'DM Sans', -apple-system, sans-serif. No DM Sans font import was found in index.html/index.css; do not assume the font asset is installed or loaded. Dashboard headings use text-3xl with sm:text-4xl, bold weight and tight tracking. Section headings use text-lg/semibold; body/actions text-sm; table metadata text-xs or 11 px uppercase with tracking. ADC/PPM and API examples sometimes use monospace.

Mobile uses native Text styling without a custom font family in the inspected patient Dashboard/Header. Header title is 22 px/700, subtitle 12 px with 17 px line height, user name 11 px/600. Dashboard section titles are 14 px/700 and tip body 12 px with 18 px line height.

# Cards, Buttons, and Inputs

Web MetricCard uses white surface, slate-200 border, rounded-2xl, p-5, subtle shadow, and 148 px minimum height. Dashboard sections use rounded-3xl, border, white surface and light shadow. Primary/header buttons use rounded-xl and px-4 py-2.5; quick access buttons use rounded-2xl. Status badges use compact padding and rounded-lg or rounded-full depending on component.

Live Scan inputs/selects are full-width white controls with slate-200 border, rounded-xl, px-4 py-3, and sky focus border/ring. Retain labels, required state, disabled/loading feedback, and existing validation.

Mobile patient tip cards use white, 16 px radius, 14 px padding, one-pixel border and subtle shadow. Header logout uses 14 px radius, translucent white surface/border, and disabled state. Inspect shared card styles before extending another card type.

# Sidebar, Header, and Navigation

Web App.jsx uses a flex, full-height shell with a fixed-width sidebar area and scrolling main content. MedicalSidebar has max-width 280 px and active NavLinks for Dashboard, Patients, Readings, Trends, Live Scan. Its nav uses wrapping flex below lg and a column at lg, but the outer App shell remains a row; do not claim a complete mobile drawer exists.

Dashboard header stacks below lg and aligns horizontally at lg. Sidebar footer shows provider identity and logout. There is no dedicated profile-edit page.

Mobile active tabs are Dashboard, Results, Trend, Tips. AppNavigator uses lucide-react-native outlined icons (House, ClipboardList, ChartNoAxesCombined, Lightbulb), blue active tint, pale-blue active icon background, and muted inactive tint. Other screens/cards use text glyphs or emoji; web sidebar/metrics use inline SVG. No new icon dependency is needed.

# Spacing, Radius, and Responsive Behavior

Web Dashboard content is max-w-7xl with p-4, sm:p-6, lg:p-8; sections commonly use gap-4, gap-6, and mb-6. Metrics progress from one to two to four columns at md/xl. Main sections become an unequal two-column grid at xl. Tables use overflow-x-auto. Preserve overflow and avoid assuming every page has the same max width; Live Scan uses max-w-5xl.

Mobile Dashboard uses 16 px horizontal margins/padding, 10 px metric gaps, and 22 px section top spacing. ScreenHeader uses 20 px horizontal padding, 56 px top padding, 22 px bottom padding, and 24 px lower corner radii. The bottom tab bar is white with 22 px radius, 12 px horizontal margin, 86 px height, and bottom margin based on safe-area inset. ScrollView and wrapping metric rows support available width; app.json uses portrait orientation.

# Workflow and Verification

Inventory the target page's content and interactions before styling. Reuse current components and the relevant Dashboard reference. Preserve API calls, authentication, field meaning, patient filters, query parameters, chart data, actions, and loading/empty/error states. Cosmetic work does not authorize adding routes, removing controls, or changing estimation behavior.

For authorized UI changes, inspect desktop/narrow web layouts and patient mobile scrolling/tab safe areas where available. Verify readable contrast, focus/disabled states, table overflow, and navigation. Source observations alone do not prove runtime responsiveness or accessibility. Do not install fonts/icons or redesign anything during skill documentation.

