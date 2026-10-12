import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { Search, Boxes } from 'lucide-react';
import { get } from '@/lib/api';
import { fmtDate, fmtPrice, fmtQty } from '@/lib/format';
import { useMaster, useMe } from '@/lib/hooks';
import { Button, Card, CardHeader, EmptyState, Input, PageHeader, Spinner } from '@/components/ui/core';
import { StatusBadge } from '@/components/ui/status';
import { DOCS, docPath } from '@/features/documents/doc-types';

/**
 * Where has this part appeared? One search across stock and every pipeline
 * document, the broker's most-asked question, answered in one screen.
 */
export default function SourcingPage() {
  const [sp, setSp] = useSearchParams();
  const pn = sp.get('pn') ?? '';
  const [input, setInput] = useState(pn);
  const { can } = useMe();
  const { name } = useMaster();
  const kinds = Object.values(DOCS).filter((d) => can(`${d.prefix}.view`));

  const results = useQueries({
    queries: [
      { queryKey: ['sourcing', 'stock', pn], queryFn: () => get('/stock', { pn, limit: 50, available_only: '1' }), enabled: !!pn && can('stock.view') },
      ...kinds.map((d) => ({ queryKey: ['sourcing', d.kind, pn], queryFn: () => get(`${d.api}/lines`, { pn, limit: 20 }), enabled: !!pn })),
    ],
  });
  const [stock, ...docs] = results;
  const loading = results.some((r) => r.isFetching);
  const available = (stock.data?.items ?? []).reduce((a, s) => a + s.available_qty, 0);

  return (
    <div>
      <PageHeader title="Part sourcing" />
      <form className="card p-3 mb-5 flex gap-2" onSubmit={(e) => (e.preventDefault(), setSp(input.trim() ? { pn: input.trim() } : {}))}>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-faint" />
          <Input autoFocus value={input} onChange={(e) => setInput(e.target.value)} placeholder="e.g. LM358, STM32F103, 0603 10k…" className="pl-9 h-10 mono text-[15px]" />
        </div>
        <Button type="submit" variant="primary" className="h-10" loading={loading}>Search</Button>
      </form>

      {!pn ? (
        <Card><EmptyState icon={Search} title="Type a part number to begin">Matches part numbers and customer part numbers, partial or exact.</EmptyState></Card>
      ) : (
        <div className="space-y-4">
          {can('stock.view') && (
            <Card>
              <CardHeader icon={Boxes} title="In stock" subtitle={stock.data ? `${fmtQty(available)} pieces available across ${stock.data.items.length} lot(s)` : 'Searching…'} />
              {stock.isLoading ? <div className="py-8 grid place-items-center"><Spinner /></div> : !stock.data?.items.length ? <p className="px-4 pb-4 text-sm text-muted">No available stock.</p> : (
                <div className="border-t border-line overflow-x-auto"><table className="table-base"><thead><tr><th>Part</th><th>Lot</th><th>DC</th><th>Location</th><th className="text-right">Available</th><th className="text-right">Unit cost</th></tr></thead><tbody>
                  {stock.data.items.map((s) => <tr key={s.id}><td><Link to={`/stock/${s.id}`} className="mono font-semibold hover:text-link">{s.part_number}</Link><p className="text-xs text-muted">{name('manufacturers', s.manufacturer_id)}</p></td><td className="mono text-xs">{s.stock_no}</td><td>{s.date_code || ''}</td><td className="text-xs text-muted">{[name('warehouses', s.warehouse_id), s.bin_location].filter(Boolean).join(' · ') || ''}</td><td className="text-right tabular-nums font-semibold text-success">{fmtQty(s.available_qty)}</td><td className="text-right tabular-nums">{s.unit_cost !== null ? `${fmtPrice(s.unit_cost)} ${name('currencies', s.currency_id)}` : ''}</td></tr>)}
                </tbody></table></div>
              )}
            </Card>
          )}
          <div className="grid gap-4 xl:grid-cols-2">
            {kinds.map((d, i) => {
              const r = docs[i];
              const items = r.data?.items ?? [];
              return (
                <Card key={d.kind}>
                  <CardHeader icon={d.icon} title={d.plural} subtitle={r.isLoading ? 'Searching…' : `${r.data?.total ?? 0} line(s)`} />
                  {items.length === 0 ? (
                    <p className="px-4 pb-4 text-sm text-muted">{r.isLoading ? '' : 'No matches.'}</p>
                  ) : (
                    <div className="border-t border-line overflow-x-auto"><table className="table-base"><thead><tr><th>Document</th><th>{d.side === 'customer' ? 'Customer' : 'Supplier'}</th><th>Part</th><th className="text-right">Qty</th><th className="text-right">Price</th><th>Status</th></tr></thead><tbody>
                      {items.map((l) => (
                        <tr key={l.id}>
                          <td><Link to={docPath(d.kind, l.doc_id)} className="mono text-brand-700 dark:text-brand-300 hover:underline">{l.doc_no}</Link><p className="text-xs text-faint">{fmtDate(l.doc_date)}</p></td>
                          <td className="max-w-40 truncate">{l.partner_name}</td>
                          <td className="mono">{l.part_number}</td>
                          <td className="text-right tabular-nums">{fmtQty(l.quantity_required)}</td>
                          <td className="text-right tabular-nums">{l.target_price ? `${fmtPrice(l.target_price)} ${name('currencies', l.target_currency_id || l.doc_currency_id)}` : ''}</td>
                          <td><StatusBadge status={l.doc_status} /></td>
                        </tr>
                      ))}
                    </tbody></table></div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
