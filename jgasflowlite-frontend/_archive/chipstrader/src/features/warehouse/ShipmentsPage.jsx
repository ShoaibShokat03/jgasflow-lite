import { Truck } from 'lucide-react';
import { fmtDate, fmtQty } from '@/lib/format';
import { StatusBadge } from '@/components/ui/status';
import { SimpleList } from './SimpleList';

export default function ShipmentsPage() {
  return (
    <SimpleList
      title="Shipments"
      api="/shipments"
      icon={Truck}
      label="shipments"
      searchPlaceholder="Shipment, order, tracking no. or customer…"
      statuses={['posted', 'delivered', 'cancelled']}
      rowLink={(r) => `/shipments/${r.id}`}
      columns={[
        { key: 'shipment_no', header: 'Shipment', mobile: true, render: (r) => <span className="mono font-semibold text-brand-700 dark:text-brand-300">{r.shipment_no}</span> },
        { key: 'so_no', header: 'Order', render: (r) => <span className="mono text-xs">{r.so_no}</span> },
        { key: 'partner_name', header: 'Customer', mobile: true, render: (r) => r.partner_name },
        { key: 'shipment_date', header: 'Shipped', render: (r) => fmtDate(r.shipment_date) },
        { key: 'carrier', header: 'Carrier', render: (r) => [r.carrier, r.tracking_no].filter(Boolean).join(' · ') || '' },
        { key: 'total_qty', header: 'Pieces', align: 'right', render: (r) => fmtQty(r.total_qty) },
        { key: 'invoice_no', header: 'Invoice', render: (r) => (r.invoice_no ? <span className="flex items-center gap-1.5"><span className="mono text-xs">{r.invoice_no}</span><StatusBadge status={r.invoice_status} className="h-4 px-1.5 text-[11px]" /></span> : '') },
        { key: 'status', header: 'Status', mobile: true, render: (r) => <StatusBadge status={r.status} /> },
      ]}
    />
  );
}
