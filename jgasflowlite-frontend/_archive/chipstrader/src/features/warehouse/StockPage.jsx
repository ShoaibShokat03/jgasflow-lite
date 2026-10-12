import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Boxes, Plus, Search, Layers, PackageOpen, Lock } from 'lucide-react';
import { errorMessage, get, post } from '@/lib/api';
import { fmtCompact, fmtDate, fmtPrice, fmtQty, humanize } from '@/lib/format';
import { useDebounced, useListParams, useMaster, useMe } from '@/lib/hooks';
import { compact, nullify } from '@/lib/utils';
import { Button, Checkbox, ClearFilters, EmptyState, Field, Input, PageHeader, Select, StatTile, Textarea } from '@/components/ui/core';
import { DataTable, Pagination } from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/status';
import { Modal, useToast } from '@/components/ui/overlay';
import { CompanyPicker, MasterPicker, MasterSelect } from '@/components/ui/pickers';

export default function StockPage() {
  const navigate = useNavigate();
  const { can } = useMe();
  const { name } = useMaster();
  const [sp, setSp] = useSearchParams();
  const [params, set] = useListParams(sp, setSp, { page: '1' });
  const [pnInput, setPnInput] = useState(params.pn ?? '');
  const pn = useDebounced(pnInput);
  const newOpen = sp.get('new') === '1';
  const setNewOpen = (v) => {
    if (v) sp.set('new', '1');
    else sp.delete('new');
    setSp(sp);
  };
  useEffect(() => {
    if ((params.pn ?? '') !== pn) set({ pn });
  }, [pn]); // eslint-disable-line react-hooks/exhaustive-deps

  const summary = useQuery({ queryKey: ['stock', 'summary'], queryFn: () => get('/stock/summary') });
  const q = useQuery({ queryKey: ['stock', 'list', params], queryFn: () => get('/stock', compact({ ...params, limit: 50 })), placeholderData: keepPreviousData });
  const s = summary.data;

  const columns = [
    { key: 'part_number', header: 'Part number', sort: 'part_number', mobile: true, render: (r) => <div><p className="mono font-semibold">{r.part_number}</p><p className="text-xs text-muted">{name('manufacturers', r.manufacturer_id)}</p></div> },
    { key: 'stock_no', header: 'Lot', sort: 'stock_no', render: (r) => <span className="mono text-xs">{r.stock_no}</span> },
    { key: 'date_code', header: 'DC', render: (r) => r.date_code || '' },
    { key: 'loc', header: 'Location', render: (r) => <span className="text-xs text-muted">{[name('warehouses', r.warehouse_id), r.bin_location].filter(Boolean).join(' · ') || ''}</span> },
    { key: 'on_hand', header: 'On hand', sort: 'quantity_on_hand', align: 'right', render: (r) => fmtQty(r.quantity_on_hand) },
    { key: 'allocated', header: 'Allocated', align: 'right', render: (r) => (Number(r.quantity_allocated) ? <span className="text-warning">{fmtQty(r.quantity_allocated)}</span> : <span className="text-faint">0</span>) },
    { key: 'available', header: 'Available', align: 'right', mobile: true, render: (r) => <span className="font-semibold">{fmtQty(r.available_qty)}</span> },
    { key: 'cost', header: 'Unit cost', align: 'right', render: (r) => (r.unit_cost !== null ? `${fmtPrice(r.unit_cost)} ${name('currencies', r.currency_id)}` : '') },
    { key: 'received_at', header: 'Received', sort: 'received_at', render: (r) => fmtDate(r.received_at) },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
  ];

  return (
    <div>
      <PageHeader title="Stock" actions={can('stock.adjust') && <Button variant="primary" icon={Plus} onClick={() => setNewOpen(true)}>Add stock</Button>} />
      {s && (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-4">
          <StatTile label="Distinct parts" value={fmtCompact(s.parts)} icon={Layers} />
          <StatTile label="Lots" value={fmtCompact(s.lots)} icon={Boxes} tone="cyan" />
          <StatTile label="Pieces on hand" value={fmtCompact(s.on_hand)} icon={PackageOpen} tone="green" />
          <StatTile label="Pieces allocated" value={fmtCompact(s.allocated)} icon={Lock} tone="amber" />
        </div>
      )}
      <div className="card p-3 mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-56">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-faint" />
          <Input value={pnInput} onChange={(e) => setPnInput(e.target.value)} placeholder="Part number…" className="pl-9 mono" autoFocus />
        </div>
        <div className="w-52"><MasterPicker list="manufacturers" value={params.manufacturer_id} onChange={(v) => set({ manufacturer_id: v ?? '' })} placeholder="Any manufacturer" /></div>
        <div className="w-44"><MasterSelect list="warehouses" value={params.warehouse_id} onChange={(v) => set({ warehouse_id: v ?? '' })} placeholder="Any warehouse" /></div>
        <Select value={params.status ?? ''} onChange={(e) => set({ status: e.target.value })} className="w-40" placeholder="Current stock">
          {['available', 'on_hold', 'quarantine', 'damaged', 'depleted', 'cancelled'].map((x) => <option key={x} value={x}>{humanize(x)}</option>)}
        </Select>
        <Checkbox label="Available only" checked={params.available_only === '1'} onChange={(v) => set({ available_only: v ? '1' : '' })} className="px-2" />
        <ClearFilters
          active={!!(params.pn || params.manufacturer_id || params.warehouse_id || params.status || params.available_only)}
          onClear={() => {
            setPnInput('');
            setSp({});
          }}
        />
      </div>
      <DataTable
        columns={columns}
        rows={q.data?.items}
        loading={q.isLoading}
        dense
        onRowClick={(r) => navigate(`/stock/${r.id}`)}
        sort={{ by: params.sort_by, order: params.sort_order }}
        onSort={(by, order) => set({ sort_by: by, sort_order: order })}
        empty={<EmptyState icon={Boxes} title={params.pn ? `No stock for “${params.pn}”` : 'No stock yet'}>Receive a purchase order, or add opening stock.</EmptyState>}
        footer={<Pagination page={params.page} totalPages={q.data?.total_pages} total={q.data?.total} onPage={(p) => set({ page: String(p) })} label="lots" />}
      />
      {newOpen && <NewStockDialog onClose={() => setNewOpen(false)} />}
    </div>
  );
}

function NewStockDialog({ onClose }) {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [f, setF] = useState({ part_number: '', manufacturer_id: null, quantity: '', unit_cost: '', currency_id: null, date_code: '', batch_no: '', warehouse_id: null, bin_location: '', supplier_company_id: null, package_type_id: null, coo_country_id: null, description: '', notes: '' });
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v?.target ? v.target.value : v }));
  const m = useMutation({
    mutationFn: () => post('/stock', compact({ ...nullify(f), quantity: Number(f.quantity), unit_cost: f.unit_cost === '' ? undefined : Number(f.unit_cost) })),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['stock'] });
      toast.success(`${r.stock_no} added`);
      navigate(`/stock/${r.id}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Modal open onClose={onClose} size="lg" icon={Boxes} title="Add stock" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={m.isPending} disabled={!f.part_number || !(Number(f.quantity) > 0)} onClick={() => m.mutate()}>Add stock</Button></>}>
      <div className="grid sm:grid-cols-3 gap-3.5">
        <Field label="Part number" required>{(id) => <Input id={id} autoFocus className="mono uppercase" value={f.part_number} onChange={set('part_number')} />}</Field>
        <Field label="Manufacturer">{(id) => <MasterPicker id={id} list="manufacturers" value={f.manufacturer_id} onChange={set('manufacturer_id')} />}</Field>
        <Field label="Quantity" required>{(id) => <Input id={id} type="number" min="0" step="any" value={f.quantity} onChange={set('quantity')} />}</Field>
        <Field label="Unit cost">{(id) => <Input id={id} type="number" min="0" step="any" value={f.unit_cost} onChange={set('unit_cost')} />}</Field>
        <Field label="Cost currency">{(id) => <MasterSelect id={id} list="currencies" value={f.currency_id} onChange={set('currency_id')} />}</Field>
        <Field label="Date code">{(id) => <Input id={id} value={f.date_code} onChange={set('date_code')} />}</Field>
        <Field label="Warehouse">{(id) => <MasterSelect id={id} list="warehouses" value={f.warehouse_id} onChange={set('warehouse_id')} />}</Field>
        <Field label="Bin">{(id) => <Input id={id} value={f.bin_location} onChange={set('bin_location')} />}</Field>
        <Field label="Batch / lot">{(id) => <Input id={id} value={f.batch_no} onChange={set('batch_no')} />}</Field>
        <Field label="Package">{(id) => <MasterPicker id={id} list="packages" value={f.package_type_id} onChange={set('package_type_id')} />}</Field>
        <Field label="Country of origin">{(id) => <MasterPicker id={id} list="countries" value={f.coo_country_id} onChange={set('coo_country_id')} />}</Field>
        <Field label="Supplier">{(id) => <CompanyPicker id={id} type="supplier" value={f.supplier_company_id} onChange={set('supplier_company_id')} placeholder="None" />}</Field>
        <Field label="Notes" span="full">{(id) => <Textarea id={id} rows={2} value={f.notes} onChange={set('notes')} />}</Field>
      </div>
    </Modal>
  );
}
