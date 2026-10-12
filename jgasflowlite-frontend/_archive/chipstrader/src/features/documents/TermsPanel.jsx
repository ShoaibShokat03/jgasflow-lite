import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { errorMessage, get, put } from '@/lib/api';
import { fmtMoney } from '@/lib/format';
import { Button, Card, CardHeader, Field, Input, Select, Textarea } from '@/components/ui/core';
import { useToast } from '@/components/ui/overlay';
import { MasterSelect } from '@/components/ui/pickers';
import { DOCS } from './doc-types';

const FIELDS = ['payment_term_id', 'incoterm_id', 'billing_address_id', 'shipping_address_id', 'shipping_method', 'expected_shipping_cost', 'expected_handling_cost', 'expected_misc_cost', 'tax_id', 'tax_handling_id', 'notes'];

export const addressLine = (a) => [a.label, a.street1, [a.postal_code, a.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');

/** The partner's addresses and contacts, for pickers on documents. */
export function usePartner(partnerId) {
  return useQuery({ queryKey: ['company', partnerId], queryFn: () => get(`/companies/${partnerId}`), enabled: !!partnerId, staleTime: 60_000, retry: false });
}

export default function TermsPanel({ kind, doc, onChange }) {
  const cfg = DOCS[kind];
  const toast = useToast();
  const partner = usePartner(doc.partner?.id);
  const init = () => Object.fromEntries(FIELDS.map((k) => [k, doc.payment?.[k] ?? '']));
  const [f, setF] = useState(init);
  useEffect(() => setF(init()), [doc.payment]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v?.target ? v.target.value : v ?? '' }));
  const editable = doc.can.update;
  const dirty = FIELDS.some((k) => String(f[k] ?? '') !== String(doc.payment?.[k] ?? ''));

  const save = useMutation({
    mutationFn: () => put(`${cfg.api}/${doc.id}/payment`, Object.fromEntries(FIELDS.map((k) => [k, f[k] === '' ? null : ['expected_shipping_cost', 'expected_handling_cost', 'expected_misc_cost'].includes(k) ? Number(f[k]) : f[k]]))),
    onSuccess: () => {
      onChange();
      toast.success('Terms saved, totals updated');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const addresses = partner.data?.addresses ?? [];
  const t = doc.totals;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <Card>
        <CardHeader title="Commercial terms" actions={editable && <Button variant="primary" size="sm" icon={Save} disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}>Save terms</Button>} />
        <fieldset disabled={!editable} className="grid sm:grid-cols-2 gap-3.5 px-4 pb-4">
          <Field label="Payment terms">{(id) => <MasterSelect id={id} list="payment-terms" value={f.payment_term_id} onChange={set('payment_term_id')} />}</Field>
          <Field label="Incoterm">{(id) => <MasterSelect id={id} list="incoterms" value={f.incoterm_id} onChange={set('incoterm_id')} />}</Field>
          <Field label="Billing address">
            {(id) => (
              <Select id={id} value={f.billing_address_id} onChange={set('billing_address_id')} placeholder="None">
                {addresses.filter((a) => a.address_type !== 'shipping').map((a) => <option key={a.id} value={a.id}>{addressLine(a)}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Shipping address">
            {(id) => (
              <Select id={id} value={f.shipping_address_id} onChange={set('shipping_address_id')} placeholder="None">
                {addresses.filter((a) => a.address_type !== 'billing').map((a) => <option key={a.id} value={a.id}>{addressLine(a)}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Shipping method">{(id) => <Input id={id} value={f.shipping_method} onChange={set('shipping_method')} placeholder="e.g. DHL Express" />}</Field>
          <div />
          <Field label="Shipping cost">{(id) => <Input id={id} type="number" min="0" step="any" value={f.expected_shipping_cost} onChange={set('expected_shipping_cost')} />}</Field>
          <Field label="Handling cost">{(id) => <Input id={id} type="number" min="0" step="any" value={f.expected_handling_cost} onChange={set('expected_handling_cost')} />}</Field>
          <Field label="Other cost">{(id) => <Input id={id} type="number" min="0" step="any" value={f.expected_misc_cost} onChange={set('expected_misc_cost')} />}</Field>
          <div />
          <Field label="Tax rate">{(id) => <MasterSelect id={id} list="taxes" value={f.tax_id} onChange={set('tax_id')} />}</Field>
          <Field label="Tax handling" hint="Exclusive adds tax; Reverse / Export charge none.">{(id) => <MasterSelect id={id} list="tax-handling" value={f.tax_handling_id} onChange={set('tax_handling_id')} />}</Field>
          <Field label="Notes on terms" span={2}>{(id) => <Textarea id={id} rows={2} value={f.notes} onChange={set('notes')} />}</Field>
        </fieldset>
      </Card>

      <Card className="p-4 h-fit">
        <h3 className="font-semibold text-[14px] mb-3">Totals ({t.currency})</h3>
        <dl className="space-y-2 text-[13.5px]">
          {[
            ['Subtotal', t.subtotal],
            ['Shipping', t.shipping],
            ['Handling', t.handling],
            ['Other', t.misc],
            ['Before tax', t.pre_tax],
            [`Tax${t.tax_rate !== null ? ` ${t.tax_rate}%` : ''}${t.tax_handling_code === 'INCLUSIVE' ? ' (included)' : ''}`, t.tax_amount],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between">
              <dt className="text-muted">{k}</dt>
              <dd className="tabular-nums">{fmtMoney(v)}</dd>
            </div>
          ))}
          <div className="flex justify-between pt-2 border-t border-line text-[16px] font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums">{fmtMoney(t.grand_total, t.currency)}</dd>
          </div>
        </dl>
        {t.tax_handling_code && <p className="text-xs text-muted mt-3">Tax handling: {t.tax_handling_code.replace('_', ' ').toLowerCase()}</p>}
        {t.notes.map((n) => <p key={n} className="text-xs text-warning mt-1.5">{n}</p>)}
      </Card>
    </div>
  );
}
