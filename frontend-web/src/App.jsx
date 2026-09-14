import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import MedicalSidebar from './components/MedicalSidebar';
import PatientSidebar from './components/PatientSidebar';
import AuthPage from './pages/AuthPage';

// Medical Pages
import MedicalDashboard from './pages/medical/Dashboard';
import MedicalPatients from './pages/medical/Patients';
import MedicalReadings from './pages/medical/Readings';
import MedicalTrends from './pages/medical/Trends';
import MedicalLiveScan from './pages/medical/LiveScan';

// Patient Pages
import PatientDashboard from './pages/patient/Dashboard';
import MyResults from './pages/patient/MyResults';
import MyTrend from './pages/patient/MyTrend';
import HealthTips from './pages/patient/HealthTips';

function MedicalLayout({ children }) {
  const { user, role, loading } = useAuth();
  if (loading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><div className="text-white/30 text-sm">Loading...</div></div>;
  if (!user || role !== 'medical') return <Navigate to="/" replace />;
  return (
    <div className="flex h-screen overflow-hidden bg-slate-950">
      <MedicalSidebar />
      <main className="flex-1 min-w-0 overflow-y-auto">{children}</main>
    </div>
  );
}

function PatientLayout({ children }) {
  const { user, role, loading } = useAuth();
  if (loading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><div className="text-white/30 text-sm">Loading...</div></div>;
  if (!user || role !== 'patient') return <Navigate to="/" replace />;
  return (
    <div className="flex h-screen overflow-hidden bg-slate-950">
      <PatientSidebar />
      <main className="flex-1 min-w-0 overflow-y-auto">{children}</main>
    </div>
  );
}

function PublicRoute({ children }) {
  const { user, role, loading } = useAuth();
  if (loading) return null;
  if (user && role === 'medical') return <Navigate to="/medical/dashboard" replace />;
  if (user && role === 'patient') return <Navigate to="/patient/dashboard" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/" element={<PublicRoute><AuthPage /></PublicRoute>} />

          {/* Medical Personnel Routes */}
          <Route path="/medical/dashboard" element={<MedicalLayout><MedicalDashboard /></MedicalLayout>} />
          <Route path="/medical/patients" element={<MedicalLayout><MedicalPatients /></MedicalLayout>} />
          <Route path="/medical/readings" element={<MedicalLayout><MedicalReadings /></MedicalLayout>} />
          <Route path="/medical/trends" element={<MedicalLayout><MedicalTrends /></MedicalLayout>} />
          <Route path="/medical/livescan" element={<MedicalLayout><MedicalLiveScan /></MedicalLayout>} />

          {/* Patient Routes */}
          <Route path="/patient/dashboard" element={<PatientLayout><PatientDashboard /></PatientLayout>} />
          <Route path="/patient/results" element={<PatientLayout><MyResults /></PatientLayout>} />
          <Route path="/patient/trend" element={<PatientLayout><MyTrend /></PatientLayout>} />
          <Route path="/patient/tips" element={<PatientLayout><HealthTips /></PatientLayout>} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}