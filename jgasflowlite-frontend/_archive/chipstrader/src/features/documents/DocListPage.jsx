import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus, Search, Rows3, List } from 'lucide-react';
import { get } from '@/lib/api';
import { useDebounced, useListParams, useMaster, useMe } from '@/lib/hooks';
import { fmtDate, fmtMoney, fmtQty, fmtPrice, humanize } from '@/lib/format';
import { compact, cn } from '@/lib/utils';
import { Button, ClearFilters, Input, PageHeader, Select, EmptyState } from '@/components/ui/core';
import { DataTable, Pagination } from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/status';
import { CompanyPicker } from '@/components/ui/pickers';
import { DOCS, docPath } from './doc-types';
import NewDocDialog from './NewDocDialog';

/** List of any pipeline document, with a "Lines" view across all documents. */
export default function DocListPage({ kind }) {
  const cfg = DOCS[kind];
  const navigate = useNavigate();
  const { can } = useMe();
  const { name } = useMaster();
  const [searchParams, setSearchParams] = useSearchParams();
  const [params, set] = useListParams(searchParams, setSearchParams, { page: '1', view: 'docs' });
  const [searchInput, setSearchInput] = useState(params.search ?? '');
  const search = useDebounced(searchInput, 300);
  const newOpen = searchParams.get('new') === '1';

  useEffect(() => {
    if ((params.search ?? '') !== search) set({ search });
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const isLines = params.view === 'lines';
  const query = useQuery({
    queryKey: [cfg.api, isLines ? 'lines' : 'list', params],
    queryFn: () =>
      get(isLines ? `${cfg.api}/lines` : cfg.api, compact({
        page: params.page, limit: isLines ? 50 : 25, search: params.search, status: params.status, partner_id: params.partner_id,
        from: params.from, to: params.to, sort_by: params.sort_by, sort_order: params.sort_order, pn: isLines ? params.search : undefined,
        include_cancelled: params.status ? undefined : params.all,
      })),
    placeholderData: keepPreviousData,
  });

  const docColumns = [
    { key: 'doc_no', header: 'Number', sort: 'no', mobile: true, render: (r) => <span className="mono font-semibold text-brand-700 dark:text-brand-300">{r.doc_no}</span> },
    { key: 'partner_name', header: cfg.side === 'customer' ? 'Customer' : 'Supplier', sort: 'partner', mobile: true, render: (r) => <span className="font-medium">{r.partner_name}</span> },
    { key: 'title', header: 'Title', className: 'max-w-64 truncate', render: (r) => <span className="text-muted">{r.title || ''}</span> },
    { key: 'doc_date', header: cfg.dateLabel, sort: 'date', render: (r) => fmtDate(r.doc_date) },
    { key: 'line_count', header: 'Lines', align: 'right', render: (r) => r.line_count },
    { key: 'line_value', header: 'Value', align: 'right', render: (r) => (r.line_value ? fmtMoney(r.line_value, name('currencies', r.currency_id)) : null) },
    { key: 'owner_name', header: cfg.side === 'customer' ? 'Sales rep' : 'Buyer', render: (r) => <span className="text-muted">{r.owner_name || ''}</span> },
    { key: 'status', header: 'Status', sort: 'status', mobile: true, render: (r) => <StatusBadge status={r.status} /> },
  ];

  const lineColumns = [
    { key: 'part_number', header: 'Part number', mobile: true, render: (r) => <span className="mono font-semibold">{r.part_number}</span> },
    { key: 'manufacturer', header: 'Manufacturer', render: (r) => name('manufacturers', r.manufacturer_id) || '' },
    { key: 'doc_no', header: 'Document', mobile: true, render: (r) => <span className="mono text-brand-700 dark:text-brand-300">{r.doc_no}</span> },
    { key: 'partner_name', header: cfg.side === 'customer' ? 'Customer' : 'Supplier', render: (r) => r.partner_name },
    { key: 'doc_date', header: 'Date', render: (r) => fmtDate(r.doc_date) },
    { key: 'qty', header: 'Qty', align: 'right', render: (r) => fmtQty(r.quantity_required) },
    { key: 'price', header: 'Unit price', align: 'right', render: (r) => (r.target_price ? `${fmtPrice(r.target_price)} ${name('currencies', r.target_currency_id || r.doc_currency_id)}` : '') },
    { key: 'doc_status', header: 'Status', mobile: true, render: (r) => <StatusBadge status={r.doc_status} /> },
  ];

  const data = query.data;
  const filtersActive = params.status || params.partner_id || params.from || params.to;
  const anyFilter = !!(filtersActive || params.search);
  const clearAll = () => {
    setSearchInput('');
    setSearchParams({ view: params.view });
  };

  return (
    <div>
      <PageHeader
        title={cfg.plural}
        subtitle={cfg.subtitle}
        actions={
          can(`${cfg.prefix}.create`) && (
            <Button variant="primary" icon={Plus} onClick={() => setSearchParams({ ...params, new: '1' })}>
              New {cfg.label.toLowerCase()}
            </Button>
          )
        }
      />

      <div className="card p-3 mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-56">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-faint" />
          <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder={isLines ? 'Part number…' : 'Number, title, partner or part number…'} className="pl-9" />
        </div>
        <Select value={params.status ?? ''} onChange={(e) => set({ status: e.target.value })} className="w-40" placeholder="Open statuses">
          {cfg.statuses.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </Select>
        <div className="w-56">
          <CompanyPicker type={cfg.side} value={params.partner_id} onChange={(id) => set({ partner_id: id ?? '' })} placeholder={`Any ${cfg.side}`} />
        </div>
        <Input type="date" value={params.from ?? ''} onChange={(e) => set({ from: e.target.value })} className="w-38" aria-label="From date" />
        <Input type="date" value={params.to ?? ''} onChange={(e) => set({ to: e.target.value })} className="w-38" aria-label="To date" />
        <ClearFilters active={anyFilter} onClear={clearAll} />
        <div className="ml-auto flex rounded-lg border border-line p-0.5 bg-surface-2">
          {[
            { v: 'docs', icon: List, label: cfg.plural },
            { v: 'lines', icon: Rows3, label: 'All lines' },
          ].map((o) => (
            <button key={o.v} onClick={() => set({ view: o.v })} className={cn('flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[12.5px] font-medium', params.view === o.v ? 'bg-surface shadow-sm text-ink' : 'text-muted')}>
              <o.icon className="size-3.5" />
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <DataTable
        columns={isLines ? lineColumns : docColumns}
        rows={data?.items}
        loading={query.isLoading}
        onRowClick={(r) => navigate(docPath(kind, isLines ? r.doc_id : r.id))}
        sort={{ by: params.sort_by, order: params.sort_order }}
        onSort={(by, order) => set({ sort_by: by, sort_order: order })}
        empty={
          <EmptyState icon={cfg.icon} title={filtersActive || params.search ? 'No matches' : `No ${cfg.plural.toLowerCase()} yet`} action={!filtersActive && can(`${cfg.prefix}.create`) && <Button variant="primary" icon={Plus} onClick={() => setSearchParams({ new: '1' })}>New {cfg.label.toLowerCase()}</Button>}>
            {filtersActive || params.search ? 'Try different filters.' : cfg.subtitle}
          </EmptyState>
        }
        footer={<Pagination page={params.page} totalPages={data?.total_pages} total={data?.total} onPage={(p) => set({ page: String(p) })} label={isLines ? 'lines' : cfg.plural.toLowerCase()} />}
      />

      {newOpen && (
        <NewDocDialog
          kind={kind}
          defaults={searchParams.get('partner') ? { partner_id: Number(searchParams.get('partner')) } : undefined}
          partnerLabel={searchParams.get('partner_name') ?? undefined}
          onClose={() => {
            const { new: _n, partner: _p, partner_name: _pn, ...rest } = Object.fromEntries(searchParams.entries());
            setSearchParams(rest);
          }}
        />
      )}
    </div>
  );
}
