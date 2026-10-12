import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Search, Receipt, Wallet, AlertTriangle, FileClock } from 'lucide-react';
import { get } from '@/lib/api';
import { fmtDate, fmtMoney, humanize, fmtCompact } from '@/lib/format';
import { useDebounced, useListParams, useMaster } from '@/lib/hooks';
import { compact, cn } from '@/lib/utils';
import { ClearFilters, EmptyState, Input, PageHeader, Select, StatTile } from '@/components/ui/core';
import { DataTable, Pagination } from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/status';
import { CompanyPicker } from '@/components/ui/pickers';

export default function InvoicesPage() {
  const navigate = useNavigate();
  const { name } = useMaster();
  const [sp, setSp] = useSearchParams();
  const [params, set] = useListParams(sp, setSp, { page: '1' });
  const [searchInput, setSearchInput] = useState(params.search ?? '');
  const search = useDebounced(searchInput);
  useEffect(() => {
    if ((params.search ?? '') !== search) set({ search });
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const summary = useQuery({ queryKey: ['invoices', 'summary'], queryFn: () => get('/invoices/summary') });
  const q = useQuery({
    queryKey: ['invoices', 'list', params],
    queryFn: () => get('/invoices', compact({ ...params, limit: 25 })),
    placeholderData: keepPreviousData,
  });

  const s = summary.data;
  const columns = [
    { key: 'invoice_no', header: 'Invoice', sort: 'no', mobile: true, render: (r) => <span className="mono font-semibold text-brand-700 dark:text-brand-300">{r.invoice_no}</span> },
    { key: 'partner_name', header: 'Customer', sort: 'partner', mobile: true, render: (r) => <span className="font-medium">{r.partner_name}</span> },
    { key: 'so_no', header: 'Order', render: (r) => <span className="mono text-xs text-muted">{r.so_no}</span> },
    { key: 'invoice_date', header: 'Date', sort: 'date', render: (r) => fmtDate(r.invoice_date) },
    { key: 'due_date', header: 'Due', sort: 'due', render: (r) => <span className={cn(r.overdue && 'text-danger font-medium')}>{fmtDate(r.due_date)}</span> },
    { key: 'grand_total', header: 'Total', sort: 'total', align: 'right', render: (r) => fmtMoney(r.grand_total, name('currencies', r.currency_id)) },
    { key: 'balance', header: 'Balance', align: 'right', render: (r) => (r.status === 'issued' ? <span className="font-medium">{fmtMoney(r.balance)}</span> : null) },
    { key: 'status', header: 'Status', mobile: true, render: (r) => <StatusBadge status={r.overdue ? 'overdue' : r.status} /> },
  ];
  const active = !!(params.search || params.status || params.partner_id || params.unpaid || params.overdue || params.from || params.to);
  const clearAll = () => {
    setSearchInput('');
    setSp({});
  };

  return (
    <div>
      <PageHeader title="Invoices" />
      {s && (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-4">
          <StatTile label="Open receivables" value={fmtCompact(s.open)} sub={`${s.issued} issued`} icon={Wallet} tone="green" />
          <StatTile label="Overdue" value={fmtCompact(s.overdue)} sub="past due date" icon={AlertTriangle} tone={s.overdue > 0 ? 'rose' : 'green'} />
          <StatTile label="Drafts to issue" value={s.drafts} sub="waiting for review" icon={FileClock} tone="amber" />
          <StatTile label="Shown" value={q.data?.total ?? 0} sub="matching filters" icon={Receipt} />
        </div>
      )}
      <div className="card p-3 mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-56">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-faint" />
          <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Invoice, order, reference or customer…" className="pl-9" />
        </div>
        <div className="flex rounded-lg border border-line p-0.5 bg-surface-2">
          {[
            { k: '', label: 'All' },
            { k: 'unpaid', label: 'Unpaid' },
            { k: 'overdue', label: 'Overdue' },
          ].map((o) => (
            <button key={o.label} onClick={() => set({ unpaid: o.k === 'unpaid' ? '1' : '', overdue: o.k === 'overdue' ? '1' : '' })} className={cn('h-7 px-3 rounded-md text-[12.5px] font-medium', (o.k === '' ? !params.unpaid && !params.overdue : params[o.k]) ? 'bg-surface shadow-sm' : 'text-muted')}>
              {o.label}
            </button>
          ))}
        </div>
        <Select value={params.status ?? ''} onChange={(e) => set({ status: e.target.value })} className="w-36" placeholder="Any status">
          {['draft', 'issued', 'paid', 'void'].map((x) => <option key={x} value={x}>{humanize(x)}</option>)}
        </Select>
        <div className="w-56"><CompanyPicker type="customer" value={params.partner_id} onChange={(v) => set({ partner_id: v ?? '' })} placeholder="Any customer" /></div>
        <Input type="date" value={params.from ?? ''} onChange={(e) => set({ from: e.target.value })} className="w-38" aria-label="From" />
        <Input type="date" value={params.to ?? ''} onChange={(e) => set({ to: e.target.value })} className="w-38" aria-label="To" />
        <ClearFilters active={active} onClear={clearAll} />
      </div>
      <DataTable
        columns={columns}
        rows={q.data?.items}
        loading={q.isLoading}
        onRowClick={(r) => navigate(`/invoices/${r.id}`)}
        sort={{ by: params.sort_by, order: params.sort_order }}
        onSort={(by, order) => set({ sort_by: by, sort_order: order })}
        empty={<EmptyState icon={Receipt} title="No invoices">Invoices appear here when you ship a sales order.</EmptyState>}
        footer={<Pagination page={params.page} totalPages={q.data?.total_pages} total={q.data?.total} onPage={(p) => set({ page: String(p) })} label="invoices" />}
      />
    </div>
  );
}
