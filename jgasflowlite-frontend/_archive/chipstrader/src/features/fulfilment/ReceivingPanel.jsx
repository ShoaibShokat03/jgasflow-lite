import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PackageCheck, Ban, PackagePlus } from 'lucide-react';
import { errorMessage, get, post } from '@/lib/api';
import { fmtDate, fmtQty, today } from '@/lib/format';
import { useMaster, useMe } from '@/lib/hooks';
import { Button, Card, CardHeader, EmptyState, Field, Input, Spinner, Textarea } from '@/components/ui/core';
import { ConfirmDialog, Modal, useToast } from '@/components/ui/overlay';
import { Progress, StatusBadge } from '@/components/ui/status';
import { MasterSelect } from '@/components/ui/pickers';

/** PO receiving: what is outstanding, receipts so far, and the receive form. */
export default function ReceivingPanel({ doc, onChange }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useMe();
  const { name } = useMaster();
  const [open, setOpen] = useState(false);
  const [cancel, setCancel] = useState(null);
  const lines = useQuery({ queryKey: ['receivable', doc.id], queryFn: () => get(`/purchase-orders/${doc.id}/receivable`) });
  const receipts = useQuery({ queryKey: ['po-receipts', doc.id], queryFn: () => get(`/purchase-orders/${doc.id}/receipts`) });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['receivable', doc.id] });
    qc.invalidateQueries({ queryKey: ['po-receipts', doc.id] });
    onChange();
  };

  const cancelM = useMutation({
    mutationFn: ({ id, reason }) => post(`/receipts/${id}/cancel`, { reason }),
    onSuccess: () => {
      refresh();
      setCancel(null);
      toast.success('Receipt cancelled, stock removed');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (lines.isLoading) return <div className="py-16 grid place-items-center"><Spinner /></div>;
  const outstanding = (lines.data ?? []).reduce((a, l) => a + Number(l.outstanding), 0);
  const canReceive = can('recv.create') && !['draft', 'cancelled'].includes(doc.status) && outstanding > 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          icon={PackageCheck}
          title="Receiving"
          subtitle={doc.status === 'draft' ? 'Mark the PO as sent before receiving against it.' : `${fmtQty(outstanding)} pcs still to receive`}
          actions={canReceive && <Button variant="primary" size="sm" icon={PackagePlus} onClick={() => setOpen(true)}>Receive goods</Button>}
        />
        <div className="overflow-x-auto border-t border-line">
          <table className="table-base">
            <thead><tr><th>#</th><th>Part</th><th className="text-right">Ordered</th><th className="w-52">Received</th><th className="text-right">Outstanding</th></tr></thead>
            <tbody>
              {lines.data.map((l) => (
                <tr key={l.id}>
                  <td className="text-faint">{l.line_no}</td>
                  <td><p className="mono font-semibold">{l.part_number}</p><p className="text-xs text-muted">{name('manufacturers', l.manufacturer_id)}</p></td>
                  <td className="text-right tabular-nums">{fmtQty(l.quantity_required)}</td>
                  <td><div className="flex items-center gap-2"><Progress value={Number(l.received_qty)} max={Number(l.quantity_required)} tone="green" /><span className="text-xs tabular-nums text-muted w-14 text-right">{fmtQty(l.received_qty)}</span></div></td>
                  <td className="text-right tabular-nums font-medium">{fmtQty(l.outstanding)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader title="Receipts" />
        {!receipts.data?.items?.length ? (
          <EmptyState icon={PackageCheck} title="No receipts yet" />
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {receipts.data.items.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1">
                  <Link to={`/receipts/${r.id}`} className="mono font-semibold hover:text-link">{r.receipt_no}</Link>
                  <p className="text-xs text-muted">{fmtDate(r.received_date)} · {fmtQty(r.total_qty)} pcs{r.supplier_packing_no ? ` · packing ${r.supplier_packing_no}` : ''}</p>
                </div>
                <StatusBadge status={r.status} />
                {r.status === 'posted' && can('recv.update') && <Button variant="ghost" size="sm" icon={Ban} onClick={() => setCancel(r)}>Cancel</Button>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {open && <ReceiveDialog po={doc} lines={lines.data.filter((l) => Number(l.outstanding) > 0)} onClose={() => setOpen(false)} onDone={refresh} />}
      <ConfirmDialog open={!!cancel} onClose={() => setCancel(null)} danger reason title={`Cancel ${cancel?.receipt_no}?`} message="The stock lots from this receipt are removed. Not possible once any of it is allocated or shipped." confirmLabel="Cancel receipt" loading={cancelM.isPending} onConfirm={(reason) => cancelM.mutate({ id: cancel.id, reason })} />
    </div>
  );
}

function ReceiveDialog({ po, lines, onClose, onDone }) {
  const toast = useToast();
  const [h, setH] = useState({ received_date: today(), warehouse_id: null, supplier_packing_no: '', notes: '' });
  const [rows, setRows] = useState(() => Object.fromEntries(lines.map((l) => [l.id, { qty: Number(l.outstanding), date_code: l.date_code ?? '', batch_no: '', bin_location: '' }])));
  const setRow = (id, k, v) => setRows((r) => ({ ...r, [id]: { ...r[id], [k]: v } }));
  const total = Object.values(rows).reduce((a, r) => a + (Number(r.qty) || 0), 0);

  const m = useMutation({
    mutationFn: () =>
      post(`/purchase-orders/${po.id}/receive`, {
        ...Object.fromEntries(Object.entries(h).filter(([, v]) => v !== '' && v !== null)),
        lines: Object.entries(rows).filter(([, r]) => Number(r.qty) > 0).map(([id, r]) => ({ po_line_id: Number(id), qty: Number(r.qty), date_code: r.date_code || undefined, batch_no: r.batch_no || undefined, bin_location: r.bin_location || undefined })),
      }),
    onSuccess: (r) => {
      toast.success(`${r.receipt_no} posted, stock created`);
      onDone();
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      icon={PackagePlus}
      title={`Receive against ${po.doc_no}`}
      footer={
        <>
          <span className="mr-auto text-sm text-muted">Receiving <b className="tabular-nums">{fmtQty(total)}</b> pcs</span>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={m.isPending} disabled={!total} onClick={() => m.mutate()}>Post receipt</Button>
        </>
      }
    >
      <div className="grid sm:grid-cols-3 gap-3 mb-4">
        <Field label="Received on">{(id) => <Input id={id} type="date" value={h.received_date} onChange={(e) => setH({ ...h, received_date: e.target.value })} />}</Field>
        <Field label="Warehouse">{(id) => <MasterSelect id={id} list="warehouses" value={h.warehouse_id} onChange={(v) => setH({ ...h, warehouse_id: v })} />}</Field>
        <Field label="Supplier packing no.">{(id) => <Input id={id} value={h.supplier_packing_no} onChange={(e) => setH({ ...h, supplier_packing_no: e.target.value })} />}</Field>
      </div>
      <div className="overflow-x-auto -mx-5 border-y border-line">
        <table className="table-base">
          <thead><tr><th>Part</th><th className="text-right">Outstanding</th><th className="w-28">Receive</th><th className="w-28">Date code</th><th className="w-32">Batch / lot</th><th className="w-28">Bin</th></tr></thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id}>
                <td className="mono font-semibold">{l.part_number}</td>
                <td className="text-right tabular-nums">{fmtQty(l.outstanding)}</td>
                <td><Input type="number" min="0" max={l.outstanding} step="any" className="h-8 text-right" value={rows[l.id].qty} onChange={(e) => setRow(l.id, 'qty', e.target.value)} /></td>
                <td><Input className="h-8" value={rows[l.id].date_code} onChange={(e) => setRow(l.id, 'date_code', e.target.value)} /></td>
                <td><Input className="h-8" value={rows[l.id].batch_no} onChange={(e) => setRow(l.id, 'batch_no', e.target.value)} /></td>
                <td><Input className="h-8" value={rows[l.id].bin_location} onChange={(e) => setRow(l.id, 'bin_location', e.target.value)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Field label="Notes" className="mt-3">{(id) => <Textarea id={id} rows={2} value={h.notes} onChange={(e) => setH({ ...h, notes: e.target.value })} />}</Field>
    </Modal>
  );
}
