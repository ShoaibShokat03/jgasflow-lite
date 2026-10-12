import { Link2 } from 'lucide-react';
import { fmtDate, fmtQty } from '@/lib/format';
import { StatusBadge } from '@/components/ui/status';
import { SimpleList } from './SimpleList';

export default function AllocationsPage() {
  return (
    <SimpleList
      title="Allocations"
      api="/allocations"
      icon={Link2}
      label="allocations"
      searchPlaceholder="Allocation, order or customer…"
      statuses={['active', 'cancelled']}
      rowLink={(r) => `/sales-orders/${r.sales_order_id}?tab=fulfilment`}
      columns={[
        { key: 'allocation_no', header: 'Allocation', mobile: true, render: (r) => <span className="mono font-semibold">{r.allocation_no}</span> },
        { key: 'so_no', header: 'Sales order', mobile: true, render: (r) => <span className="mono text-brand-700 dark:text-brand-300">{r.so_no}</span> },
        { key: 'partner_name', header: 'Customer', render: (r) => r.partner_name },
        { key: 'allocation_date', header: 'Date', render: (r) => fmtDate(r.allocation_date) },
        { key: 'total_qty', header: 'Pieces', align: 'right', render: (r) => fmtQty(r.total_qty) },
        { key: 'status', header: 'Status', mobile: true, render: (r) => <StatusBadge status={r.status} /> },
      ]}
    />
  );
}
