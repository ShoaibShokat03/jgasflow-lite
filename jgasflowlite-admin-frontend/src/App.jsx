// src/App.jsx
// JGasFlow Console: the platform admin panel.
// Pages are lazy-loaded so the first paint ships only the sign-in screen and shell.
import React, { Suspense, lazy } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { DarkModeProvider } from "./contexts/DarkModeContext";
import { BASE_PATH } from "./config/app";
import { isAuthenticated, isSuper, canModule, landingPath } from "./utils/saasAuth";
import SaasLayout from "./components/saas/layout/SaasLayout";
import LoginPage from "./components/saas/pages/LoginPage";
import ErrorBoundary from "./components/common/ErrorBoundary";
import { Loading } from "./components/saas/kit";

const OverviewPage = lazy(() => import("./components/saas/pages/OverviewPage"));
const ShopsPage = lazy(() => import("./components/saas/pages/ShopsPage"));
const ShopDetailPage = lazy(() => import("./components/saas/pages/ShopDetailPage"));
const PaymentsPage = lazy(() => import("./components/saas/pages/PaymentsPage"));
const PlansPage = lazy(() => import("./components/saas/pages/PlansPage"));
const ReportsPage = lazy(() => import("./components/saas/pages/ReportsPage"));
const ActivityPage = lazy(() => import("./components/saas/pages/ActivityPage"));
const SettingsPage = lazy(() => import("./components/saas/pages/SettingsPage"));
const SupportPage = lazy(() => import("./components/saas/pages/SupportPage"));
const AdminsPage = lazy(() => import("./components/saas/pages/AdminsPage"));
const AccountPage = lazy(() => import("./components/saas/pages/AccountPage"));
const AssistantPage = lazy(() => import("./components/saas/pages/AssistantPage"));
const AiSettingsPage = lazy(() => import("./components/saas/pages/AiSettingsPage"));

const ProtectedRoute = ({ children }) => (isAuthenticated() ? children : <Navigate to="/login" replace />);
const PublicRoute = ({ children }) => (isAuthenticated() ? <Navigate to={landingPath()} replace /> : children);
const SuperAdminRoute = ({ children }) => (isSuper() ? children : <Navigate to={landingPath()} replace />);

/** A screen this admin was not given sends them to one they have. The API enforces the same list. */
const ModuleRoute = ({ module, children }) => (canModule(module) ? children : <Navigate to={landingPath()} replace />);

const NoAccessPage = () => (
  <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-10 text-center">
    <h2 className="text-base font-semibold text-gray-900 dark:text-white">No screens assigned</h2>
    <p className="mt-1 text-sm text-gray-500">Ask a super admin to give you access.</p>
  </div>
);

const lazyPage = (node) => <Suspense fallback={<Loading />}>{node}</Suspense>;

/** Shows a way out of a crashed screen; keyed by path so it resets on navigation. */
const CrashGuard = ({ children }) => {
  const { pathname } = useLocation();
  return <ErrorBoundary key={pathname}>{children}</ErrorBoundary>;
};

const ROUTES = [
  ["overview", <OverviewPage />, "overview"],
  ["shops", <ShopsPage />, "shops"],
  ["shops/:id", <ShopDetailPage />, "shops"],
  ["payments", <PaymentsPage />, "payments"],
  ["plans", <PlansPage />, "plans"],
  ["reports", <ReportsPage />, "reports"],
  ["activity", <ActivityPage />, "activity"],
  ["support", <SupportPage />, "support"],
  ["settings", <SettingsPage />, "settings"],
  ["assistant", <AssistantPage />, "assistant"],
  ["assistant/settings", <AiSettingsPage />, "ai_settings"],
];

const App = () => (
  <DarkModeProvider>
    <Router basename={BASE_PATH}>
      <CrashGuard>
        <Routes>
          <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />

          <Route path="/" element={<ProtectedRoute><SaasLayout /></ProtectedRoute>}>
            <Route index element={<Navigate to={landingPath()} replace />} />
            <Route path="no-access" element={<NoAccessPage />} />
            {ROUTES.map(([path, node, module]) => (
              <Route key={path} path={path} element={<ModuleRoute module={module}>{lazyPage(node)}</ModuleRoute>} />
            ))}
            <Route path="admins" element={<SuperAdminRoute>{lazyPage(<AdminsPage />)}</SuperAdminRoute>} />
            <Route path="account" element={lazyPage(<AccountPage />)} />
            {/* Old template addresses */}
            <Route path="dashboard" element={<Navigate to="/overview" replace />} />
            <Route path="clinics" element={<Navigate to="/shops" replace />} />
            <Route path="*" element={<Navigate to={landingPath()} replace />} />
          </Route>

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </CrashGuard>
    </Router>
  </DarkModeProvider>
);

export default App;
