import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, History, Link2, Truck } from 'lucide-react';
import { errorMessage, get, patch } from '@/lib/api';
import { fmtDate, fmtDateTime, fmtPrice, fmtQty, humanize } from '@/lib/format';
import { useMaster, useMe } from '@/lib/hooks';
import { Button, Card, CardHeader, DetailList, EmptyState, Field, Input, PageHeader, Select, Skeleton, Textarea } from '@/components/ui/core';
import { Modal, useToast } from '@/components/ui/overlay';
import { StatusBadge } from '@/components/ui/status';
import { MasterSelect } from '@/components/ui/pickers';
import { AttachmentsPanel } from '@/features/shared/AttachmentsPanel';

export default function StockDetailPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const { can } = useMe();
  const { name } = useMaster();
  const [edit, setEdit] = useState(false);
  const key = ['stock', 'detail', id];
  const q = useQuery({ queryKey: key, queryFn: () => get(`/stock/${id}`) });
  if (q.isLoading) return <Skeleton className="h-64 w-full" />;
  if (q.isError) return <Card className="p-8 text-center text-muted">{errorMessage(q.error)}</Card>;
  const s = q.data;
  const pct = Number(s.original_quantity) > 0 ? (Number(s.quantity_on_hand) / Number(s.original_quantity)) * 100 : 0;

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'Stock', to: '/stock' }, { label: s.stock_no }]}
        title={<span className="mono">{s.part_number}</span>}
        badge={<StatusBadge status={s.status} />}
        subtitle={`Lot ${s.stock_no} · ${name('manufacturers', s.manufacturer_id) || 'manufacturer unknown'}`}
        actions={can('stock.adjust') && s.status !== 'cancelled' && <Button icon={Pencil} onClick={() => setEdit(true)}>Edit lot</Button>}
      />
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-4">
        {[
          ['Received', s.original_quantity],
          ['On hand', s.quantity_on_hand],
          ['Allocated', s.quantity_allocated],
          ['Available', s.available_qty],
        ].map(([k, v], i) => (
          <Card key={k} className="p-4">
            <p className="text-xs text-muted">{k}</p>
            <p className={`text-[24px] font-semibold tabular-nums ${i === 3 ? 'text-success' : ''}`}>{fmtQty(v)}</p>
            {i === 1 && <div className="mt-2 h-1.5 rounded-full bg-surface-3"><div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} /></div>}
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Card className="p-4">
            <DetailList cols={3} items={[
              { label: 'Customer part no.', value: s.customer_part_number },
              { label: 'Date code', value: s.date_code },
              { label: 'Batch / lot', value: s.batch_no },
              { label: 'Package', value: name('packages', s.package_type_id) },
              { label: 'Packaging', value: name('packaging', s.packaging_id) },
              { label: 'Lifecycle', value: name('lifecycle', s.lifecycle_status_id) },
              { label: 'Country of origin', value: name('countries', s.coo_country_id) },
              { label: 'Warehouse', value: name('warehouses', s.warehouse_id) },
              { label: 'Bin', value: s.bin_location },
              { label: 'Unit cost', value: s.unit_cost !== null && `${fmtPrice(s.unit_cost)} ${name('currencies', s.currency_id)}` },
              { label: 'Received', value: fmtDate(s.received_at) },
              { label: 'Supplier', value: s.supplier && <Link to={`/companies/${s.supplier.id}`} className="hover:text-link">{s.supplier.short_name || s.supplier.legal_name}</Link> },
              { label: 'Origin', value: s.origin ? <span><Link to={`/purchase-orders/${s.origin.id}`} className="mono hover:text-link">{s.origin.po_no}</Link>{s.origin.receipt_no && <> · <Link to={`/receipts/${s.origin.receipt_id}`} className="mono hover:text-link">{s.origin.receipt_no}</Link></>}</span> : 'Manual entry' },
            ]} />
            {s.description && <p className="mt-4 pt-3 border-t border-line text-sm text-muted">{s.description}</p>}
          </Card>
          <Card>
            <CardHeader icon={Link2} title="Allocations" />
            {s.allocations.length === 0 ? <EmptyState title="Not allocated to any order" /> : (
              <div className="border-t border-line overflow-x-auto"><table className="table-base"><thead><tr><th>Allocation</th><th>Order</th><th className="text-right">Allocated</th><th className="text-right">Shipped</th><th>Status</th></tr></thead><tbody>
                {s.allocations.map((a) => <tr key={a.id}><td className="mono text-xs">{a.allocation_no}</td><td><Link to={`/sales-orders/${a.so_id}?tab=fulfilment`} className="mono hover:text-link">{a.so_no}</Link></td><td className="text-right tabular-nums">{fmtQty(a.quantity_allocated)}</td><td className="text-right tabular-nums">{fmtQty(a.shipped_qty)}</td><td><StatusBadge status={a.status} /></td></tr>)}
              </tbody></table></div>
            )}
          </Card>
          <Card>
            <CardHeader icon={Truck} title="Shipments" />
            {s.shipments.length === 0 ? <EmptyState title="Nothing shipped from this lot" /> : (
              <ul className="divide-y divide-line border-t border-line">{s.shipments.map((x) => <li key={x.id} className="flex items-center gap-3 px-4 py-2.5"><Link to={`/shipments/${x.id}`} className="mono flex-1 hover:text-link">{x.shipment_no}</Link><span className="text-xs text-muted">{fmtDate(x.shipment_date)}</span><span className="tabular-nums text-[13px]">{fmtQty(x.quantity_shipped)}</span><StatusBadge status={x.status} /></li>)}</ul>
            )}
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader icon={History} title="Audit trail" />
            {s.audit.length === 0 ? <EmptyState title="No changes" /> : (
              <ul className="divide-y divide-line border-t border-line">
                {s.audit.map((a) => (
                  <li key={a.id} className="px-4 py-2.5 text-[13px]">
                    <p><span className="font-medium">{humanize(a.field_name)}</span>{a.old_value !== null && a.field_name !== 'created' && <span className="text-muted"> {a.old_value} → </span>}<span className="font-medium">{a.new_value}</span></p>
                    {a.reason && <p className="text-muted text-xs mt-0.5">{a.reason}</p>}
                    <p className="text-faint text-xs mt-0.5">{a.full_name || a.username} · {fmtDateTime(a.changed_at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <AttachmentsPanel table="stock" id={s.id} />
        </div>
      </div>
      {edit && <EditLot s={s} onClose={() => setEdit(false)} onDone={() => qc.invalidateQueries({ queryKey: ['stock'] })} />}
    </div>
  );
}

function EditLot({ s, onClose, onDone }) {
  const toast = useToast();
  const [f, setF] = useState({ date_code: s.date_code ?? '', batch_no: s.batch_no ?? '', warehouse_id: s.warehouse_id, bin_location: s.bin_location ?? '', status: s.status === 'depleted' ? 'available' : s.status, notes: s.notes ?? '', unit_cost: s.unit_cost ?? '', quantity_on_hand: s.quantity_on_hand, change_reason: '' });
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v?.target ? v.target.value : v }));
  const sensitive = Number(f.unit_cost) !== Number(s.unit_cost ?? '') || Number(f.quantity_on_hand) !== Number(s.quantity_on_hand);
  const m = useMutation({
    mutationFn: () => {
      const body = { date_code: f.date_code || null, batch_no: f.batch_no || null, warehouse_id: f.warehouse_id || null, bin_location: f.bin_location || null, notes: f.notes || null };
      if (f.status !== s.status && s.status !== 'depleted') body.status = f.status;
      if (Number(f.unit_cost) !== Number(s.unit_cost ?? '') && f.unit_cost !== '') body.unit_cost = Number(f.unit_cost);
      if (Number(f.quantity_on_hand) !== Number(s.quantity_on_hand)) body.quantity_on_hand = Number(f.quantity_on_hand);
      if (sensitive) body.change_reason = f.change_reason;
      return patch(`/stock/${s.id}`, body);
    },
    onSuccess: () => {
      onDone();
      toast.success('Lot updated');
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Modal open onClose={onClose} size="lg" icon={Pencil} title={`Edit ${s.stock_no}`} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={m.isPending} disabled={sensitive && f.change_reason.trim().length < 3} onClick={() => m.mutate()}>Save</Button></>}>
      <div className="grid sm:grid-cols-3 gap-3.5">
        <Field label="Date code">{(id) => <Input id={id} value={f.date_code} onChange={set('date_code')} />}</Field>
        <Field label="Batch / lot">{(id) => <Input id={id} value={f.batch_no} onChange={set('batch_no')} />}</Field>
        <Field label="Status">{(id) => <Select id={id} value={f.status} onChange={set('status')}>{['available', 'on_hold', 'quarantine', 'damaged'].map((x) => <option key={x} value={x}>{humanize(x)}</option>)}</Select>}</Field>
        <Field label="Warehouse">{(id) => <MasterSelect id={id} list="warehouses" value={f.warehouse_id} onChange={set('warehouse_id')} />}</Field>
        <Field label="Bin">{(id) => <Input id={id} value={f.bin_location} onChange={set('bin_location')} />}</Field>
        <div />
        <Field label="Unit cost" hint="Audited change">{(id) => <Input id={id} type="number" min="0" step="any" value={f.unit_cost} onChange={set('unit_cost')} />}</Field>
        <Field label="On hand (counted)" hint="Audited change">{(id) => <Input id={id} type="number" min="0" step="any" value={f.quantity_on_hand} onChange={set('quantity_on_hand')} />}</Field>
        <div />
        {sensitive && <Field label="Reason for cost / quantity change" required span="full">{(id) => <Textarea id={id} rows={2} value={f.change_reason} onChange={set('change_reason')} placeholder="e.g. Stock count 2026-10-10 found 12 pcs short" />}</Field>}
        <Field label="Notes" span="full">{(id) => <Textarea id={id} rows={2} value={f.notes} onChange={set('notes')} />}</Field>
      </div>
    </Modal>
  );
}
