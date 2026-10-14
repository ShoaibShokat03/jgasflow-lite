import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { useLang } from '@/lib/i18n';
import { Loading } from '@/ui/kit';
import { Shell } from '@/ui/Shell';
import Landing from '@/pages/public/Landing';
import Login from '@/pages/public/Login';
import Signup from '@/pages/public/Signup';
import ForgotPassword from '@/pages/public/ForgotPassword';
import Impersonate from '@/pages/public/Impersonate';
import Legal, { Contact } from '@/pages/public/Legal';
import Dashboard from '@/pages/Dashboard';
import NewSale from '@/pages/NewSale';
import Sales from '@/pages/Sales';
import SaleView from '@/pages/SaleView';
import Customers from '@/pages/Customers';
import CustomerView from '@/pages/CustomerView';
import Udhaar from '@/pages/Udhaar';
import PaymentView from '@/pages/PaymentView';
import Stock from '@/pages/Stock';
import CylinderTypes from '@/pages/CylinderTypes';
import Purchases from '@/pages/Purchases';
import NewPurchase from '@/pages/NewPurchase';
import PurchaseView from '@/pages/PurchaseView';
import Suppliers from '@/pages/Suppliers';
import SupplierView from '@/pages/SupplierView';
import Prices from '@/pages/Prices';
import Reports from '@/pages/Reports';
import Team from '@/pages/Team';
import Billing from '@/pages/Billing';
import DataSync from '@/pages/DataSync';
import Settings from '@/pages/Settings';
import Support from '@/pages/Support';
import Manual from '@/pages/Manual';
import AdminOverview from '@/pages/admin/AdminOverview';
import AdminShops from '@/pages/admin/AdminShops';
import AdminShop from '@/pages/admin/AdminShop';
import AdminPayments from '@/pages/admin/AdminPayments';
import Account from '@/pages/Account';
import Welcome from '@/pages/Welcome';

/** Only for logged-in shop users; `who` limits by role. */
function ShopOnly({ children, who = 'all' }) {
  const auth = useAuth();
  const loc = useLocation();
  if (auth.status === 'loading') return <Loading className="min-h-dvh" />;
  if (auth.status !== 'user') return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (auth.isSuper) return <Navigate to="/admin" replace />;
  if (who === 'mgr' && !auth.isManager) return <Navigate to="/app" replace />;
  if (who === 'owner' && !auth.isOwner) return <Navigate to="/app" replace />;
  return children;
}

function AdminOnly({ children }) {
  const auth = useAuth();
  if (auth.status === 'loading') return <Loading className="min-h-dvh" />;
  if (auth.status !== 'user') return <Navigate to="/login" replace />;
  if (!auth.isSuper) return <Navigate to="/app" replace />;
  return children;
}

export default function App() {
  useLang();
  const mgr = (el) => <ShopOnly who="mgr">{el}</ShopOnly>;
  const owner = (el) => <ShopOnly who="owner">{el}</ShopOnly>;
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/impersonate" element={<Impersonate />} />
      <Route path="/terms" element={<Legal page="terms" />} />
      <Route path="/privacy" element={<Legal page="privacy" />} />
      <Route path="/refund-policy" element={<Legal page="refund" />} />
      <Route path="/disclaimer" element={<Legal page="disclaimer" />} />
      <Route path="/contact" element={<Contact />} />

      <Route path="/app" element={<ShopOnly><Shell /></ShopOnly>}>
        <Route index element={<Dashboard />} />
        <Route path="welcome" element={<Welcome />} />
        <Route path="sales" element={<Sales />} />
        <Route path="sales/new" element={<NewSale />} />
        <Route path="sales/:uid" element={<SaleView />} />
        <Route path="customers" element={<Customers />} />
        <Route path="customers/:uid" element={<CustomerView />} />
        <Route path="udhaar" element={<Udhaar />} />
        <Route path="payments/:uid" element={<PaymentView />} />
        <Route path="stock" element={mgr(<Stock />)} />
        <Route path="cylinders" element={mgr(<CylinderTypes />)} />
        <Route path="purchases" element={mgr(<Purchases />)} />
        <Route path="purchases/new" element={mgr(<NewPurchase />)} />
        <Route path="purchases/:uid" element={mgr(<PurchaseView />)} />
        <Route path="suppliers" element={mgr(<Suppliers />)} />
        <Route path="suppliers/:uid" element={mgr(<SupplierView />)} />
        <Route path="prices" element={mgr(<Prices />)} />
        <Route path="reports" element={mgr(<Reports />)} />
        <Route path="team" element={owner(<Team />)} />
        <Route path="billing" element={owner(<Billing />)} />
        <Route path="data" element={mgr(<DataSync />)} />
        <Route path="settings" element={<Settings />} />
        <Route path="support" element={<Support />} />
        <Route path="manual" element={<Manual />} />
      </Route>

      <Route path="/admin" element={<AdminOnly><Shell admin /></AdminOnly>}>
        <Route index element={<AdminOverview />} />
        <Route path="shops" element={<AdminShops />} />
        <Route path="shops/:id" element={<AdminShop />} />
        <Route path="payments" element={<AdminPayments />} />
        <Route path="account" element={<Account />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
