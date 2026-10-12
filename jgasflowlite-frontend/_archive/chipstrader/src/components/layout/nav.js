import {
  LayoutDashboard, FileQuestion, FileText, ShoppingCart, Receipt, Tags, ClipboardList, Building2,
  Boxes, PackageCheck, Link2, Truck, Users, ShieldCheck, Database, Building, Sparkles, MonitorSmartphone, Search, BookOpen,
} from 'lucide-react';

/**
 * The navigation map. Each item names the permission(s) that reveal it, so a
 * warehouse user simply never sees Quotes, and nobody sees a link that 403s.
 */
export const NAV = [
  { items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard, perm: ['dashboard.view'], end: true }] },
  {
    label: 'Sales',
    items: [
      { to: '/requirements', label: 'Requirements', icon: FileQuestion, perm: ['req.view'] },
      { to: '/quotes', label: 'Quotes', icon: FileText, perm: ['quote.view'] },
      { to: '/sales-orders', label: 'Sales orders', icon: ShoppingCart, perm: ['so.view'] },
      { to: '/invoices', label: 'Invoices', icon: Receipt, perm: ['inv.view'] },
    ],
  },
  {
    label: 'Purchasing',
    items: [
      { to: '/offers', label: 'Supplier offers', icon: Tags, perm: ['offer.view'] },
      { to: '/purchase-orders', label: 'Purchase orders', icon: ClipboardList, perm: ['po.view'] },
      { to: '/sourcing', label: 'Part sourcing', icon: Search, perm: ['req.view', 'quote.view', 'po.view', 'stock.view'] },
    ],
  },
  {
    label: 'CRM',
    items: [{ to: '/companies', label: 'Customers & suppliers', icon: Building2, perm: ['company.view', 'customer.view', 'supplier.view'] }],
  },
  {
    label: 'Warehouse',
    items: [
      { to: '/stock', label: 'Stock', icon: Boxes, perm: ['stock.view'] },
      { to: '/receipts', label: 'Receivings', icon: PackageCheck, perm: ['recv.view'] },
      { to: '/allocations', label: 'Allocations', icon: Link2, perm: ['alloc.view'] },
      { to: '/shipments', label: 'Shipments', icon: Truck, perm: ['shipment.view'] },
    ],
  },
  {
    label: 'Administration',
    items: [
      { to: '/admin/users', label: 'Users', icon: Users, perm: ['sys.users.manage'] },
      { to: '/admin/roles', label: 'Roles & permissions', icon: ShieldCheck, perm: ['sys.roles.manage'] },
      { to: '/admin/sessions', label: 'Active sessions', icon: MonitorSmartphone, perm: ['sys.sessions.manage'] },
      { to: '/admin/master-data', label: 'Master data', icon: Database, perm: ['master.view'] },
      { to: '/admin/company', label: 'Company profile', icon: Building, perm: ['sys.settings.manage'] },
      { to: '/admin/ai', label: 'AI assistant', icon: Sparkles, perm: ['ai.settings.manage'] },
    ],
  },
  // An empty perm list means everyone who is signed in.
  { label: 'Help', items: [{ to: '/help', label: 'User manual', icon: BookOpen, perm: [] }] },
];

export const flatNav = NAV.flatMap((g) => g.items.map((i) => ({ ...i, group: g.label })));
