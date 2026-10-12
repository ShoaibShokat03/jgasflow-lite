import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Printer, PackageCheck, Pencil, ChevronDown } from 'lucide-react';
import { errorMessage, get, openBlob, patch, post } from '@/lib/api';
import { fmtDate, fmtQty, fmtMoney } from '@/lib/format';
import { useMaster, useMe } from '@/lib/hooks';
import { Button, Card, CardHeader, DetailList, Field, Input, PageHeader, Skeleton, Textarea } from '@/components/ui/core';
import { ConfirmDialog, Menu, Modal, useToast } from '@/components/ui/overlay';
import { StatusBadge } from '@/components/ui/status';
import { HistoryPanel } from '@/features/shared/HistoryPanel';
import { AttachmentsPanel } from '@/features/shared/AttachmentsPanel';

export default function ShipmentPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useMe();
  const { name } = useMaster();
  const [cancel, setCancel] = useState(false);
  const [edit, setEdit] = useState(false);
  const key = ['/shipments', 'detail', id];
  const q = useQuery({ queryKey: key, queryFn: () => get(`/shipments/${id}`) });
  const refresh = () => qc.invalidateQueries();
  const cancelM = useMutation({
    mutationFn: (reason) => post(`/shipments/${id}/cancel`, { reason }),
    onSuccess: () => {
      refresh();
      setCancel(false);
      toast.success('Shipment cancelled, invoice voided, stock restored');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const deliver = useMutation({
    mutationFn: () => patch(`/shipments/${id}`, { status: 'delivered' }),
    onSuccess: () => (refresh(), toast.success('Marked as delivered')),
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (q.isLoading) return <Skeleton className="h-64 w-full" />;
  const s = q.data;
  const pdf = (k) => openBlob(`/pdf/${k}/${id}`).catch((e) => toast.error(errorMessage(e)));

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'Shipments', to: '/shipments' }, { label: s.shipment_no }]}
        title={<span className="mono">{s.shipment_no}</span>}
        badge={<StatusBadge status={s.status} />}
        subtitle={s.customer?.legal_name}
        actions={
          <>
            <Menu trigger={<Button icon={Printer}>Print <ChevronDown className="size-3.5" /></Button>} items={[{ label: 'Delivery note', onClick: () => pdf('delivery_note') }, { label: 'Packing slip', onClick: () => pdf('packing_slip') }]} />
            {s.status !== 'cancelled' && can('shipment.update') && (
              <>
                <Button icon={Pencil} onClick={() => setEdit(true)}>Edit</Button>
                <Button icon={Ban} onClick={() => setCancel(true)}>Cancel</Button>
                {s.status === 'posted' && <Button variant="primary" icon={PackageCheck} loading={deliver.isPending} onClick={() => deliver.mutate()}>Mark delivered</Button>}
              </>
            )}
          </>
        }
      />
      <Card className="p-4 mb-4">
        <DetailList cols={3} items={[
          { label: 'Sales order', value: <Link to={`/sales-orders/${s.sales_order?.id}?tab=fulfilment`} className="mono hover:text-link">{s.sales_order?.so_no}</Link> },
          { label: 'Shipped', value: fmtDate(s.shipment_date) },
          { label: 'Carrier', value: s.carrier },
          { label: 'Tracking no.', value: s.tracking_no && <span className="mono">{s.tracking_no}</span> },
          { label: 'Incoterm', value: name('incoterms', s.incoterm_id) },
          { label: 'Invoice', value: s.invoice && <Link to={`/invoices/${s.invoice.id}`} className="flex items-center gap-1.5 hover:text-link"><span className="mono">{s.invoice.invoice_no}</span><StatusBadge status={s.invoice.status} /><span className="text-xs text-muted">{fmtMoney(s.invoice.grand_total)}</span></Link> },
          { label: 'Ship to', value: s.ship_to && [s.ship_to.street1, [s.ship_to.postal_code, s.ship_to.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') },
          { label: 'Notes', value: s.notes },
        ]} />
      </Card>
      <Card className="mb-4">
        <CardHeader title="Contents" />
        <div className="border-t border-line overflow-x-auto">
          <table className="table-base">
            <thead><tr><th>#</th><th>Part</th><th>Lot</th><th>DC</th><th>COO</th><th className="text-right">Qty</th></tr></thead>
            <tbody>
              {s.lines.map((l) => (
                <tr key={l.id} className={l.is_deleted ? 'text-muted line-through' : ''}>
                  <td className="text-faint">{l.line_no}</td>
                  <td><p className="mono font-semibold">{l.part_number}</p><p className="text-xs text-muted">{name('manufacturers', l.manufacturer_id)}</p></td>
                  <td><Link to={`/stock/${l.stock_id}`} className="mono text-xs hover:text-link">{l.stock_no}</Link></td>
                  <td>{l.date_code || ''}</td>
                  <td>{name('countries', l.coo_country_id) || ''}</td>
                  <td className="text-right tabular-nums font-medium">{fmtQty(l.quantity_shipped)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <HistoryPanel events={s.events} createdAt={s.created_at} />
        <AttachmentsPanel table="shipment" id={s.id} />
      </div>
      {edit && <EditShipment s={s} onClose={() => setEdit(false)} onDone={refresh} />}
      <ConfirmDialog open={cancel} onClose={() => setCancel(false)} danger reason title={`Cancel ${s.shipment_no}?`} message="Its invoice is voided and the parts go back on hand (still allocated to the order)." confirmLabel="Cancel shipment" loading={cancelM.isPending} onConfirm={(reason) => cancelM.mutate(reason)} />
    </div>
  );
}

function EditShipment({ s, onClose, onDone }) {
  const toast = useToast();
  const [f, setF] = useState({ carrier: s.carrier ?? '', tracking_no: s.tracking_no ?? '', notes: s.notes ?? '' });
  const m = useMutation({
    mutationFn: () => patch(`/shipments/${s.id}`, f),
    onSuccess: () => (onDone(), toast.success('Saved'), onClose()),
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Modal open onClose={onClose} size="sm" title="Edit shipment" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={m.isPending} onClick={() => m.mutate()}>Save</Button></>}>
      <div className="space-y-3">
        <Field label="Carrier">{(id) => <Input id={id} value={f.carrier} onChange={(e) => setF({ ...f, carrier: e.target.value })} />}</Field>
        <Field label="Tracking number">{(id) => <Input id={id} value={f.tracking_no} onChange={(e) => setF({ ...f, tracking_no: e.target.value })} />}</Field>
        <Field label="Notes">{(id) => <Textarea id={id} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />}</Field>
      </div>
    </Modal>
  );
}
