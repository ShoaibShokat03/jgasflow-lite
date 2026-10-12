import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban } from 'lucide-react';
import { errorMessage, get, post } from '@/lib/api';
import { fmtDate, fmtQty } from '@/lib/format';
import { useMaster, useMe } from '@/lib/hooks';
import { Button, Card, CardHeader, DetailList, PageHeader, Skeleton } from '@/components/ui/core';
import { ConfirmDialog, useToast } from '@/components/ui/overlay';
import { StatusBadge } from '@/components/ui/status';
import { HistoryPanel } from '@/features/shared/HistoryPanel';

export default function ReceiptPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useMe();
  const { name } = useMaster();
  const [cancel, setCancel] = useState(false);
  const q = useQuery({ queryKey: ['/receipts', 'detail', id], queryFn: () => get(`/receipts/${id}`) });
  const m = useMutation({
    mutationFn: (reason) => post(`/receipts/${id}/cancel`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries();
      setCancel(false);
      toast.success('Receipt cancelled');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (q.isLoading) return <Skeleton className="h-64 w-full" />;
  const r = q.data;
  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'Receivings', to: '/receipts' }, { label: r.receipt_no }]}
        title={<span className="mono">{r.receipt_no}</span>}
        badge={<StatusBadge status={r.status} />}
        subtitle={r.supplier?.legal_name}
        actions={r.status === 'posted' && can('recv.update') && <Button icon={Ban} onClick={() => setCancel(true)}>Cancel receipt</Button>}
      />
      <Card className="p-4 mb-4">
        <DetailList cols={3} items={[
          { label: 'Purchase order', value: <Link to={`/purchase-orders/${r.purchase_order?.id}?tab=receiving`} className="mono hover:text-link">{r.purchase_order?.po_no}</Link> },
          { label: 'Received', value: fmtDate(r.received_date) },
          { label: 'Warehouse', value: name('warehouses', r.warehouse_id) },
          { label: 'Supplier packing no.', value: r.supplier_packing_no },
          { label: 'Cancel reason', value: r.cancel_reason, hidden: !r.cancel_reason },
          { label: 'Notes', value: r.notes },
        ]} />
      </Card>
      <Card className="mb-4">
        <CardHeader title="Received lines" />
        <div className="border-t border-line overflow-x-auto">
          <table className="table-base">
            <thead><tr><th>#</th><th>Part</th><th>PO line</th><th>Date code</th><th>Batch</th><th>Stock lot</th><th className="text-right">Qty</th></tr></thead>
            <tbody>
              {r.lines.map((l) => (
                <tr key={l.id} className={l.is_deleted ? 'text-muted line-through' : ''}>
                  <td className="text-faint">{l.line_no}</td>
                  <td><p className="mono font-semibold">{l.part_number}</p><p className="text-xs text-muted">{name('manufacturers', l.manufacturer_id)}</p></td>
                  <td>{l.po_line_no}</td>
                  <td>{l.received_date_code || ''}</td>
                  <td>{l.batch_no || ''}</td>
                  <td>{l.stock_id ? <Link to={`/stock/${l.stock_id}`} className="mono text-brand-700 dark:text-brand-300 hover:underline">{l.stock_no}</Link> : ''}</td>
                  <td className="text-right tabular-nums font-medium">{fmtQty(l.quantity_received)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <HistoryPanel events={r.events} createdAt={r.created_at} />
      <ConfirmDialog open={cancel} onClose={() => setCancel(false)} danger reason title={`Cancel ${r.receipt_no}?`} message="Its stock lots are removed. Not possible once any of it is allocated or shipped." confirmLabel="Cancel receipt" loading={m.isPending} onConfirm={(reason) => m.mutate(reason)} />
    </div>
  );
}
