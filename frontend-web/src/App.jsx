import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import MedicalSidebar from './components/MedicalSidebar';
import AuthPage from './pages/AuthPage';
import RequestError from './components/RequestError';
import { lazy, Suspense } from 'react';

// Medical Pages
const MedicalDashboard = lazy(() => import('./pages/medical/Dashboard'));
const MedicalPatients = lazy(() => import('./pages/medical/Patients'));
const MedicalReadings = lazy(() => import('./pages/medical/Readings'));
const MedicalTrends = lazy(() => import('./pages/medical/Trends'));
const MedicalLiveScan = lazy(() => import('./pages/medical/LiveScan'));
const MedicalAccount = lazy(() => import('./pages/medical/Account'));

function MedicalLayout({ children }) {
  const { user, role, loading, sessionError, retrySession, logout } = useAuth();
  if (sessionError) return <RequestError message={sessionError} onRetry={retrySession} onLogout={logout} />;
  if (loading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><div className="text-white/30 text-sm">Loading...</div></div>;
  if (!user || role !== 'medical') return <Navigate to="/" replace />;
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-slate-950 lg:flex-row">
      <MedicalSidebar />
      <main key={user.id} className="min-h-0 min-w-0 flex-1 overflow-y-auto"><Suspense fallback={<p className="p-6 text-slate-600">Loading page…</p>}>{children}</Suspense></main>
    </div>
  );
}

function PublicRoute({ children }) {
  const { user, role, loading, sessionError, retrySession, logout } = useAuth();
  if (sessionError) return <RequestError message={sessionError} onRetry={retrySession} onLogout={logout} />;
  if (loading) return null;
  if (user && role === 'medical') return <Navigate to="/medical/dashboard" replace />;
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
          <Route path="/medical/account" element={<MedicalLayout><MedicalAccount /></MedicalLayout>} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
