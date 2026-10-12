import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { get } from '@/lib/api';
import { humanize } from '@/lib/format';
import { useDebounced, useListParams } from '@/lib/hooks';
import { compact } from '@/lib/utils';
import { ClearFilters, EmptyState, Input, PageHeader, Select } from '@/components/ui/core';
import { DataTable, Pagination } from '@/components/ui/table';

/** List screen for the simpler registers: receipts, allocations, shipments. */
export function SimpleList({ title, subtitle, api, columns, statuses, rowLink, icon, label, searchPlaceholder }) {
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const [params, set] = useListParams(sp, setSp, { page: '1' });
  const [input, setInput] = useState(params.search ?? '');
  const search = useDebounced(input);
  useEffect(() => {
    if ((params.search ?? '') !== search) set({ search });
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps
  const q = useQuery({ queryKey: [api, params], queryFn: () => get(api, compact({ ...params, limit: 25 })), placeholderData: keepPreviousData });
  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} />
      <div className="card p-3 mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-56">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-faint" />
          <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder={searchPlaceholder} className="pl-9" />
        </div>
        <Select value={params.status ?? ''} onChange={(e) => set({ status: e.target.value })} className="w-40" placeholder="Any status">
          {statuses.map((x) => <option key={x} value={x}>{humanize(x)}</option>)}
        </Select>
        <Input type="date" value={params.from ?? ''} onChange={(e) => set({ from: e.target.value })} className="w-38" aria-label="From" />
        <Input type="date" value={params.to ?? ''} onChange={(e) => set({ to: e.target.value })} className="w-38" aria-label="To" />
        <ClearFilters
          active={!!(params.search || params.status || params.from || params.to)}
          onClear={() => {
            setInput('');
            setSp({});
          }}
        />
      </div>
      <DataTable
        columns={columns}
        rows={q.data?.items}
        loading={q.isLoading}
        onRowClick={rowLink ? (r) => navigate(rowLink(r)) : undefined}
        empty={<EmptyState icon={icon} title={`No ${label} yet`} />}
        footer={<Pagination page={params.page} totalPages={q.data?.total_pages} total={q.data?.total} onPage={(p) => set({ page: String(p) })} label={label} />}
      />
    </div>
  );
}
