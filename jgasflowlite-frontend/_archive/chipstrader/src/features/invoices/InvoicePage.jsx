import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Printer, Send, Wallet, Ban, Pencil, Undo2, Building2, Truck, ShoppingCart, ChevronDown, FileBox } from 'lucide-react';
import { errorMessage, get, openBlob, patch, post } from '@/lib/api';
import { fmtDate, fmtMoney, fmtPrice, fmtQty, humanize, personName, today } from '@/lib/format';
import { useMaster } from '@/lib/hooks';
import { Button, Card, CardHeader, DetailList, EmptyState, Field, Input, PageHeader, Select, Skeleton, Textarea } from '@/components/ui/core';
import { ConfirmDialog, Menu, Modal, useToast } from '@/components/ui/overlay';
import { StatusBadge } from '@/components/ui/status';
import { MasterSelect, UserPicker } from '@/components/ui/pickers';
import { HistoryPanel } from '@/features/shared/HistoryPanel';
import { AttachmentsPanel } from '@/features/shared/AttachmentsPanel';

export default function InvoicePage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const { name } = useMaster();
  const key = ['invoices', 'detail', id];
  const q = useQuery({ queryKey: key, queryFn: () => get(`/invoices/${id}`) });
  const [payOpen, setPayOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ['invoices', 'list'] });
    qc.invalidateQueries({ queryKey: ['invoices', 'summary'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const act = useMutation({
    mutationFn: ({ path, body }) => post(`/invoices/${id}/${path}`, body),
    onSuccess: (_, v) => {
      refresh();
      setConfirm(null);
      toast.success(v.msg);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (q.isLoading) return <div className="space-y-4"><Skeleton className="h-8 w-60" /><Skeleton className="h-72 w-full" /></div>;
  if (q.isError) return <Card className="p-8 text-center text-muted">{errorMessage(q.error)}</Card>;
  const inv = q.data;
  const cur = name('currencies', inv.currency_id);
  const overdue = inv.status === 'issued' && inv.due_date && inv.due_date < today();

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'Invoices', to: '/invoices' }, { label: inv.invoice_no }]}
        title={<span className="mono">{inv.invoice_no}</span>}
        badge={<><StatusBadge status={inv.status} />{overdue && <StatusBadge status="overdue" />}</>}
        subtitle={inv.customer?.legal_name}
        actions={
          <>
            <Menu
              trigger={<Button icon={Printer}>Print <ChevronDown className="size-3.5" /></Button>}
              items={[
                { label: 'Invoice', icon: Printer, onClick: () => openBlob(`/pdf/invoice/${id}`).catch((e) => toast.error(errorMessage(e))) },
                { label: 'Delivery note', icon: FileBox, onClick: () => openBlob(`/pdf/delivery_note/${inv.shipment_id}`).catch((e) => toast.error(errorMessage(e))) },
                { label: 'Packing slip', icon: FileBox, onClick: () => openBlob(`/pdf/packing_slip/${inv.shipment_id}`).catch((e) => toast.error(errorMessage(e))) },
              ]}
            />
            {inv.can.update && <Button icon={Pencil} onClick={() => setEditOpen(true)}>Edit</Button>}
            {inv.can.void && <Button icon={Ban} onClick={() => setConfirm('void')}>Void</Button>}
            {inv.can.issue && <Button variant="primary" icon={Send} loading={act.isPending} onClick={() => act.mutate({ path: 'issue', msg: 'Invoice issued' })}>Issue invoice</Button>}
            {inv.can.pay && <Button variant="primary" icon={Wallet} onClick={() => setPayOpen(true)}>Record payment</Button>}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4 min-w-0">
          <Card className="p-4">
            <div className="grid sm:grid-cols-3 gap-4">
              <Link to={`/companies/${inv.customer?.id}`} className="flex items-start gap-2.5 group">
                <Building2 className="size-4 text-faint mt-0.5" />
                <div><p className="text-[11px] uppercase tracking-wide text-faint font-medium">Bill to</p><p className="font-medium group-hover:text-link">{inv.customer?.legal_name}</p><p className="text-xs text-muted">{[inv.bill_to?.street1, [inv.bill_to?.postal_code, inv.bill_to?.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')}</p>{inv.contact && <p className="text-xs text-muted">{personName(inv.contact)}</p>}</div>
              </Link>
              <Link to={`/sales-orders/${inv.sales_order?.id}`} className="flex items-start gap-2.5 group">
                <ShoppingCart className="size-4 text-faint mt-0.5" />
                <div><p className="text-[11px] uppercase tracking-wide text-faint font-medium">Sales order</p><p className="mono font-medium group-hover:text-link">{inv.sales_order?.so_no}</p>{inv.reference_no && <p className="text-xs text-muted">Customer PO {inv.reference_no}</p>}</div>
              </Link>
              <Link to={`/shipments/${inv.shipment?.id}`} className="flex items-start gap-2.5 group">
                <Truck className="size-4 text-faint mt-0.5" />
                <div><p className="text-[11px] uppercase tracking-wide text-faint font-medium">Shipment</p><p className="mono font-medium group-hover:text-link">{inv.shipment?.shipment_no}</p><p className="text-xs text-muted">{[inv.shipment?.carrier, inv.shipment?.tracking_no].filter(Boolean).join(' ')}</p></div>
              </Link>
            </div>
            <div className="mt-4 pt-4 border-t border-line">
              <DetailList cols={3} items={[
                { label: 'Invoice date', value: fmtDate(inv.invoice_date) },
                { label: 'Due date', value: inv.due_date && <span className={overdue ? 'text-danger font-medium' : ''}>{fmtDate(inv.due_date)}</span> },
                { label: 'Payment terms', value: name('payment-terms', inv.payment_term_id) },
                { label: 'Tax', value: [name('taxes', inv.tax_id), name('tax-handling', inv.tax_handling_id)].filter(Boolean).join(' · ') },
                { label: 'Incoterm', value: name('incoterms', inv.incoterm_id) },
                { label: 'Sales rep', value: inv.owner?.full_name || inv.owner?.username },
              ]} />
            </div>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader title="Lines" subtitle={`Prices in ${cur}`} />
            <div className="overflow-x-auto border-t border-line">
              <table className="table-base">
                <thead><tr><th>#</th><th>Part</th><th>DC</th><th className="text-right">Qty</th><th className="text-right">Unit</th><th className="text-right">Amount</th></tr></thead>
                <tbody>
                  {inv.lines.map((l) => (
                    <tr key={l.id}>
                      <td className="text-faint">{l.line_no}</td>
                      <td><p className="mono font-semibold">{l.part_number}</p>{l.description && <p className="text-xs text-muted line-clamp-1">{l.description}</p>}</td>
                      <td>{l.date_code || ''}</td>
                      <td className="text-right tabular-nums">{fmtQty(l.quantity)}</td>
                      <td className="text-right tabular-nums">{fmtPrice(l.unit_price)}</td>
                      <td className="text-right tabular-nums font-medium">{fmtMoney(l.line_subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <HistoryPanel events={inv.events} createdAt={inv.created_at} />
          <AttachmentsPanel table="invoice" id={inv.id} />
        </div>

        <div className="space-y-4">
          <Card className="p-4">
            <dl className="space-y-2 text-[13.5px]">
              {[
                ['Subtotal', inv.subtotal],
                ...(Number(inv.shipping_cost) ? [['Shipping', inv.shipping_cost]] : []),
                ...(Number(inv.handling_cost) ? [['Handling', inv.handling_cost]] : []),
                ...(Number(inv.misc_cost) ? [['Other', inv.misc_cost]] : []),
                ['Tax', inv.tax_amount],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between"><dt className="text-muted">{k}</dt><dd className="tabular-nums">{fmtMoney(v)}</dd></div>
              ))}
              <div className="flex justify-between pt-2 border-t border-line text-[17px] font-semibold"><dt>Total</dt><dd className="tabular-nums">{fmtMoney(inv.grand_total, cur)}</dd></div>
              <div className="flex justify-between text-success"><dt>Paid</dt><dd className="tabular-nums">{fmtMoney(inv.amount_paid)}</dd></div>
              <div className="flex justify-between font-semibold"><dt>Balance</dt><dd className="tabular-nums">{fmtMoney(inv.balance, cur)}</dd></div>
            </dl>
            {inv.status !== 'void' && Number(inv.grand_total) > 0 && (
              <div className="mt-3 h-2 rounded-full bg-surface-3 overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, (inv.amount_paid / inv.grand_total) * 100)}%` }} />
              </div>
            )}
          </Card>

          <Card>
            <CardHeader icon={Wallet} title="Payments" />
            {inv.payments.length === 0 ? (
              <EmptyState icon={Wallet} title="No payments yet">{inv.status === 'draft' ? 'Issue the invoice first.' : null}</EmptyState>
            ) : (
              <ul className="divide-y divide-line border-t border-line">
                {inv.payments.map((p) => (
                  <li key={p.id} className="px-4 py-2.5 flex items-center gap-3 group">
                    <div className="flex-1">
                      <p className={`text-[13.5px] font-medium tabular-nums ${p.status !== 'active' ? 'line-through text-faint' : ''}`}>{fmtMoney(p.amount, cur)}</p>
                      <p className="text-xs text-muted">{fmtDate(p.paid_at)}{p.method ? ` · ${humanize(p.method)}` : ''}{p.reference ? ` · ${p.reference}` : ''}</p>
                      {p.cancel_reason && <p className="text-xs text-danger">Reversed: {p.cancel_reason}</p>}
                    </div>
                    {p.status === 'active' && inv.can.pay !== undefined && inv.status !== 'void' && (
                      <Button variant="ghost" size="sm" icon={Undo2} className="" onClick={() => setConfirm({ reverse: p })} aria-label="Reverse payment" />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {inv.notes && <Card className="p-4 text-sm text-muted whitespace-pre-line">{inv.notes}</Card>}
        </div>
      </div>

      {payOpen && <PayDialog inv={inv} currency={cur} onClose={() => setPayOpen(false)} onDone={refresh} />}
      {editOpen && <EditDialog inv={inv} onClose={() => setEditOpen(false)} onDone={refresh} />}
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        danger
        reason
        loading={act.isPending}
        title={confirm === 'void' ? `Void ${inv.invoice_no}?` : `Reverse payment of ${fmtMoney(confirm?.reverse?.amount, cur)}?`}
        message={confirm === 'void' ? 'Voiding also cancels the shipment and puts the parts back in stock.' : 'The invoice balance goes back up by this amount.'}
        confirmLabel={confirm === 'void' ? 'Void invoice' : 'Reverse payment'}
        onConfirm={(reason) => (confirm === 'void' ? act.mutate({ path: 'void', body: { reason }, msg: 'Invoice voided, stock restored' }) : act.mutate({ path: `payments/${confirm.reverse.id}/reverse`, body: { reason }, msg: 'Payment reversed' }))}
      />
    </div>
  );
}

function PayDialog({ inv, currency, onClose, onDone }) {
  const toast = useToast();
  const [f, setF] = useState({ amount: inv.balance, paid_at: today(), method: 'bank_transfer', reference: '', notes: '' });
  const m = useMutation({
    mutationFn: () => post(`/invoices/${inv.id}/pay`, { ...f, amount: Number(f.amount), reference: f.reference || undefined, notes: f.notes || undefined }),
    onSuccess: (r) => {
      onDone();
      toast.success(r.status === 'paid' ? 'Paid in full' : 'Payment recorded');
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Modal open onClose={onClose} size="sm" icon={Wallet} title="Record payment" subtitle={`Open balance ${fmtMoney(inv.balance, currency)}`} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={m.isPending} disabled={!(Number(f.amount) > 0)} onClick={() => m.mutate()}>Record payment</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Amount (${currency})`} span={2}>{(id) => <Input id={id} autoFocus type="number" min="0" step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} className="text-lg h-11 font-semibold" />}</Field>
        <Field label="Date">{(id) => <Input id={id} type="date" value={f.paid_at} onChange={(e) => setF({ ...f, paid_at: e.target.value })} />}</Field>
        <Field label="Method">{(id) => <Select id={id} value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>{['bank_transfer', 'card', 'cash', 'cheque', 'paypal', 'offset', 'other'].map((x) => <option key={x} value={x}>{humanize(x)}</option>)}</Select>}</Field>
        <Field label="Reference" span={2}>{(id) => <Input id={id} value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} placeholder="Bank reference / transaction id" />}</Field>
        <Field label="Note" span={2}>{(id) => <Input id={id} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />}</Field>
      </div>
    </Modal>
  );
}

function EditDialog({ inv, onClose, onDone }) {
  const toast = useToast();
  const keys = ['reference_no', 'invoice_date', 'due_date', 'shipping_cost', 'handling_cost', 'misc_cost', 'payment_term_id', 'tax_id', 'tax_handling_id', 'assigned_sales_user_id', 'notes'];
  const [f, setF] = useState(() => Object.fromEntries(keys.map((k) => [k, inv[k] ?? ''])));
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v?.target ? v.target.value : v }));
  const m = useMutation({
    mutationFn: () => patch(`/invoices/${inv.id}`, Object.fromEntries(keys.map((k) => [k, f[k] === '' ? null : ['shipping_cost', 'handling_cost', 'misc_cost'].includes(k) ? Number(f[k]) : f[k]]))),
    onSuccess: () => {
      onDone();
      toast.success('Invoice updated, totals recalculated');
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Modal open onClose={onClose} size="lg" icon={Pencil} title={`Edit draft ${inv.invoice_no}`} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={m.isPending} onClick={() => m.mutate()}>Save</Button></>}>
      <div className="grid sm:grid-cols-3 gap-3.5">
        <Field label="Customer reference">{(id) => <Input id={id} value={f.reference_no} onChange={set('reference_no')} />}</Field>
        <Field label="Invoice date">{(id) => <Input id={id} type="date" value={f.invoice_date} onChange={set('invoice_date')} />}</Field>
        <Field label="Due date">{(id) => <Input id={id} type="date" value={f.due_date} onChange={set('due_date')} />}</Field>
        <Field label="Shipping">{(id) => <Input id={id} type="number" min="0" step="0.01" value={f.shipping_cost} onChange={set('shipping_cost')} />}</Field>
        <Field label="Handling">{(id) => <Input id={id} type="number" min="0" step="0.01" value={f.handling_cost} onChange={set('handling_cost')} />}</Field>
        <Field label="Other">{(id) => <Input id={id} type="number" min="0" step="0.01" value={f.misc_cost} onChange={set('misc_cost')} />}</Field>
        <Field label="Payment terms">{(id) => <MasterSelect id={id} list="payment-terms" value={f.payment_term_id} onChange={set('payment_term_id')} />}</Field>
        <Field label="Tax rate">{(id) => <MasterSelect id={id} list="taxes" value={f.tax_id} onChange={set('tax_id')} />}</Field>
        <Field label="Tax handling">{(id) => <MasterSelect id={id} list="tax-handling" value={f.tax_handling_id} onChange={set('tax_handling_id')} />}</Field>
        <Field label="Sales rep" hint="Credited for the sale.">{(id) => <UserPicker id={id} value={f.assigned_sales_user_id} onChange={set('assigned_sales_user_id')} />}</Field>
        <Field label="Notes (printed)" span="full">{(id) => <Textarea id={id} value={f.notes} onChange={set('notes')} />}</Field>
      </div>
    </Modal>
  );
}
