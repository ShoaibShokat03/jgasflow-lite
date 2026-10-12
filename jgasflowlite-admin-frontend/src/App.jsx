// src/App.jsx
// JDent SaaS — platform admin panel.
// Pages are lazy-loaded (code-split) so the first paint ships only the
// login screen + shell; each list page downloads on first visit and is
// then cached by the browser.
import React, { Suspense, lazy } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { DarkModeProvider } from "./contexts/DarkModeContext";
import { BASE_PATH } from "./config/app";
import { isAuthenticated, getAdmin, canModule, landingPath } from "./utils/saasAuth";
import SaasLayout from "./components/saas/layout/SaasLayout";
import LoginPage from "./components/saas/pages/LoginPage";
import ErrorBoundary from "./components/common/ErrorBoundary";

const DashboardPage = lazy(() => import("./components/saas/pages/DashboardPage"));
const PlansPage = lazy(() => import("./components/saas/pages/PlansPage"));
const CompaniesPage = lazy(() => import("./components/saas/pages/CompaniesPage"));
const SubscriptionsPage = lazy(() => import("./components/saas/pages/SubscriptionsPage"));
const InvoicesPage = lazy(() => import("./components/saas/pages/InvoicesPage"));
const AdminsPage = lazy(() => import("./components/saas/pages/AdminsPage"));
const AnalyticsPage = lazy(() => import("./components/saas/pages/AnalyticsPage"));
const SupportPage = lazy(() => import("./components/saas/pages/SupportPage"));
const AssistantPage = lazy(() => import("./components/saas/pages/AssistantPage"));
const AiSettingsPage = lazy(() => import("./components/saas/pages/AiSettingsPage"));

// Structure-stable fallback: a shell-shaped shimmer card, so a lazy page
// chunk loading looks identical to a list page's initial skeleton.
const PageFallback = () => (
  <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
    <div className="p-4 sm:p-5 border-b border-gray-100 dark:border-gray-700 space-y-3">
      <div className="flex items-center gap-3">
        <span className="shimmer-block w-9 h-9 rounded-lg" />
        <div className="space-y-1.5">
          <span className="shimmer-block block h-4 w-40" />
          <span className="shimmer-block block h-3 w-24" />
        </div>
      </div>
      <div className="flex gap-2">
        <span className="shimmer-block h-8 w-64 rounded-lg" />
        <span className="shimmer-block h-8 w-28 rounded-lg" />
        <span className="shimmer-block h-8 w-28 rounded-lg" />
      </div>
    </div>
    <div className="p-4 space-y-3" style={{ minHeight: 380 }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <span key={i} className="shimmer-block block h-8 w-full rounded-lg" />
      ))}
    </div>
  </div>
);

const ProtectedRoute = ({ children }) =>
  isAuthenticated() ? children : <Navigate to="/login" replace />;

const PublicRoute = ({ children }) =>
  isAuthenticated() ? <Navigate to={landingPath()} replace /> : children;

// /admins is super_admin only — anyone else typing the URL is bounced.
const SuperAdminRoute = ({ children }) =>
  getAdmin()?.role === "super_admin" ? children : <Navigate to={landingPath()} replace />;

/**
 * A module the super admin hasn't granted is not just hidden in the sidebar —
 * typing its URL lands you back on the first module you do have. The API
 * enforces the same list, so this is convenience, not the security boundary.
 */
const ModuleRoute = ({ module, children }) =>
  canModule(module) ? children : <Navigate to={landingPath()} replace />;

/** An admin scoped to nothing at all still needs somewhere to land. */
const NoAccessPage = () => (
  <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-10 text-center">
    <h2 className="text-base font-semibold text-gray-900 dark:text-white">No modules assigned</h2>
    <p className="mt-1 text-sm text-gray-500">
      Ask a super admin to grant you access to a module.
    </p>
  </div>
);

const lazyPage = (node) => <Suspense fallback={<PageFallback />}>{node}</Suspense>;

/**
 * Catches a render crash and shows a way out instead of a blank page.
 *
 * Keyed by pathname so the error clears when the admin navigates elsewhere —
 * React keeps a boundary's error state until the component is remounted, and
 * a new key is what remounts it. Inside the Router so the key can come from
 * the current location.
 */
const CrashGuard = ({ children }) => {
  const { pathname } = useLocation();
  return <ErrorBoundary key={pathname}>{children}</ErrorBoundary>;
};

const App = () => (
  <DarkModeProvider>
    <Router basename={BASE_PATH}>
      <CrashGuard>
        <Routes>
        {/* Public */}
        <Route
          path="/login"
          element={
            <PublicRoute>
              <LoginPage />
            </PublicRoute>
          }
        />

        {/* Protected shell */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <SaasLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to={landingPath()} replace />} />
          <Route path="no-access" element={<NoAccessPage />} />
          {[
            ["dashboard", <DashboardPage />],
            ["plans", <PlansPage />],
            // Path and permission differ here: the screen is /clinics, the
            // grant is still `companies.*`. See saasModules.js.
            ["clinics", <CompaniesPage />, "companies"],
            ["subscriptions", <SubscriptionsPage />],
            ["invoices", <InvoicesPage />],
            ["analytics", <AnalyticsPage />],
            ["support", <SupportPage />],
            ["assistant", <AssistantPage />],
            // Its own page, not a dialog — two services to configure, each
            // with a key, a picker and a test. A sub-path, so it carries the
            // module key explicitly: the gate is "assistant", not the URL.
            ["assistant/settings", <AiSettingsPage />, "assistant"],
          ].map(([key, node, moduleKey]) => (
            <Route
              key={key}
              path={key}
              element={
                <ModuleRoute module={moduleKey ?? key}>{lazyPage(node)}</ModuleRoute>
              }
            />
          ))}
          <Route
            path="admins"
            element={
              <SuperAdminRoute>{lazyPage(<AdminsPage />)}</SuperAdminRoute>
            }
          />
          {/* The screen used to live at /companies. A bookmark, a link in
              an old email or a support note must still land on it rather
              than bouncing to the dashboard. */}
          <Route path="companies" element={<Navigate to="/clinics" replace />} />
          <Route path="*" element={<Navigate to={landingPath()} replace />} />
        </Route>

          {/* Public catch-all */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </CrashGuard>
    </Router>
  </DarkModeProvider>
);

export default App;
