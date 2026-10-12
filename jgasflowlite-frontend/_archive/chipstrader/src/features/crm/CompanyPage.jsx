import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Mail, Phone, Globe, Plus, Pencil, Trash2, Star, MapPin, Users, FileText, Paperclip, Save, UserRound, ShoppingBag, Factory } from 'lucide-react';
import { errorMessage, get, patch, post, put } from '@/lib/api';
import { fmtDate, fmtMoney, personName } from '@/lib/format';
import { useMaster, useMe } from '@/lib/hooks';
import { nullify } from '@/lib/utils';
import { Button, Card, CardHeader, Checkbox, DetailList, EmptyState, Field, Input, PageHeader, Select, Skeleton, Tabs, Textarea } from '@/components/ui/core';
import { ConfirmDialog, Modal, useToast } from '@/components/ui/overlay';
import { Badge, StatusBadge } from '@/components/ui/status';
import { MasterPicker, MasterSelect, UserPicker } from '@/components/ui/pickers';
import { AttachmentsPanel } from '@/features/shared/AttachmentsPanel';
import { DOCS, docPath } from '@/features/documents/doc-types';

export default function CompanyPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const { name } = useMaster();
  const { can } = useMe();
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') || 'overview';
  const key = ['company', Number(id)];
  const q = useQuery({ queryKey: key, queryFn: () => get(`/companies/${id}`) });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ['companies'] });
  };
  const c = q.data;
  const canEdit = can('company.update', 'customer.update', 'supplier.update');

  if (q.isLoading) return <div className="space-y-4"><Skeleton className="h-8 w-72" /><Skeleton className="h-40 w-full" /></div>;
  if (q.isError) return <Card className="p-8 text-center text-muted">{errorMessage(q.error)}</Card>;

  const tabs = [
    { value: 'overview', label: 'Overview', icon: Building2 },
    c.is_customer && { value: 'customer', label: 'Customer terms', icon: ShoppingBag },
    c.is_supplier && { value: 'supplier', label: 'Supplier terms', icon: Factory },
    { value: 'addresses', label: 'Addresses', icon: MapPin, count: c.addresses.length },
    { value: 'contacts', label: 'Contacts', icon: Users, count: c.contacts.length },
    { value: 'documents', label: 'Documents', icon: FileText },
    { value: 'files', label: 'Files', icon: Paperclip },
  ].filter(Boolean);

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'Customers & suppliers', to: '/companies' }, { label: c.short_name || c.legal_name }]}
        title={c.legal_name}
        badge={<div className="flex gap-1">{!!c.is_customer && <Badge tone="brand">Customer</Badge>}{!!c.is_supplier && <Badge tone="cyan">Supplier</Badge>}{!c.is_active && <StatusBadge status="inactive" />}</div>}
        subtitle={[c.legal_form, name('countries', c.country_id), c.vat_id && `VAT ${c.vat_id}`].filter(Boolean).join(' · ')}
        actions={
          <>
            {c.is_customer && can('req.create') && <Link to={`/requirements?new=1&partner=${c.id}&partner_name=${encodeURIComponent(c.short_name || c.legal_name)}`} className="btn btn-secondary"><Plus className="size-4" />Requirement</Link>}
            {c.is_supplier && can('offer.create') && <Link to={`/offers?new=1&partner=${c.id}&partner_name=${encodeURIComponent(c.short_name || c.legal_name)}`} className="btn btn-secondary"><Plus className="size-4" />Offer</Link>}
          </>
        }
      />
      <Tabs tabs={tabs} value={tab} onChange={(v) => setSp({ tab: v }, { replace: true })} className="mb-4" />
      {tab === 'overview' && <Overview c={c} canEdit={canEdit} onSaved={refresh} />}
      {tab === 'customer' && <CustomerTerms c={c} canEdit={canEdit} onSaved={refresh} />}
      {tab === 'supplier' && <SupplierTerms c={c} canEdit={canEdit} onSaved={refresh} />}
      {tab === 'addresses' && <Addresses c={c} canEdit={canEdit} onSaved={refresh} />}
      {tab === 'contacts' && <Contacts c={c} canEdit={canEdit} onSaved={refresh} />}
      {tab === 'documents' && <Related id={c.id} />}
      {tab === 'files' && <AttachmentsPanel table="company" id={c.id} />}
    </div>
  );
}

function useSave(url, method, onSaved, msg = 'Saved') {
  const toast = useToast();
  return useMutation({
    mutationFn: (body) => (method === 'put' ? put : method === 'patch' ? patch : post)(url, body),
    onSuccess: () => {
      onSaved();
      toast.success(msg);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

function Overview({ c, canEdit, onSaved }) {
  const { name } = useMaster();
  const fields = ['legal_name', 'short_name', 'legal_form', 'country_id', 'vat_id', 'tax_number', 'registration_number', 'website', 'general_email', 'general_phone', 'default_currency_id', 'default_payment_term_id', 'default_incoterm_id', 'notes'];
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState(() => Object.fromEntries(fields.map((k) => [k, c[k] ?? ''])));
  const [roles, setRoles] = useState({ is_customer: !!c.is_customer, is_supplier: !!c.is_supplier });
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v?.target ? v.target.value : v ?? '' }));
  const save = useSave(`/companies/${c.id}`, 'patch', () => (onSaved(), setEdit(false)));
  const primary = c.contacts.find((x) => x.is_primary) ?? c.contacts[0];
  const billing = c.addresses.find((a) => a.is_default && a.address_type !== 'shipping') ?? c.addresses[0];

  if (edit)
    return (
      <Card>
        <CardHeader title="Edit company" actions={<><Button size="sm" onClick={() => setEdit(false)}>Cancel</Button><Button size="sm" variant="primary" icon={Save} loading={save.isPending} onClick={() => save.mutate({ ...nullify(f), ...roles })}>Save</Button></>} />
        <div className="grid sm:grid-cols-3 gap-3.5 px-4 pb-4">
          <Field label="Legal name" required span={2}>{(id) => <Input id={id} value={f.legal_name} onChange={set('legal_name')} />}</Field>
          <Field label="Short name">{(id) => <Input id={id} value={f.short_name} onChange={set('short_name')} />}</Field>
          <Field label="Legal form">{(id) => <Input id={id} value={f.legal_form} onChange={set('legal_form')} />}</Field>
          <Field label="Country">{(id) => <MasterPicker id={id} list="countries" value={f.country_id} onChange={set('country_id')} />}</Field>
          <Field label="VAT id">{(id) => <Input id={id} value={f.vat_id} onChange={set('vat_id')} />}</Field>
          <Field label="Tax number">{(id) => <Input id={id} value={f.tax_number} onChange={set('tax_number')} />}</Field>
          <Field label="Registration no.">{(id) => <Input id={id} value={f.registration_number} onChange={set('registration_number')} />}</Field>
          <Field label="Website">{(id) => <Input id={id} value={f.website} onChange={set('website')} />}</Field>
          <Field label="Email">{(id) => <Input id={id} value={f.general_email} onChange={set('general_email')} />}</Field>
          <Field label="Phone">{(id) => <Input id={id} value={f.general_phone} onChange={set('general_phone')} />}</Field>
          <Field label="Default currency">{(id) => <MasterSelect id={id} list="currencies" value={f.default_currency_id} onChange={set('default_currency_id')} />}</Field>
          <Field label="Default payment terms">{(id) => <MasterSelect id={id} list="payment-terms" value={f.default_payment_term_id} onChange={set('default_payment_term_id')} />}</Field>
          <Field label="Default incoterm">{(id) => <MasterSelect id={id} list="incoterms" value={f.default_incoterm_id} onChange={set('default_incoterm_id')} />}</Field>
          <div className="flex items-end gap-5 pb-2">
            <Checkbox label="Customer" checked={roles.is_customer} onChange={(v) => setRoles({ ...roles, is_customer: v })} />
            <Checkbox label="Supplier" checked={roles.is_supplier} onChange={(v) => setRoles({ ...roles, is_supplier: v })} />
          </div>
          <Field label="Notes" span="full">{(id) => <Textarea id={id} value={f.notes} onChange={set('notes')} />}</Field>
        </div>
      </Card>
    );

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <Card>
        <CardHeader title="Company details" actions={canEdit && <Button size="sm" icon={Pencil} onClick={() => setEdit(true)}>Edit</Button>} />
        <div className="px-4 pb-4">
          <DetailList
            cols={3}
            items={[
              { label: 'Legal name', value: c.legal_name },
              { label: 'Short name', value: c.short_name },
              { label: 'Legal form', value: c.legal_form },
              { label: 'Country', value: name('countries', c.country_id) },
              { label: 'VAT id', value: c.vat_id },
              { label: 'Tax number', value: c.tax_number },
              { label: 'Default currency', value: name('currencies', c.default_currency_id) },
              { label: 'Payment terms', value: name('payment-terms', c.default_payment_term_id) },
              { label: 'Incoterm', value: name('incoterms', c.default_incoterm_id) },
            ]}
          />
          {c.notes && <p className="mt-4 text-sm text-muted whitespace-pre-line border-t border-line pt-3">{c.notes}</p>}
        </div>
      </Card>
      <Card className="p-4 space-y-3 h-fit">
        {c.general_email && <a href={`mailto:${c.general_email}`} className="flex items-center gap-2.5 text-[13.5px] hover:text-link"><Mail className="size-4 text-faint" />{c.general_email}</a>}
        {c.general_phone && <a href={`tel:${c.general_phone}`} className="flex items-center gap-2.5 text-[13.5px] hover:text-link"><Phone className="size-4 text-faint" />{c.general_phone}</a>}
        {c.website && <a href={c.website.startsWith('http') ? c.website : `https://${c.website}`} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 text-[13.5px] hover:text-link"><Globe className="size-4 text-faint" />{c.website}</a>}
        {primary && (
          <div className="flex items-start gap-2.5 pt-3 border-t border-line">
            <UserRound className="size-4 text-faint mt-0.5" />
            <div className="text-[13.5px]"><p className="font-medium">{personName(primary)}</p><p className="text-muted text-xs">{primary.position}</p>{primary.email && <p className="text-xs">{primary.email}</p>}</div>
          </div>
        )}
        {billing && (
          <div className="flex items-start gap-2.5 pt-3 border-t border-line">
            <MapPin className="size-4 text-faint mt-0.5" />
            <p className="text-[13.5px] whitespace-pre-line">{[billing.street1, billing.street2, [billing.postal_code, billing.city].filter(Boolean).join(' '), name('countries', billing.country_id)].filter(Boolean).join('\n')}</p>
          </div>
        )}
      </Card>
    </div>
  );
}

function CustomerTerms({ c, canEdit, onSaved }) {
  const x = c.customer ?? {};
  const [f, setF] = useState({ customer_code: x.customer_code ?? '', since_date: x.since_date ?? '', credit_limit_eur: x.credit_limit_eur ?? '', payment_term_id: x.payment_term_id ?? null, default_discount_pct: x.default_discount_pct ?? '', assigned_sales_user_id: x.assigned_sales_user_id ?? null, status: x.status ?? 'active', notes: x.notes ?? '' });
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v?.target ? v.target.value : v }));
  const save = useSave(`/companies/${c.id}/customer`, 'put', onSaved, 'Customer terms saved');
  return (
    <Card>
      <CardHeader icon={ShoppingBag} title="Customer terms" actions={canEdit && <Button size="sm" variant="primary" icon={Save} loading={save.isPending} onClick={() => save.mutate({ ...nullify(f), credit_limit_eur: f.credit_limit_eur === '' ? null : Number(f.credit_limit_eur), default_discount_pct: f.default_discount_pct === '' ? null : Number(f.default_discount_pct) })}>Save</Button>} />
      <fieldset disabled={!canEdit} className="grid sm:grid-cols-3 gap-3.5 px-4 pb-4">
        <Field label="Customer code">{(id) => <Input id={id} value={f.customer_code} onChange={set('customer_code')} />}</Field>
        <Field label="Customer since">{(id) => <Input id={id} type="date" value={f.since_date} onChange={set('since_date')} />}</Field>
        <Field label="Status">{(id) => <Select id={id} value={f.status} onChange={set('status')}><option value="active">Active</option><option value="hold">On hold</option><option value="blacklisted">Blacklisted</option></Select>}</Field>
        <Field label="Credit limit (EUR)">{(id) => <Input id={id} type="number" min="0" value={f.credit_limit_eur} onChange={set('credit_limit_eur')} />}</Field>
        <Field label="Payment terms">{(id) => <MasterSelect id={id} list="payment-terms" value={f.payment_term_id} onChange={set('payment_term_id')} />}</Field>
        <Field label="Default discount %">{(id) => <Input id={id} type="number" min="0" max="100" step="0.01" value={f.default_discount_pct} onChange={set('default_discount_pct')} />}</Field>
        <Field label="Account holder (sales rep)" hint="Sees this customer and its documents.">{(id) => <UserPicker id={id} value={f.assigned_sales_user_id} onChange={set('assigned_sales_user_id')} />}</Field>
        <Field label="Notes" span={2}>{(id) => <Textarea id={id} rows={2} value={f.notes} onChange={set('notes')} />}</Field>
      </fieldset>
    </Card>
  );
}

function SupplierTerms({ c, canEdit, onSaved }) {
  const x = c.supplier ?? {};
  const keys = ['supplier_code', 'since_date', 'lead_time_days', 'payment_term_id', 'incoterm_id', 'currency_id', 'iban', 'bic', 'bank_name', 'assigned_buyer_user_id', 'authorized_distributor', 'franchise_notes', 'rating', 'status', 'notes'];
  const [f, setF] = useState(() => ({ ...Object.fromEntries(keys.map((k) => [k, x[k] ?? ''])), status: x.status ?? 'active', authorized_distributor: x.authorized_distributor ?? 0 }));
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v?.target ? v.target.value : v }));
  const save = useSave(`/companies/${c.id}/supplier`, 'put', onSaved, 'Supplier terms saved');
  return (
    <Card>
      <CardHeader icon={Factory} title="Supplier terms" actions={canEdit && <Button size="sm" variant="primary" icon={Save} loading={save.isPending} onClick={() => save.mutate({ ...nullify(f), lead_time_days: f.lead_time_days === '' ? null : Number(f.lead_time_days), rating: f.rating === '' ? null : Number(f.rating), authorized_distributor: f.authorized_distributor ? 1 : 0 })}>Save</Button>} />
      <fieldset disabled={!canEdit} className="grid sm:grid-cols-3 gap-3.5 px-4 pb-4">
        <Field label="Supplier code">{(id) => <Input id={id} value={f.supplier_code} onChange={set('supplier_code')} />}</Field>
        <Field label="Supplier since">{(id) => <Input id={id} type="date" value={f.since_date} onChange={set('since_date')} />}</Field>
        <Field label="Status">{(id) => <Select id={id} value={f.status} onChange={set('status')}><option value="active">Active</option><option value="hold">On hold</option><option value="blacklisted">Blacklisted</option></Select>}</Field>
        <Field label="Lead time (days)">{(id) => <Input id={id} type="number" min="0" value={f.lead_time_days} onChange={set('lead_time_days')} />}</Field>
        <Field label="Payment terms">{(id) => <MasterSelect id={id} list="payment-terms" value={f.payment_term_id} onChange={set('payment_term_id')} />}</Field>
        <Field label="Incoterm">{(id) => <MasterSelect id={id} list="incoterms" value={f.incoterm_id} onChange={set('incoterm_id')} />}</Field>
        <Field label="Purchase currency">{(id) => <MasterSelect id={id} list="currencies" value={f.currency_id} onChange={set('currency_id')} />}</Field>
        <Field label="Rating">
          {(id) => (
            <div id={id} className="flex gap-1 h-9 items-center">
              {[1, 2, 3, 4, 5].map((n) => (
                <button type="button" key={n} onClick={() => set('rating')(n)} aria-label={`${n} stars`}>
                  <Star className={`size-5 ${Number(f.rating) >= n ? 'fill-amber-400 text-amber-600' : 'text-faint'}`} />
                </button>
              ))}
            </div>
          )}
        </Field>
        <Field label="Buyer (account holder)">{(id) => <UserPicker id={id} value={f.assigned_buyer_user_id} onChange={set('assigned_buyer_user_id')} />}</Field>
        <Field label="Bank">{(id) => <Input id={id} value={f.bank_name} onChange={set('bank_name')} />}</Field>
        <Field label="IBAN">{(id) => <Input id={id} className="mono" value={f.iban} onChange={set('iban')} />}</Field>
        <Field label="BIC">{(id) => <Input id={id} className="mono" value={f.bic} onChange={set('bic')} />}</Field>
        <div className="flex items-end pb-2"><Checkbox label="Authorized / franchised distributor" checked={!!Number(f.authorized_distributor)} onChange={(v) => set('authorized_distributor')(v ? 1 : 0)} /></div>
        <Field label="Franchise notes" span={2}>{(id) => <Input id={id} value={f.franchise_notes} onChange={set('franchise_notes')} />}</Field>
        <Field label="Notes" span="full">{(id) => <Textarea id={id} rows={2} value={f.notes} onChange={set('notes')} />}</Field>
      </fieldset>
    </Card>
  );
}

function Addresses({ c, canEdit, onSaved }) {
  const { name } = useMaster();
  const toast = useToast();
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const archive = useMutation({ mutationFn: (a) => post(`/companies/${c.id}/addresses/${a.id}/archive`), onSuccess: () => (onSaved(), setDel(null)), onError: (e) => toast.error(errorMessage(e)) });
  return (
    <>
      <div className="flex justify-end mb-3">{canEdit && <Button variant="primary" size="sm" icon={Plus} onClick={() => setEdit({})}>Add address</Button>}</div>
      {c.addresses.length === 0 ? (
        <Card><EmptyState icon={MapPin} title="No addresses yet">Billing and shipping addresses fill in automatically on new documents.</EmptyState></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {c.addresses.map((a) => (
            <Card key={a.id} className="p-4 group">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex gap-1.5 flex-wrap"><Badge tone={a.address_type === 'shipping' ? 'cyan' : 'brand'}>{a.address_type === 'both' ? 'Billing & shipping' : a.address_type}</Badge>{!!a.is_default && <Badge tone="green">Default</Badge>}</div>
                {canEdit && (
                  <div className="flex">
                    <Button variant="ghost" size="sm" icon={Pencil} onClick={() => setEdit(a)} aria-label="Edit" />
                    <Button variant="ghost" size="sm" icon={Trash2} onClick={() => setDel(a)} aria-label="Remove" />
                  </div>
                )}
              </div>
              {a.label && <p className="font-medium text-[13.5px]">{a.label}</p>}
              <p className="text-[13.5px] text-muted whitespace-pre-line">{[a.recipient_name, a.street1, a.street2, [a.postal_code, a.city].filter(Boolean).join(' '), a.state, name('countries', a.country_id)].filter(Boolean).join('\n')}</p>
            </Card>
          ))}
        </div>
      )}
      {edit && <AddressDialog company={c} address={edit} onClose={() => setEdit(null)} onSaved={onSaved} />}
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} danger title="Remove address?" confirmLabel="Remove" loading={archive.isPending} onConfirm={() => archive.mutate(del)} />
    </>
  );
}

function AddressDialog({ company, address, onClose, onSaved }) {
  const isNew = !address.id;
  const [f, setF] = useState({ address_type: 'both', label: '', is_default: !company.addresses.length, recipient_name: '', street1: '', street2: '', postal_code: '', city: '', state: '', country_id: company.country_id ?? null, notes: '', ...address, is_default: address.id ? !!address.is_default : !company.addresses.length });
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v?.target ? v.target.value : v }));
  const keys = ['address_type', 'label', 'is_default', 'recipient_name', 'street1', 'street2', 'postal_code', 'city', 'state', 'country_id', 'notes'];
  const save = useSave(isNew ? `/companies/${company.id}/addresses` : `/companies/${company.id}/addresses/${address.id}`, isNew ? 'post' : 'patch', () => (onSaved(), onClose()), 'Address saved');
  return (
    <Modal open onClose={onClose} icon={MapPin} title={isNew ? 'Add address' : 'Edit address'} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={save.isPending} onClick={() => save.mutate(nullify(Object.fromEntries(keys.map((k) => [k, f[k]]))))}>Save</Button></>}>
      <div className="grid sm:grid-cols-2 gap-3.5">
        <Field label="Type">{(id) => <Select id={id} value={f.address_type} onChange={set('address_type')}><option value="both">Billing & shipping</option><option value="billing">Billing</option><option value="shipping">Shipping</option></Select>}</Field>
        <Field label="Label">{(id) => <Input id={id} value={f.label} onChange={set('label')} placeholder="e.g. Headquarters" />}</Field>
        <Field label="Recipient" span={2}>{(id) => <Input id={id} value={f.recipient_name} onChange={set('recipient_name')} />}</Field>
        <Field label="Street" span={2}>{(id) => <Input id={id} value={f.street1} onChange={set('street1')} />}</Field>
        <Field label="Street line 2" span={2}>{(id) => <Input id={id} value={f.street2} onChange={set('street2')} />}</Field>
        <Field label="Postal code">{(id) => <Input id={id} value={f.postal_code} onChange={set('postal_code')} />}</Field>
        <Field label="City">{(id) => <Input id={id} value={f.city} onChange={set('city')} />}</Field>
        <Field label="State / region">{(id) => <Input id={id} value={f.state} onChange={set('state')} />}</Field>
        <Field label="Country">{(id) => <MasterPicker id={id} list="countries" value={f.country_id} onChange={set('country_id')} />}</Field>
        <div className="sm:col-span-2"><Checkbox label="Default address for this type" checked={f.is_default} onChange={set('is_default')} /></div>
      </div>
    </Modal>
  );
}

function Contacts({ c, canEdit, onSaved }) {
  const toast = useToast();
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const archive = useMutation({ mutationFn: (x) => post(`/companies/${c.id}/contacts/${x.id}/archive`), onSuccess: () => (onSaved(), setDel(null)), onError: (e) => toast.error(errorMessage(e)) });
  return (
    <>
      <div className="flex justify-end mb-3">{canEdit && <Button variant="primary" size="sm" icon={Plus} onClick={() => setEdit({})}>Add contact</Button>}</div>
      {c.contacts.length === 0 ? (
        <Card><EmptyState icon={Users} title="No contacts yet" /></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {c.contacts.map((p) => (
            <Card key={p.id} className="p-4 group">
              <div className="flex items-start gap-3">
                <div className="grid place-items-center size-10 rounded-full bg-gradient-to-br from-brand-600 to-cyan-700 text-white text-[13px] font-semibold shrink-0">{(p.first_name?.[0] ?? '') + p.last_name[0]}</div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium flex items-center gap-1.5">{personName(p)}{!!p.is_primary && <Star className="size-3.5 fill-amber-400 text-amber-600" />}</p>
                  <p className="text-xs text-muted">{[p.position, p.department].filter(Boolean).join(' · ')}</p>
                  <div className="mt-2 space-y-0.5 text-[13px]">
                    {p.email && <a href={`mailto:${p.email}`} className="flex items-center gap-1.5 hover:text-link truncate"><Mail className="size-3.5 text-faint" />{p.email}</a>}
                    {(p.phone || p.mobile) && <a href={`tel:${p.phone || p.mobile}`} className="flex items-center gap-1.5 hover:text-link"><Phone className="size-3.5 text-faint" />{p.phone || p.mobile}</a>}
                  </div>
                </div>
                {canEdit && (
                  <div className="flex flex-col">
                    <Button variant="ghost" size="sm" icon={Pencil} onClick={() => setEdit(p)} aria-label="Edit" />
                    <Button variant="ghost" size="sm" icon={Trash2} onClick={() => setDel(p)} aria-label="Remove" />
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
      {edit && <ContactDialog company={c} contact={edit} onClose={() => setEdit(null)} onSaved={onSaved} />}
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} danger title={`Remove ${personName(del)}?`} confirmLabel="Remove" loading={archive.isPending} onConfirm={() => archive.mutate(del)} />
    </>
  );
}

function ContactDialog({ company, contact, onClose, onSaved }) {
  const isNew = !contact.id;
  const keys = ['salutation', 'first_name', 'last_name', 'academic_title', 'position', 'department', 'email', 'phone', 'mobile', 'is_primary', 'notes'];
  const [f, setF] = useState(() => ({ ...Object.fromEntries(keys.map((k) => [k, contact[k] ?? ''])), is_primary: contact.id ? !!contact.is_primary : !company.contacts.length }));
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v?.target ? v.target.value : v }));
  const save = useSave(isNew ? `/companies/${company.id}/contacts` : `/companies/${company.id}/contacts/${contact.id}`, isNew ? 'post' : 'patch', () => (onSaved(), onClose()), 'Contact saved');
  return (
    <Modal open onClose={onClose} icon={UserRound} title={isNew ? 'Add contact' : 'Edit contact'} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={save.isPending} disabled={!f.last_name} onClick={() => save.mutate(nullify(f))}>Save</Button></>}>
      <div className="grid sm:grid-cols-6 gap-3.5">
        <Field label="Salutation" className="sm:col-span-2">{(id) => <Select id={id} value={f.salutation} onChange={set('salutation')} placeholder="None"><option>Herr</option><option>Frau</option><option>Mr</option><option>Ms</option><option>Dr.</option></Select>}</Field>
        <Field label="Title" className="sm:col-span-1">{(id) => <Input id={id} value={f.academic_title} onChange={set('academic_title')} placeholder="Dr." />}</Field>
        <Field label="First name" className="sm:col-span-3">{(id) => <Input id={id} value={f.first_name} onChange={set('first_name')} />}</Field>
        <Field label="Last name" required className="sm:col-span-3">{(id) => <Input id={id} value={f.last_name} onChange={set('last_name')} />}</Field>
        <Field label="Position" className="sm:col-span-3">{(id) => <Input id={id} value={f.position} onChange={set('position')} />}</Field>
        <Field label="Department" className="sm:col-span-2">{(id) => <Input id={id} value={f.department} onChange={set('department')} />}</Field>
        <Field label="Email" className="sm:col-span-4">{(id) => <Input id={id} type="email" value={f.email} onChange={set('email')} />}</Field>
        <Field label="Phone" className="sm:col-span-3">{(id) => <Input id={id} value={f.phone} onChange={set('phone')} />}</Field>
        <Field label="Mobile" className="sm:col-span-3">{(id) => <Input id={id} value={f.mobile} onChange={set('mobile')} />}</Field>
        <div className="sm:col-span-6"><Checkbox label="Primary contact" checked={f.is_primary} onChange={set('is_primary')} /></div>
      </div>
    </Modal>
  );
}

function Related({ id }) {
  const q = useQuery({ queryKey: ['company-related', id], queryFn: () => get(`/companies/${id}/related`) });
  const groups = [
    ['requirements', 'requirement'], ['quotes', 'quote'], ['sales_orders', 'sales_order'], ['offers', 'offer'], ['purchase_orders', 'purchase_order'],
  ];
  if (q.isLoading) return <Skeleton className="h-40 w-full" />;
  const d = q.data;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {groups.filter(([k]) => d[k]?.length).map(([k, kind]) => (
        <Card key={k}>
          <CardHeader icon={DOCS[kind].icon} title={DOCS[kind].plural} subtitle={`${d[k].length} most recent`} />
          <ul className="divide-y divide-line border-t border-line">
            {d[k].slice(0, 10).map((r) => (
              <li key={r.id}><Link to={docPath(kind, r.id)} className="flex items-center gap-3 px-4 py-2 hover:bg-surface-2"><span className="mono text-[13px] flex-1">{r.no}</span><span className="text-xs text-faint">{fmtDate(r.date)}</span><StatusBadge status={r.status} /></Link></li>
            ))}
          </ul>
        </Card>
      ))}
      {d.invoices?.length > 0 && (
        <Card>
          <CardHeader icon={FileText} title="Invoices" />
          <ul className="divide-y divide-line border-t border-line">
            {d.invoices.slice(0, 10).map((r) => (
              <li key={r.id}><Link to={`/invoices/${r.id}`} className="flex items-center gap-3 px-4 py-2 hover:bg-surface-2"><span className="mono text-[13px] flex-1">{r.no}</span><span className="text-xs tabular-nums">{fmtMoney(r.grand_total)}</span><StatusBadge status={r.status} /></Link></li>
            ))}
          </ul>
        </Card>
      )}
      {groups.every(([k]) => !d[k]?.length) && !d.invoices?.length && <Card className="lg:col-span-2"><EmptyState icon={FileText} title="No documents yet" /></Card>}
    </div>
  );
}
