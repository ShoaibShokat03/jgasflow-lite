import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link2, Truck, Receipt, Unlink, MapPin, Copy, Plus, Search, Wand2, CheckCircle2, Circle } from 'lucide-react';
import { errorMessage, get, post } from '@/lib/api';
import { fmtDate, fmtDateTime, fmtQty, humanize, today } from '@/lib/format';
import { useMaster, useMe } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { Button, Card, CardHeader, EmptyState, Field, Input, Select, Spinner, Textarea } from '@/components/ui/core';
import { ConfirmDialog, Modal, useToast } from '@/components/ui/overlay';
import { Progress, StatusBadge } from '@/components/ui/status';
import { MasterSelect } from '@/components/ui/pickers';
import { addressLine, usePartner } from '@/features/documents/TermsPanel';

const MILESTONES = ['order_created', 'order_confirmed', 'advance_payment', 'shipped', 'shipping_details_sent', 'arrived', 'final_payment', 'order_completed'];

export default function FulfilmentPanel({ doc, onChange }) {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const { can } = useMe();
  const { name } = useMaster();
  const key = ['fulfilment', doc.id];
  const q = useQuery({ queryKey: key, queryFn: () => get(`/sales-orders/${doc.id}/fulfilment`) });
  const [allocLine, setAllocLine] = useState(null);
  const [shipOpen, setShipOpen] = useState(false);
  const [release, setRelease] = useState(null);
  const [trackOpen, setTrackOpen] = useState(false);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: key });
    onChange();
  };

  const releaseM = useMutation({
    mutationFn: ({ al, reason }) => post(`/allocations/${al.allocation_id}/lines/${al.id}/cancel`, { reason }),
    onSuccess: () => {
      refresh();
      setRelease(null);
      toast.success('Allocation released, stock is free again');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (q.isLoading) return <div className="py-16 grid place-items-center"><Spinner /></div>;
  const f = q.data;
  if (!f) {
    return (
      <Card className="p-8 text-center text-sm text-muted">
        Fulfilment details could not be loaded. {errorMessage(q.error)}
        <div className="mt-3"><Button variant="secondary" size="sm" onClick={() => q.refetch()}>Try again</Button></div>
      </Card>
    );
  }
  const activeAlloc = f.allocation_lines.filter((a) => a.status === 'active');
  const shippable = activeAlloc.filter((a) => Number(a.quantity_allocated) - Number(a.shipped_qty) > 0);
  const closed = ['cancelled', 'delivered'].includes(doc.status);
  const trackingUrl = `${location.origin}/track/${f.sales_order.tracking_token}`;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          icon={Link2}
          title="Order lines"
          actions={
            can('shipment.create') && !closed && (
              <Button variant="primary" size="sm" icon={Truck} disabled={!shippable.length} onClick={() => setShipOpen(true)}>
                Ship &amp; invoice
              </Button>
            )
          }
        />
        <div className="overflow-x-auto border-t border-line">
          <table className="table-base">
            <thead>
              <tr>
                <th>#</th><th>Part</th><th className="text-right">Ordered</th><th className="w-44">Allocated</th><th className="w-44">Shipped</th><th />
              </tr>
            </thead>
            <tbody>
              {f.lines.map((l) => {
                const outstanding = Math.max(0, Number(l.quantity_required) - Number(l.allocated_qty));
                return (
                  <tr key={l.id}>
                    <td className="text-faint">{l.line_no}</td>
                    <td>
                      <p className="mono font-semibold">{l.part_number}</p>
                      <p className="text-xs text-muted">{name('manufacturers', l.manufacturer_id)}</p>
                    </td>
                    <td className="text-right tabular-nums font-medium">{fmtQty(l.quantity_required)}</td>
                    <td>
                      <div className="flex items-center gap-2"><Progress value={Number(l.allocated_qty)} max={Number(l.quantity_required)} /><span className="text-xs tabular-nums text-muted w-14 text-right">{fmtQty(l.allocated_qty)}</span></div>
                    </td>
                    <td>
                      <div className="flex items-center gap-2"><Progress value={Number(l.shipped_qty)} max={Number(l.quantity_required)} tone="green" /><span className="text-xs tabular-nums text-muted w-14 text-right">{fmtQty(l.shipped_qty)}</span></div>
                    </td>
                    <td className="text-right">
                      {can('alloc.manage') && !closed && outstanding > 0 && (
                        <Button size="sm" icon={Plus} onClick={() => setAllocLine(l)}>Allocate {fmtQty(outstanding)}</Button>
                      )}
                      {outstanding === 0 && <span className="inline-flex items-center gap-1 text-xs text-success"><CheckCircle2 className="size-3.5" />Allocated</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {f.allocation_lines.length > 0 && (
        <Card>
          <CardHeader title="Allocations" />
          <div className="overflow-x-auto border-t border-line">
            <table className="table-base">
              <thead>
                <tr><th>Allocation</th><th>Lot</th><th>Part</th><th>DC</th><th>Location</th><th className="text-right">Allocated</th><th className="text-right">Shipped</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {f.allocation_lines.map((a) => (
                  <tr key={a.id}>
                    <td className="mono text-xs">{a.allocation_no}</td>
                    <td><Link to={`/stock/${a.stock_id}`} className="mono text-brand-700 dark:text-brand-300 hover:underline">{a.stock_no}</Link></td>
                    <td className="mono">{a.stock_part_number}</td>
                    <td>{a.date_code || ''}</td>
                    <td className="text-xs text-muted">{[name('warehouses', a.warehouse_id), a.bin_location].filter(Boolean).join(' · ') || ''}</td>
                    <td className="text-right tabular-nums">{fmtQty(a.quantity_allocated)}</td>
                    <td className="text-right tabular-nums">{fmtQty(a.shipped_qty)}</td>
                    <td><StatusBadge status={a.status} /></td>
                    <td className="text-right">
                      {a.status === 'active' && Number(a.shipped_qty) === 0 && can('alloc.manage') && (
                        <Button variant="ghost" size="sm" icon={Unlink} onClick={() => setRelease(a)}>Release</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader icon={Truck} title="Shipments & invoices" />
          {f.shipments.length === 0 ? (
            <EmptyState icon={Truck} title="Nothing shipped yet">Allocate stock, then use Ship &amp; invoice.</EmptyState>
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {f.shipments.map((s) => {
                const inv = f.invoices.find((i) => i.shipment_id === s.id);
                return (
                  <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <Link to={`/shipments/${s.id}`} className="mono font-semibold hover:text-link">{s.shipment_no}</Link>
                      <p className="text-xs text-muted">{fmtDate(s.shipment_date)} · {fmtQty(s.total_qty)} pcs{s.carrier ? ` · ${s.carrier}` : ''}{s.tracking_no ? ` ${s.tracking_no}` : ''}</p>
                    </div>
                    <StatusBadge status={s.status} />
                    {inv && (
                      <Link to={`/invoices/${inv.id}`} className="chip bg-surface-3 hover:bg-brand-50 text-muted hover:text-link">
                        <Receipt className="size-3" /> <span className="mono">{inv.invoice_no}</span> <StatusBadge status={inv.status} className="h-4 px-1.5 text-[11px]" />
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            icon={MapPin}
            title="Customer tracking"
            actions={
              <>
                <Button size="sm" variant="ghost" icon={Copy} onClick={() => navigator.clipboard.writeText(trackingUrl).then(() => toast.success('Tracking link copied'))}>Copy link</Button>
                {can('so.update') && <Button size="sm" icon={Plus} onClick={() => setTrackOpen(true)}>Milestone</Button>}
              </>
            }
          />
          <ol className="px-5 pb-4 grid gap-2">
            {MILESTONES.map((m) => {
              const ev = f.tracking.filter((t) => t.milestone === m).at(-1);
              return (
                <li key={m} className="flex items-center gap-2.5 text-[13px]">
                  {ev ? <CheckCircle2 className="size-4 text-success" /> : <Circle className="size-4 text-faint" />}
                  <span className={cn(!ev && 'text-faint')}>{humanize(m)}</span>
                  {ev && <span className="text-xs text-faint ml-auto">{fmtDateTime(ev.created_at)}</span>}
                </li>
              );
            })}
          </ol>
        </Card>
      </div>

      {allocLine && <AllocateDialog so={doc} line={allocLine} onClose={() => setAllocLine(null)} onDone={refresh} />}
      {shipOpen && <ShipDialog so={doc} lines={shippable} onClose={() => setShipOpen(false)} onDone={(r) => { refresh(); navigate(`/invoices/${r.invoice_id}`); }} />}
      {trackOpen && <TrackingDialog so={doc} onClose={() => setTrackOpen(false)} onDone={refresh} />}
      <ConfirmDialog open={!!release} onClose={() => setRelease(null)} reason danger title={`Release ${fmtQty(release?.quantity_allocated)} × ${release?.stock_part_number}?`} message={`Lot ${release?.stock_no} becomes available for other orders.`} confirmLabel="Release" loading={releaseM.isPending} onConfirm={(reason) => releaseM.mutate({ al: release, reason })} />
    </div>
  );
}

function AllocateDialog({ so, line, onClose, onDone }) {
  const toast = useToast();
  const { name } = useMaster();
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [qty, setQty] = useState({});
  const q = useQuery({ queryKey: ['candidates', line.id, term], queryFn: () => get(`/sales-order-lines/${line.id}/stock-candidates`, term ? { search: term } : {}) });
  const outstanding = q.data?.line.outstanding ?? 0;
  const total = Object.values(qty).reduce((a, b) => a + (Number(b) || 0), 0);

  // FIFO fill: oldest lots first, up to what the line still needs.
  const autoFill = () => {
    let need = outstanding;
    const next = {};
    for (const c of q.data?.candidates ?? []) {
      if (need <= 0) break;
      const take = Math.min(need, c.available_qty);
      next[c.id] = take;
      need -= take;
    }
    setQty(next);
  };

  const m = useMutation({
    mutationFn: () => post(`/sales-orders/${so.id}/allocate`, { rows: Object.entries(qty).filter(([, v]) => Number(v) > 0).map(([stock_id, v]) => ({ so_line_id: line.id, stock_id: Number(stock_id), qty: Number(v) })) }),
    onSuccess: (r) => {
      toast.success(`${r.allocation_no} created`);
      onDone();
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      icon={Link2}
      title={`Allocate ${line.part_number}`}
      subtitle={`Line ${line.line_no} · ${fmtQty(outstanding)} still to allocate`}
      footer={
        <>
          <span className={cn('mr-auto text-sm', total > outstanding ? 'text-danger' : 'text-muted')}>Selected <b className="tabular-nums">{fmtQty(total)}</b> of {fmtQty(outstanding)}</span>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={m.isPending} disabled={!total || total > outstanding} onClick={() => m.mutate()}>Allocate</Button>
        </>
      }
    >
      <form className="flex gap-2 mb-3" onSubmit={(e) => (e.preventDefault(), setTerm(search))}>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-faint" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search a substitute part number…" className="pl-9" />
        </div>
        <Button type="submit">Search</Button>
        <Button icon={Wand2} onClick={autoFill} disabled={!q.data?.candidates?.length}>Auto-fill (FIFO)</Button>
      </form>
      {q.isLoading ? (
        <div className="py-10 grid place-items-center"><Spinner /></div>
      ) : !q.data.candidates.length ? (
        <EmptyState title="No available stock for this part">Receive a purchase order or search for a substitute part number.</EmptyState>
      ) : (
        <div className="overflow-x-auto -mx-5">
          <table className="table-base">
            <thead><tr><th>Lot</th><th>Part</th><th>DC</th><th>Location</th><th>Received</th><th className="text-right">Available</th><th className="w-32 text-right">Allocate</th></tr></thead>
            <tbody>
              {q.data.candidates.map((c) => (
                <tr key={c.id}>
                  <td className="mono text-xs">{c.stock_no}</td>
                  <td><span className="mono">{c.part_number}</span>{!c.exact && <span className="chip ml-1.5 bg-amber-50 text-warning dark:bg-amber-500/15">substitute</span>}</td>
                  <td>{c.date_code || ''}</td>
                  <td className="text-xs text-muted">{[name('warehouses', c.warehouse_id), c.bin_location].filter(Boolean).join(' · ') || ''}</td>
                  <td className="text-xs">{fmtDate(c.received_at)}</td>
                  <td className="text-right tabular-nums font-medium">{fmtQty(c.available_qty)}</td>
                  <td><Input type="number" min="0" max={c.available_qty} step="any" value={qty[c.id] ?? ''} onChange={(e) => setQty({ ...qty, [c.id]: e.target.value })} className="h-8 text-right" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

function ShipDialog({ so, lines, onClose, onDone }) {
  const toast = useToast();
  const partner = usePartner(so.partner?.id);
  const [rows, setRows] = useState(() => Object.fromEntries(lines.map((l) => [l.id, Number(l.quantity_allocated) - Number(l.shipped_qty)])));
  const [h, setH] = useState({ shipment_date: today(), carrier: '', tracking_no: '', ship_to_address_id: so.payment?.shipping_address_id ?? '', incoterm_id: so.payment?.incoterm_id ?? null, notes: '' });
  const total = useMemo(() => Object.values(rows).reduce((a, b) => a + (Number(b) || 0), 0), [rows]);

  const m = useMutation({
    mutationFn: () =>
      post(`/sales-orders/${so.id}/ship`, {
        ...Object.fromEntries(Object.entries(h).filter(([, v]) => v !== '' && v !== null)),
        ship_to_address_id: h.ship_to_address_id ? Number(h.ship_to_address_id) : undefined,
        rows: Object.entries(rows).filter(([, v]) => Number(v) > 0).map(([id, v]) => ({ allocation_line_id: Number(id), qty: Number(v) })),
      }),
    onSuccess: (r) => {
      toast.success(`${r.shipment_no} shipped · draft ${r.invoice_no} created`);
      onDone(r);
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      icon={Truck}
      title="Ship & invoice"
      footer={
        <>
          <span className="mr-auto text-sm text-muted">Shipping <b className="tabular-nums">{fmtQty(total)}</b> pcs</span>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={m.isPending} disabled={!total} onClick={() => m.mutate()}>Ship &amp; create invoice</Button>
        </>
      }
    >
      <div className="grid sm:grid-cols-3 gap-3 mb-4">
        <Field label="Ship date">{(id) => <Input id={id} type="date" value={h.shipment_date} onChange={(e) => setH({ ...h, shipment_date: e.target.value })} />}</Field>
        <Field label="Carrier">{(id) => <Input id={id} value={h.carrier} onChange={(e) => setH({ ...h, carrier: e.target.value })} placeholder="DHL, UPS, FedEx…" />}</Field>
        <Field label="Tracking number">{(id) => <Input id={id} value={h.tracking_no} onChange={(e) => setH({ ...h, tracking_no: e.target.value })} />}</Field>
        <Field label="Ship to" span={2}>
          {(id) => (
            <Select id={id} value={h.ship_to_address_id} onChange={(e) => setH({ ...h, ship_to_address_id: e.target.value })} placeholder="None">
              {(partner.data?.addresses ?? []).filter((a) => a.address_type !== 'billing').map((a) => <option key={a.id} value={a.id}>{addressLine(a)}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Incoterm">{(id) => <MasterSelect id={id} list="incoterms" value={h.incoterm_id} onChange={(v) => setH({ ...h, incoterm_id: v })} />}</Field>
      </div>
      <div className="overflow-x-auto -mx-5 border-y border-line">
        <table className="table-base">
          <thead><tr><th>Lot</th><th>Part</th><th className="text-right">Left to ship</th><th className="w-32 text-right">Ship now</th></tr></thead>
          <tbody>
            {lines.map((l) => {
              const left = Number(l.quantity_allocated) - Number(l.shipped_qty);
              return (
                <tr key={l.id}>
                  <td className="mono text-xs">{l.stock_no}</td>
                  <td className="mono">{l.stock_part_number}</td>
                  <td className="text-right tabular-nums">{fmtQty(left)}</td>
                  <td><Input type="number" min="0" max={left} step="any" value={rows[l.id] ?? ''} onChange={(e) => setRows({ ...rows, [l.id]: e.target.value })} className="h-8 text-right" /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Field label="Notes" className="mt-3">{(id) => <Textarea id={id} rows={2} value={h.notes} onChange={(e) => setH({ ...h, notes: e.target.value })} />}</Field>
    </Modal>
  );
}

function TrackingDialog({ so, onClose, onDone }) {
  const toast = useToast();
  const [f, setF] = useState({ milestone: 'order_confirmed', note: '' });
  const m = useMutation({
    mutationFn: () => post(`/sales-orders/${so.id}/tracking`, { milestone: f.milestone, note: f.note || undefined }),
    onSuccess: () => {
      toast.success('Milestone added');
      onDone();
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Modal open onClose={onClose} size="sm" icon={MapPin} title="Add tracking milestone" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={m.isPending} onClick={() => m.mutate()}>Add</Button></>}>
      <div className="space-y-3">
        <Field label="Milestone">
          {(id) => (
            <Select id={id} value={f.milestone} onChange={(e) => setF({ ...f, milestone: e.target.value })}>
              {MILESTONES.map((x) => <option key={x} value={x}>{humanize(x)}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Note" hint="Visible to the customer on the tracking page.">{(id) => <Textarea id={id} rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />}</Field>
      </div>
    </Modal>
  );
}

