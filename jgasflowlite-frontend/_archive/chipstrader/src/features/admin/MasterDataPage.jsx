import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Pencil, Archive, ArchiveRestore, ArchiveX, Database, Coins, Save, CircleCheck, ChevronRight } from 'lucide-react';
import { errorMessage, get, patch, post } from '@/lib/api';
import { humanize, fmtDateTime } from '@/lib/format';
import { useMaster, useMe, useProfile } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { Button, Card, Checkbox, EmptyState, Field, Input, PageHeader, Spinner, Tabs, Textarea } from '@/components/ui/core';
import { Modal, useToast } from '@/components/ui/overlay';
import { Badge } from '@/components/ui/status';
import { MasterPicker } from '@/components/ui/pickers';

/**
 * All reference lists, edited from one generic screen driven by the server's
 * catalogue. Entries are archived, never deleted, so old documents keep their
 * values: the Active tab holds what dropdowns offer, the Archived tab what was
 * retired and can be restored.
 */
export default function MasterDataPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useMe();
  const { name } = useMaster();
  const [sp, setSp] = useSearchParams();
  const catalog = useQuery({ queryKey: ['master-catalog'], queryFn: () => get('/master/catalog'), staleTime: Infinity });
  // An unknown or missing ?list= falls back to manufacturers (or the first list).
  const wanted = sp.get('list');
  const key = catalog.data?.some((c) => c.key === wanted) ? wanted : catalog.data?.some((c) => c.key === 'manufacturers') ? 'manufacturers' : catalog.data?.[0]?.key ?? 'manufacturers';
  const tab = sp.get('tab') === 'archived' ? 'archived' : 'active';
  const spec = catalog.data?.find((c) => c.key === key);
  const [filter, setFilter] = useState('');
  const [edit, setEdit] = useState(null);
  const [fx, setFx] = useState(false);
  // One request returns active and archived entries; the tabs split them.
  const rows = useQuery({ queryKey: ['master', key, 'all'], queryFn: () => get(`/master/${key}`, { archived: '1' }), enabled: !!spec });

  const go = (list, nextTab = 'active') => {
    const next = { list };
    if (nextTab === 'archived') next.tab = 'archived';
    setSp(next, { replace: list === key });
    if (list !== key) setFilter('');
  };

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['master', key] });
    qc.invalidateQueries({ queryKey: ['master-bundle'] });
  };
  const toggle = useMutation({
    mutationFn: (r) => post(`/master/${key}/${r.id}/${r.is_deleted ? 'restore' : 'archive'}`),
    onSuccess: (_, r) => (invalidate(), toast.success(r.is_deleted ? 'Restored to active' : 'Moved to archived')),
    onError: (e) => toast.error(errorMessage(e)),
  });

  const fields = useMemo(() => (spec ? Object.entries(spec.fields) : []), [spec]);
  const { active, archived } = useMemo(() => {
    const all = rows.data ?? [];
    return { active: all.filter((r) => !r.is_deleted), archived: all.filter((r) => r.is_deleted) };
  }, [rows.data]);
  const shown = useMemo(() => {
    const f = filter.toLowerCase();
    return (tab === 'archived' ? archived : active).filter((r) => !f || fields.some(([k]) => String(r[k] ?? '').toLowerCase().includes(f)));
  }, [active, archived, filter, fields, tab]);

  if (catalog.isLoading) return <div className="py-24 grid place-items-center"><Spinner /></div>;

  const display = (k, f, v) => {
    if (v === null || v === undefined || v === '') return null;
    if (f.type === 'bool') return v ? <Badge tone="green">Yes</Badge> : <span className="text-faint">No</span>;
    if (f.type === 'ref') return name(f.ref, v) || `#${v}`;
    if (k === 'code' || k === 'iso2' || k === 'iso3') return <span className="mono">{v}</span>;
    return <span className="line-clamp-1">{String(v)}</span>;
  };
  const cols = fields.slice(0, 5);
  const canEdit = can('master.update');

  return (
    <div>
      <PageHeader title="Master data" />
      <div className="grid gap-4 lg:grid-cols-[230px_minmax(0,1fr)]">
        <Card className="p-1.5 h-fit lg:sticky lg:top-[72px]">
          <nav aria-label="Lists" className="flex lg:flex-col gap-0.5 overflow-x-auto">
            {catalog.data.map((c) => {
              const on = key === c.key;
              return (
                <button
                  key={c.key}
                  onClick={() => go(c.key)}
                  aria-current={on ? 'page' : undefined}
                  className={cn(
                    'group relative shrink-0 flex items-center gap-2 text-left pl-3 pr-2 h-9 rounded-lg text-[13.5px] whitespace-nowrap transition-colors',
                    on ? 'bg-cyan-50 text-info font-semibold dark:bg-cyan-500/12 dark:text-cyan-200' : 'text-muted hover:bg-surface-3 hover:text-ink',
                  )}
                >
                  {on && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-cyan-600 dark:bg-cyan-400" />}
                  <span className="flex-1 truncate">{c.label}</span>
                  <ChevronRight className={cn('hidden lg:block size-3.5 shrink-0 transition-opacity', on ? 'opacity-100' : 'opacity-0 group-hover:opacity-60')} />
                </button>
              );
            })}
          </nav>
        </Card>

        <Card className="overflow-hidden min-w-0">
          <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
            <div className="grid place-items-center size-8 rounded-lg bg-cyan-50 text-info dark:bg-cyan-500/12 dark:text-cyan-200 shrink-0"><Database className="size-4" /></div>
            <h2 className="font-semibold text-[15px] mr-auto truncate">{spec?.label}</h2>
            <div className="relative w-full sm:w-56"><Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-faint" /><Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter…" aria-label="Filter entries" className="pl-9 h-8" /></div>
            {key === 'currencies' && can('master.update', 'sys.settings.manage') && <Button size="sm" icon={Coins} onClick={() => setFx(true)}>Exchange rates</Button>}
            {can('master.create') && <Button size="sm" variant="primary" icon={Plus} onClick={() => setEdit({})}>Add</Button>}
          </div>
          <Tabs
            className="px-2 mt-1"
            value={tab}
            onChange={(v) => go(key, v)}
            tabs={[
              { value: 'active', label: 'Active', icon: CircleCheck, count: rows.data ? active.length : undefined },
              { value: 'archived', label: 'Archived', icon: ArchiveX, count: rows.data ? archived.length : undefined },
            ]}
          />

          {rows.isLoading ? (
            <div className="py-16 grid place-items-center"><Spinner /></div>
          ) : !shown.length ? (
            tab === 'archived' ? (
              <EmptyState icon={ArchiveX} title={filter ? 'No archived entries match' : 'No archived entries'} />
            ) : (
              <EmptyState icon={Database} title={filter ? 'No entries match' : 'No entries yet'} action={!filter && can('master.create') && <Button variant="primary" icon={Plus} onClick={() => setEdit({})}>Add</Button>} />
            )
          ) : (
            <div className="overflow-auto max-h-[calc(100vh-260px)]">
              <table className="table-base">
                <thead>
                  <tr>
                    {cols.map(([k]) => <th key={k}>{humanize(k.replace(/_id$/, ''))}</th>)}
                    {key === 'currencies' && <th className="text-right">Rate to main</th>}
                    {tab === 'archived' && <th>Status</th>}
                    <th className="w-28" />
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.id} className={cn(r.is_deleted && 'text-muted')}>
                      {cols.map(([k, f]) => <td key={k} className="max-w-64">{display(k, f, r[k])}</td>)}
                      {key === 'currencies' && <td className="text-right tabular-nums">{r.rate_to_main ?? ''}</td>}
                      {tab === 'archived' && (
                        <td><Badge tone="slate" className="gap-1"><ArchiveX className="size-3" />Archived</Badge></td>
                      )}
                      <td>
                        {canEdit && (
                          <div className="flex justify-end gap-1">
                            {tab === 'active' ? (
                              <>
                                <Button variant="ghost" size="sm" icon={Pencil} onClick={() => setEdit(r)} aria-label="Edit" title="Edit" />
                                <Button variant="ghost" size="sm" icon={Archive} onClick={() => toggle.mutate(r)} aria-label="Archive" title="Archive" className="hover:text-warning" />
                              </>
                            ) : (
                              <Button size="sm" icon={ArchiveRestore} onClick={() => toggle.mutate(r)} className="text-success" title="Restore to active">Restore</Button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
      {edit && spec && <EditRow spec={spec} row={edit} onClose={() => setEdit(null)} onDone={invalidate} />}
      {fx && <FxDialog rows={rows.data ?? []} onClose={() => setFx(false)} onDone={invalidate} />}
    </div>
  );
}

function EditRow({ spec, row, onClose, onDone }) {
  const toast = useToast();
  const isNew = !row.id;
  const [f, setF] = useState(() => Object.fromEntries(Object.entries(spec.fields).map(([k, x]) => [k, row[k] ?? (x.type === 'bool' ? 0 : '')])));
  const m = useMutation({
    mutationFn: () => (isNew ? post(`/master/${spec.key}`, f) : patch(`/master/${spec.key}/${row.id}`, f)),
    onSuccess: () => (onDone(), toast.success('Saved'), onClose()),
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Modal open onClose={onClose} title={`${isNew ? 'Add' : 'Edit'} ${spec.label.replace(/s$/, '').toLowerCase()}`} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={m.isPending} onClick={() => m.mutate()}>Save</Button></>}>
      <div className="grid sm:grid-cols-2 gap-3.5">
        {Object.entries(spec.fields).map(([k, x]) => (
          <Field key={k} label={humanize(k.replace(/_id$/, ''))} required={x.required} span={x.type === 'text' ? 'full' : undefined}>
            {(id) =>
              x.type === 'bool' ? <Checkbox label="Yes" checked={!!f[k]} onChange={(v) => setF({ ...f, [k]: v ? 1 : 0 })} />
                : x.type === 'ref' ? <MasterPicker id={id} list={x.ref} value={f[k]} onChange={(v) => setF({ ...f, [k]: v })} />
                : x.type === 'text' ? <Textarea id={id} rows={2} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
                : <Input id={id} type={x.type === 'int' || x.type === 'number' ? 'number' : 'text'} step="any" maxLength={x.max} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
            }
          </Field>
        ))}
      </div>
    </Modal>
  );
}

function FxDialog({ rows, onClose, onDone }) {
  const toast = useToast();
  const { data: profile } = useProfile();
  const { name } = useMaster();
  const mainCode = name('currencies', profile?.default_currency_id) || 'EUR';
  const [rates, setRates] = useState(() => Object.fromEntries(rows.filter((r) => !r.is_deleted).map((r) => [r.id, r.rate_to_main ?? ''])));
  const m = useMutation({
    mutationFn: () => post('/master/currencies/rates', { rates: Object.entries(rates).map(([id, v]) => ({ id: Number(id), rate_to_main: v === '' ? null : Number(v) })) }),
    onSuccess: () => (onDone(), toast.success('Exchange rates saved'), onClose()),
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Modal open onClose={onClose} size="lg" icon={Coins} title="Exchange rates" subtitle={`1 ${mainCode} = X of each currency. Used for every conversion and the dashboard.`} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" icon={Save} loading={m.isPending} onClick={() => m.mutate()}>Save rates</Button></>}>
      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
        {rows.filter((r) => !r.is_deleted).map((r) => (
          <label key={r.id} className="flex items-center gap-3">
            <span className="mono w-12 font-semibold">{r.code}</span>
            <span className="text-xs text-muted flex-1 truncate">{r.name}</span>
            <Input type="number" step="any" min="0" className="h-8 w-32 text-right" value={rates[r.id]} onChange={(e) => setRates({ ...rates, [r.id]: e.target.value })} disabled={r.code === mainCode} />
          </label>
        ))}
      </div>
      <p className="text-xs text-faint mt-3">{rows[0]?.rate_updated_at && `Most recent: ${fmtDateTime(rows.map((r) => r.rate_updated_at).filter(Boolean).sort().at(-1))}`}</p>
    </Modal>
  );
}
