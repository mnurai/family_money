import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Layout } from './components/Layout';
import { AccountsPage } from './pages/Accounts';
import { AuditPage } from './pages/Audit';
import { LoginPage, RegisterPage } from './pages/Auth';
import { BudgetsPage } from './pages/Budgets';
import { DashboardPage } from './pages/Dashboard';
import { GoalsPage } from './pages/Goals';
import { MembersPage } from './pages/Members';
import { InviteLinkPage, WelcomePage } from './pages/Onboarding';
import { ReportsPage } from './pages/Reports';
import { TransactionsPage } from './pages/Transactions';
import { useSession } from './state/session';
import type { MemberRole } from './api';

function Splash() {
  return <div className="center-page"><span className="brand-mark" style={{ width: 44, height: 44 }} /></div>;
}

/** Needs a logged-in user; sends people without a family to the welcome screen. */
function RequireFamily({ children }: { children: ReactNode }) {
  const { me } = useSession();
  const location = useLocation();
  if (!me) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!me.member) return <Navigate to="/welcome" replace />;
  return <>{children}</>;
}

/** Screens a role may not open (doc 02 §3). The API refuses these requests anyway. */
function RequireRole({ roles, children }: { roles: MemberRole[]; children: ReactNode }) {
  const { me } = useSession();
  return me?.member && roles.includes(me.member.role) ? <>{children}</> : <Navigate to="/" replace />;
}

export function App() {
  const { me, loading } = useSession();
  if (loading) return <Splash />;

  return (
    <Routes>
      <Route path="/login" element={me ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/register" element={me ? <Navigate to="/" replace /> : <RegisterPage />} />
      <Route path="/welcome" element={!me ? <Navigate to="/login" replace /> : me.member ? <Navigate to="/" replace /> : <WelcomePage />} />
      <Route path="/invite/:token" element={me ? <InviteLinkPage /> : <Navigate to="/login" replace />} />
      <Route element={<RequireFamily><Layout /></RequireFamily>}>
        <Route index element={<DashboardPage />} />
        <Route path="transactions" element={<TransactionsPage />} />
        <Route path="accounts" element={<AccountsPage />} />
        <Route path="budgets" element={<RequireRole roles={['OWNER', 'ADULT']}><BudgetsPage /></RequireRole>} />
        <Route path="goals" element={<RequireRole roles={['OWNER', 'ADULT']}><GoalsPage /></RequireRole>} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="members" element={<MembersPage />} />
        <Route path="audit" element={<RequireRole roles={['OWNER']}><AuditPage /></RequireRole>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
