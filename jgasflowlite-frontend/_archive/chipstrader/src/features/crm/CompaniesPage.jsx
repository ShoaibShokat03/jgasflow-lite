import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Building2 } from 'lucide-react';
import { errorMessage, get, post } from '@/lib/api';
import { useDebounced, useListParams, useMaster, useMe, useUsers } from '@/lib/hooks';
import { compact, cn } from '@/lib/utils';
import { Button, Checkbox, ClearFilters, EmptyState, Field, Input, PageHeader, Select } from '@/components/ui/core';
import { DataTable, Pagination } from '@/components/ui/table';
import { Badge, StatusBadge } from '@/components/ui/status';
import { Modal, useToast } from '@/components/ui/overlay';
import { MasterPicker, MasterSelect, UserPicker } from '@/components/ui/pickers';

export default function CompaniesPage() {
  const navigate = useNavigate();
  const { can } = useMe();
  const { name } = useMaster();
  const { data: users } = useUsers();
  const [sp, setSp] = useSearchParams();
  const [params, set] = useListParams(sp, setSp, { page: '1', type: 'all' });
  const [searchInput, setSearchInput] = useState(params.search ?? '');
  const search = useDebounced(searchInput);
  useEffect(() => {
    if ((params.search ?? '') !== search) set({ search });
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const q = useQuery({
    queryKey: ['companies', params],
    queryFn: () => get('/companies', compact({ page: params.page, limit: 25, search: params.search, type: params.type, status: params.status, country_id: params.country_id, sort_by: params.sort_by, sort_order: params.sort_order })),
    placeholderData: keepPreviousData,
  });

  const userName = (id) => {
    const u = users?.find((x) => x.id === id);
    return u ? u.full_name || u.username : '';
  };

  const columns = [
    {
      key: 'legal_name', header: 'Company', sort: 'legal_name', mobile: true,
      render: (r) => (
        <div className="flex items-center gap-3 min-w-0">
          <div className="grid place-items-center size-8 rounded-lg bg-gradient-to-br from-brand-100 to-cyan-100 text-link dark:from-brand-500/20 dark:to-cyan-500/20 dark:text-brand-200 text-[11px] font-semibold shrink-0">
            {(r.short_name || r.legal_name).slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="font-medium truncate">{r.legal_name}</p>
            {r.short_name && <p className="text-xs text-muted truncate">{r.short_name}</p>}
          </div>
        </div>
      ),
    },
    { key: 'type', header: 'Type', mobile: true, render: (r) => <div className="flex gap-1">{!!r.is_customer && <Badge tone="brand">Customer</Badge>}{!!r.is_supplier && <Badge tone="cyan">Supplier</Badge>}</div> },
    { key: 'code', header: 'Code', render: (r) => <span className="mono text-xs">{r.customer?.customer_code || r.supplier?.supplier_code || ''}</span> },
    { key: 'country', header: 'Country', render: (r) => name('countries', r.country_id) || '' },
    { key: 'contact', header: 'Primary contact', render: (r) => (r.primary_contact ? <span><span>{`${r.primary_contact.first_name ?? ''} ${r.primary_contact.last_name}`.trim()}</span>{r.primary_contact.email && <span className="block text-xs text-muted">{r.primary_contact.email}</span>}</span> : '') },
    { key: 'holder', header: 'Account holder', render: (r) => userName(r.customer?.assigned_sales_user_id) || userName(r.supplier?.assigned_buyer_user_id) || '' },
    { key: 'status', header: 'Status', render: (r) => (!r.is_active ? <StatusBadge status="inactive" /> : <StatusBadge status={r.customer?.status || r.supplier?.status || 'active'} />) },
  ];

  const canCreate = can('company.create', 'customer.create', 'supplier.create');

  return (
    <div>
      <PageHeader title="Customers & suppliers" actions={canCreate && <Button variant="primary" icon={Plus} onClick={() => setSp({ ...params, new: '1' })}>New company</Button>} />
      <div className="card p-3 mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-line p-0.5 bg-surface-2">
          {['all', 'customer', 'supplier'].map((t) => (
            <button key={t} onClick={() => set({ type: t })} className={cn('h-7 px-3 rounded-md text-[12.5px] font-medium capitalize', params.type === t ? 'bg-surface shadow-sm' : 'text-muted')}>
              {t === 'all' ? 'All' : `${t}s`}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-56">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-faint" />
          <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Name, VAT id or code…" className="pl-9" />
        </div>
        <Select value={params.status ?? ''} onChange={(e) => set({ status: e.target.value })} className="w-36" placeholder="Any status">
          <option value="active">Active</option><option value="hold">On hold</option><option value="blacklisted">Blacklisted</option>
        </Select>
        <div className="w-52"><MasterPicker list="countries" value={params.country_id} onChange={(v) => set({ country_id: v ?? '' })} placeholder="Any country" /></div>
        <ClearFilters
          active={!!(params.search || params.status || params.country_id || (params.type && params.type !== 'all'))}
          onClear={() => {
            setSearchInput('');
            setSp({});
          }}
        />
      </div>
      <DataTable
        columns={columns}
        rows={q.data?.items}
        loading={q.isLoading}
        onRowClick={(r) => navigate(`/companies/${r.id}`)}
        sort={{ by: params.sort_by, order: params.sort_order }}
        onSort={(by, order) => set({ sort_by: by, sort_order: order })}
        empty={<EmptyState icon={Building2} title={params.search ? 'No matches' : 'No companies yet'} action={canCreate && !params.search && <Button variant="primary" icon={Plus} onClick={() => setSp({ new: '1' })}>New company</Button>}>Add your customers and suppliers to start quoting.</EmptyState>}
        footer={<Pagination page={params.page} totalPages={q.data?.total_pages} total={q.data?.total} onPage={(p) => set({ page: String(p) })} label="companies" />}
      />
      {sp.get('new') === '1' && <NewCompanyDialog onClose={() => { sp.delete('new'); setSp(sp); }} defaultType={params.type} />}
    </div>
  );
}

function NewCompanyDialog({ onClose, defaultType }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [f, setF] = useState({
    legal_name: '', short_name: '', legal_form: '', country_id: null, vat_id: '', website: '', general_email: '', general_phone: '', default_currency_id: null,
    is_customer: defaultType !== 'supplier', is_supplier: defaultType === 'supplier', customer_code: '', supplier_code: '', holder: null,
  });
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v?.target ? v.target.value : v }));
  const m = useMutation({
    mutationFn: () =>
      post('/companies', compact({
        legal_name: f.legal_name, short_name: f.short_name, legal_form: f.legal_form, country_id: f.country_id, vat_id: f.vat_id, website: f.website,
        general_email: f.general_email, general_phone: f.general_phone, default_currency_id: f.default_currency_id, is_customer: f.is_customer, is_supplier: f.is_supplier,
        customer: f.is_customer ? compact({ customer_code: f.customer_code, assigned_sales_user_id: f.holder }) : undefined,
        supplier: f.is_supplier ? compact({ supplier_code: f.supplier_code, assigned_buyer_user_id: f.holder }) : undefined,
      })),
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ['companies'] });
      qc.invalidateQueries({ queryKey: ['company-options'] });
      toast.success(`${c.legal_name} created`);
      navigate(`/companies/${c.id}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Modal open onClose={onClose} size="lg" icon={Building2} title="New company" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={m.isPending} disabled={!f.legal_name || (!f.is_customer && !f.is_supplier)} onClick={() => m.mutate()}>Create company</Button></>}>
      <div className="grid sm:grid-cols-2 gap-3.5">
        <Field label="Legal name" required span={2}>{(id) => <Input id={id} autoFocus value={f.legal_name} onChange={set('legal_name')} placeholder="e.g. Müller Elektronik GmbH" />}</Field>
        <Field label="Short name">{(id) => <Input id={id} value={f.short_name} onChange={set('short_name')} />}</Field>
        <Field label="Legal form">
          {(id) => (
            <Select id={id} value={f.legal_form} onChange={set('legal_form')} placeholder="None">
              {['GmbH', 'AG', 'UG', 'KG', 'GmbH & Co. KG', 'OHG', 'e.K.', 'GbR', 'Ltd', 'LLC', 'Inc', 'S.A.', 'S.r.l.', 'B.V.', 'Other'].map((x) => <option key={x}>{x}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Country">{(id) => <MasterPicker id={id} list="countries" value={f.country_id} onChange={set('country_id')} />}</Field>
        <Field label="VAT id">{(id) => <Input id={id} value={f.vat_id} onChange={set('vat_id')} placeholder="DE123456789" />}</Field>
        <Field label="Email">{(id) => <Input id={id} type="email" value={f.general_email} onChange={set('general_email')} />}</Field>
        <Field label="Phone">{(id) => <Input id={id} value={f.general_phone} onChange={set('general_phone')} />}</Field>
        <Field label="Website">{(id) => <Input id={id} value={f.website} onChange={set('website')} />}</Field>
        <Field label="Default currency">{(id) => <MasterSelect id={id} list="currencies" value={f.default_currency_id} onChange={set('default_currency_id')} />}</Field>
        <div className="sm:col-span-2 flex flex-wrap gap-5 py-1">
          <Checkbox label="Customer" checked={f.is_customer} onChange={set('is_customer')} />
          <Checkbox label="Supplier" checked={f.is_supplier} onChange={set('is_supplier')} />
        </div>
        {f.is_customer && <Field label="Customer code">{(id) => <Input id={id} value={f.customer_code} onChange={set('customer_code')} />}</Field>}
        {f.is_supplier && <Field label="Supplier code">{(id) => <Input id={id} value={f.supplier_code} onChange={set('supplier_code')} />}</Field>}
        <Field label="Account holder" hint="Defaults to you if you only see your own accounts.">{(id) => <UserPicker id={id} value={f.holder} onChange={set('holder')} placeholder="Choose…" />}</Field>
      </div>
    </Modal>
  );
}
