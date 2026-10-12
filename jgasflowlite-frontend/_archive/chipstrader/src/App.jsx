import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { session } from '@/lib/session';
import { useMe } from '@/lib/hooks';
import { Spinner, EmptyState, LinkButton } from '@/components/ui/core';
import { DOCS } from '@/features/documents/doc-types';
import AppShell from '@/components/layout/AppShell';
import { ShieldAlert } from 'lucide-react';

// Every screen is its own chunk: the first paint loads only the shell.
const Login = lazy(() => import('@/features/auth/LoginPage'));
const Setup = lazy(() => import('@/features/auth/SetupPage'));
const Track = lazy(() => import('@/features/track/TrackPage'));
const Dashboard = lazy(() => import('@/features/dashboard/DashboardPage'));
const DocList = lazy(() => import('@/features/documents/DocListPage'));
const DocDetail = lazy(() => import('@/features/documents/DocDetailPage'));
const Companies = lazy(() => import('@/features/crm/CompaniesPage'));
const Company = lazy(() => import('@/features/crm/CompanyPage'));
const Invoices = lazy(() => import('@/features/invoices/InvoicesPage'));
const Invoice = lazy(() => import('@/features/invoices/InvoicePage'));
const Stock = lazy(() => import('@/features/warehouse/StockPage'));
const StockDetail = lazy(() => import('@/features/warehouse/StockDetailPage'));
const Receipts = lazy(() => import('@/features/warehouse/ReceiptsPage'));
const Receipt = lazy(() => import('@/features/warehouse/ReceiptPage'));
const Allocations = lazy(() => import('@/features/warehouse/AllocationsPage'));
const Shipments = lazy(() => import('@/features/warehouse/ShipmentsPage'));
const Shipment = lazy(() => import('@/features/warehouse/ShipmentPage'));
const Sourcing = lazy(() => import('@/features/sourcing/SourcingPage'));
const Users = lazy(() => import('@/features/admin/UsersPage'));
const Roles = lazy(() => import('@/features/admin/RolesPage'));
const Sessions = lazy(() => import('@/features/admin/SessionsPage'));
const MasterData = lazy(() => import('@/features/admin/MasterDataPage'));
const CompanyProfile = lazy(() => import('@/features/admin/CompanyProfilePage'));
const AiSettings = lazy(() => import('@/features/admin/AiSettingsPage'));
const Help = lazy(() => import('@/features/help/HelpPage'));

function RequireAuth({ children }) {
  const location = useLocation();
  if (!session.isSignedIn()) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  return children;
}

/** Route-level permission gate: a friendly page instead of a failed request. */
function Gate({ perm, children }) {
  const { can, me } = useMe();
  if (!me) return null;
  if (perm && !can(...[].concat(perm))) {
    return (
      <EmptyState icon={ShieldAlert} title="You don't have access to this page" action={<LinkButton to="/">Back to dashboard</LinkButton>}>
        Ask an administrator to grant the permission if you need it.
      </EmptyState>
    );
  }
  return children;
}

function Home() {
  const { can, me } = useMe();
  if (!me) return null;
  return can('dashboard.view') ? <Dashboard /> : <Navigate to="/companies" replace />;
}

const Loading = () => (
  <div className="min-h-dvh grid place-items-center">
    <Spinner />
  </div>
);

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.VITE_BASE_PATH || '/'}>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/setup" element={<Setup />} />
          <Route path="/track/:token" element={<Track />} />
          <Route
            element={
              <RequireAuth>
                <AppShell />
              </RequireAuth>
            }
          >
            <Route index element={<Home />} />
            {Object.values(DOCS).map((d) => (
              <Route key={d.kind} path={d.route}>
                <Route index element={<Gate perm={`${d.prefix}.view`}><DocList kind={d.kind} /></Gate>} />
                <Route path=":id" element={<Gate perm={`${d.prefix}.view`}><DocDetail kind={d.kind} /></Gate>} />
              </Route>
            ))}
            <Route path="companies" element={<Gate perm={['company.view', 'customer.view', 'supplier.view']}><Companies /></Gate>} />
            <Route path="companies/:id" element={<Gate perm={['company.view', 'customer.view', 'supplier.view']}><Company /></Gate>} />
            <Route path="invoices" element={<Gate perm="inv.view"><Invoices /></Gate>} />
            <Route path="invoices/:id" element={<Gate perm="inv.view"><Invoice /></Gate>} />
            <Route path="stock" element={<Gate perm="stock.view"><Stock /></Gate>} />
            <Route path="stock/:id" element={<Gate perm="stock.view"><StockDetail /></Gate>} />
            <Route path="receipts" element={<Gate perm="recv.view"><Receipts /></Gate>} />
            <Route path="receipts/:id" element={<Gate perm="recv.view"><Receipt /></Gate>} />
            <Route path="allocations" element={<Gate perm="alloc.view"><Allocations /></Gate>} />
            <Route path="shipments" element={<Gate perm="shipment.view"><Shipments /></Gate>} />
            <Route path="shipments/:id" element={<Gate perm="shipment.view"><Shipment /></Gate>} />
            <Route path="sourcing" element={<Gate perm={['req.view', 'quote.view', 'po.view', 'stock.view']}><Sourcing /></Gate>} />
            <Route path="admin/users" element={<Gate perm="sys.users.manage"><Users /></Gate>} />
            <Route path="admin/roles" element={<Gate perm="sys.roles.manage"><Roles /></Gate>} />
            <Route path="admin/sessions" element={<Gate perm="sys.sessions.manage"><Sessions /></Gate>} />
            <Route path="admin/master-data" element={<Gate perm="master.view"><MasterData /></Gate>} />
            <Route path="admin/company" element={<Gate perm="sys.settings.manage"><CompanyProfile /></Gate>} />
            <Route path="admin/ai" element={<Gate perm="ai.settings.manage"><AiSettings /></Gate>} />
            <Route path="help" element={<Help />} />
            <Route path="*" element={<EmptyState title="Page not found" action={<LinkButton to="/">Go to dashboard</LinkButton>} />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
