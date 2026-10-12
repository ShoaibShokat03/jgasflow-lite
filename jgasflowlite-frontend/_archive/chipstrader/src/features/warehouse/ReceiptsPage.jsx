import { PackageCheck } from 'lucide-react';
import { fmtDate, fmtQty } from '@/lib/format';
import { StatusBadge } from '@/components/ui/status';
import { SimpleList } from './SimpleList';

export default function ReceiptsPage() {
  return (
    <SimpleList
      title="Receivings"
      api="/receipts"
      icon={PackageCheck}
      label="receipts"
      searchPlaceholder="Receipt, PO or supplier…"
      statuses={['posted', 'cancelled']}
      rowLink={(r) => `/receipts/${r.id}`}
      columns={[
        { key: 'receipt_no', header: 'Receipt', mobile: true, render: (r) => <span className="mono font-semibold text-brand-700 dark:text-brand-300">{r.receipt_no}</span> },
        { key: 'po_no', header: 'Purchase order', render: (r) => <span className="mono text-xs">{r.po_no}</span> },
        { key: 'partner_name', header: 'Supplier', mobile: true, render: (r) => r.partner_name },
        { key: 'received_date', header: 'Received', render: (r) => fmtDate(r.received_date) },
        { key: 'supplier_packing_no', header: 'Packing no.', render: (r) => r.supplier_packing_no || '' },
        { key: 'total_qty', header: 'Pieces', align: 'right', render: (r) => fmtQty(r.total_qty) },
        { key: 'status', header: 'Status', mobile: true, render: (r) => <StatusBadge status={r.status} /> },
      ]}
    />
  );
}
