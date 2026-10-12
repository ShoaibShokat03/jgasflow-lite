import { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Plus, Upload, Download, Pencil, Trash2, FileSpreadsheet, Leaf } from 'lucide-react';
import { errorMessage, openBlob, patch, post, upload } from '@/lib/api';
import { fmtMoney, fmtPrice, fmtQty, fmtDate } from '@/lib/format';
import { useMaster } from '@/lib/hooks';
import { Button, Card, EmptyState, Field, Input, Select, Textarea } from '@/components/ui/core';
import { ConfirmDialog, Modal, useToast } from '@/components/ui/overlay';
import { MasterPicker, MasterSelect } from '@/components/ui/pickers';
import { Badge, StatusBadge, Progress } from '@/components/ui/status';
import { DOCS } from './doc-types';

const blankQuick = { part_number: '', manufacturer_id: null, quantity_required: '', target_price: '' };

export default function LinesPanel({ kind, doc, onChange }) {
  const cfg = DOCS[kind];
  const toast = useToast();
  const { name } = useMaster();
  const [quick, setQuick] = useState(blankQuick);
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const pnRef = useRef(null);
  const fileRef = useRef(null);
  const editable = doc.can.update;
  const currency = doc.totals.currency;

  const addLine = useMutation({
    mutationFn: (body) => post(`${cfg.api}/${doc.id}/lines`, body),
    onSuccess: () => {
      onChange();
      setQuick(blankQuick);
      pnRef.current?.focus();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (line) => post(`${cfg.api}/${doc.id}/lines/${line.id}/remove`),
    onSuccess: () => {
      onChange();
      setRemoving(null);
      toast.success('Line removed');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const importCsv = useMutation({
    mutationFn: (file) => upload(`${cfg.api}/${doc.id}/import`, file),
    onSuccess: (r) => {
      onChange();
      setImportResult(r);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const submitQuick = (e) => {
    e.preventDefault();
    if (!quick.part_number.trim() || !(Number(quick.quantity_required) > 0)) return toast.warning('Part number and a quantity are required');
    addLine.mutate({
      part_number: quick.part_number,
      manufacturer_id: quick.manufacturer_id || undefined,
      quantity_required: Number(quick.quantity_required),
      target_price: quick.target_price === '' ? undefined : Number(quick.target_price),
    });
  };

  const showFulfil = kind === 'sales_order' || kind === 'purchase_order';

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-line">
        <div>
          <h3 className="font-semibold text-[14px]">Lines</h3>
          <p className="text-xs text-muted">{doc.lines.length} part{doc.lines.length === 1 ? '' : 's'} · prices in {currency}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" icon={Download} onClick={() => openBlob(`${cfg.api}/csv-template`, { download: true, filename: `${cfg.route}-template.csv` })}>
            Template
          </Button>
          {editable && (
            <>
              <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => e.target.files[0] && importCsv.mutate(e.target.files[0], { onSettled: () => (e.target.value = '') })} />
              <Button size="sm" icon={Upload} loading={importCsv.isPending} onClick={() => fileRef.current?.click()}>
                Import CSV
              </Button>
              <Button size="sm" variant="primary" icon={Plus} onClick={() => setEditing({})}>
                Add line
              </Button>
            </>
          )}
        </div>
      </div>

      {editable && (
        <form onSubmit={submitQuick} className="grid grid-cols-2 md:grid-cols-[1.4fr_1.2fr_.7fr_.7fr_auto] gap-2 px-4 py-3 bg-surface-2 border-b border-line">
          <Input ref={pnRef} placeholder="Part number" value={quick.part_number} onChange={(e) => setQuick({ ...quick, part_number: e.target.value })} className="mono uppercase col-span-2 md:col-span-1" />
          <MasterPicker list="manufacturers" value={quick.manufacturer_id} onChange={(v) => setQuick({ ...quick, manufacturer_id: v })} placeholder="Manufacturer" />
          <Input type="number" min="0" step="any" placeholder="Qty" value={quick.quantity_required} onChange={(e) => setQuick({ ...quick, quantity_required: e.target.value })} />
          <Input type="number" min="0" step="any" placeholder={`Price ${currency}`} value={quick.target_price} onChange={(e) => setQuick({ ...quick, target_price: e.target.value })} />
          <Button type="submit" variant="primary" icon={Plus} loading={addLine.isPending} className="col-span-2 md:col-span-1">
            Add
          </Button>
        </form>
      )}

      {doc.lines.length === 0 ? (
        <EmptyState icon={FileSpreadsheet} title="No lines yet">
          {editable ? 'Type a part number above and press Enter, or import a CSV for long lists.' : 'This document has no lines.'}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th className="w-10">#</th>
                <th>Part</th>
                <th>Details</th>
                <th className="text-right">Qty</th>
                <th className="text-right">Unit price</th>
                <th className="text-right">Line total</th>
                {showFulfil && <th className="w-36">{kind === 'sales_order' ? 'Shipped' : 'Received'}</th>}
                {cfg.lineStatus && <th>Status</th>}
                {editable && <th className="w-20" />}
              </tr>
            </thead>
            <tbody>
              {doc.lines.map((l) => {
                const done = kind === 'sales_order' ? Number(l.shipped_qty) : Number(l.received_qty);
                return (
                  <tr key={l.id} className="group">
                    <td className="text-faint tabular-nums">{l.line_no}</td>
                    <td>
                      <p className="mono font-semibold">{l.part_number}</p>
                      <p className="text-xs text-muted">{name('manufacturers', l.manufacturer_id) || ''}{l.customer_part_number && <> · CPN <span className="mono">{l.customer_part_number}</span></>}</p>
                    </td>
                    <td className="text-xs text-muted">
                      <div className="flex flex-wrap gap-1 max-w-72">
                        {l.date_code && <Badge>DC {l.date_code}</Badge>}
                        {l.package_type_id && <Badge>{name('packages', l.package_type_id)}</Badge>}
                        {l.packaging_id && <Badge>{name('packaging', l.packaging_id)}</Badge>}
                        {l.lifecycle_status_id && <Badge tone="violet">{name('lifecycle', l.lifecycle_status_id)}</Badge>}
                        {!!l.rohs_required && <Badge tone="green"><Leaf className="size-3" />RoHS</Badge>}
                        {l.lead_time && <Badge tone="cyan">LT {l.lead_time}</Badge>}
                        {l.required_by_date && <Badge tone="amber">Due {fmtDate(l.required_by_date)}</Badge>}
                      </div>
                      {l.description && <p className="mt-1 line-clamp-1">{l.description}</p>}
                    </td>
                    <td className="text-right tabular-nums font-medium">{fmtQty(l.quantity_required)}</td>
                    <td className="text-right tabular-nums">
                      {l.target_price ? fmtPrice(l.target_price) : null}
                      {l.target_currency_id && l.target_currency_id !== doc.currency_id && <span className="text-xs text-warning"> {name('currencies', l.target_currency_id)}</span>}
                    </td>
                    <td className="text-right tabular-nums">{l.target_price ? fmtMoney(Number(l.quantity_required) * Number(l.target_price)) : null}</td>
                    {showFulfil && (
                      <td>
                        <div className="flex items-center gap-2">
                          <Progress value={done} max={Number(l.quantity_required)} tone={done >= Number(l.quantity_required) ? 'green' : 'brand'} />
                          <span className="text-xs text-muted tabular-nums whitespace-nowrap">{fmtQty(done)}</span>
                        </div>
                        {kind === 'sales_order' && Number(l.allocated_qty) > 0 && <p className="text-[11px] text-faint mt-0.5">{fmtQty(l.allocated_qty)} allocated</p>}
                      </td>
                    )}
                    {cfg.lineStatus && <td><StatusBadge status={l.status} /></td>}
                    {editable && (
                      <td>
                        <div className="flex justify-end gap-0.5">
                          <Button variant="ghost" size="sm" icon={Pencil} onClick={() => setEditing(l)} aria-label="Edit line" />
                          <Button variant="ghost" size="sm" icon={Trash2} onClick={() => setRemoving(l)} aria-label="Remove line" />
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && <LineDialog kind={kind} doc={doc} line={editing} onClose={() => setEditing(null)} onSaved={onChange} />}

      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        danger
        loading={remove.isPending}
        title={`Remove line ${removing?.line_no}?`}
        message={`${removing?.part_number} will be removed from this ${cfg.label.toLowerCase()}.`}
        confirmLabel="Remove"
        onConfirm={() => remove.mutate(removing)}
      />

      <Modal open={!!importResult} onClose={() => setImportResult(null)} title="CSV import finished" size="sm" footer={<Button variant="primary" onClick={() => setImportResult(null)}>Done</Button>}>
        <p className="text-sm">
          <span className="font-semibold text-success">{importResult?.imported}</span> line{importResult?.imported === 1 ? '' : 's'} imported.
        </p>
        {importResult?.errors?.length > 0 && (
          <div className="mt-3">
            <p className="text-sm font-medium text-danger mb-1">{importResult.errors.length} row(s) skipped:</p>
            <ul className="text-xs text-muted max-h-48 overflow-y-auto space-y-0.5">
              {importResult.errors.map((e, i) => (
                <li key={i}>Row {e.row}: {e.message}</li>
              ))}
            </ul>
          </div>
        )}
      </Modal>
    </Card>
  );
}

function LineDialog({ kind, doc, line, onClose, onSaved }) {
  const cfg = DOCS[kind];
  const toast = useToast();
  const isNew = !line.id;
  const [f, setF] = useState({
    part_number: '', customer_part_number: '', description: '', manufacturer_id: null, product_category_id: null, package_type_id: null,
    packaging_id: null, reel_size_id: null, lifecycle_status_id: null, date_code: '', coo_country_id: null, rohs_required: 0,
    quantity_required: '', quantity_uom_id: null, target_price: '', target_currency_id: null, required_by_date: '', lead_time: '', notes: '',
    status: 'draft',
    ...Object.fromEntries(Object.entries(line).map(([k, v]) => [k, v ?? (typeof v === 'number' ? v : '')])),
  });
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v?.target ? (v.target.type === 'checkbox' ? (v.target.checked ? 1 : 0) : v.target.value) : v }));

  const save = useMutation({
    mutationFn: () => {
      const body = {};
      for (const k of ['part_number', 'customer_part_number', 'description', 'manufacturer_id', 'product_category_id', 'package_type_id', 'packaging_id', 'reel_size_id', 'lifecycle_status_id', 'date_code', 'coo_country_id', 'rohs_required', 'quantity_required', 'quantity_uom_id', 'target_price', 'target_currency_id', 'required_by_date', 'lead_time', 'notes', ...(cfg.lineStatus ? ['status'] : [])]) {
        const v = f[k];
        body[k] = v === '' ? null : ['quantity_required', 'target_price'].includes(k) && v !== null ? Number(v) : v;
      }
      return isNew ? post(`${cfg.api}/${doc.id}/lines`, body) : patch(`${cfg.api}/${doc.id}/lines/${line.id}`, body);
    },
    onSuccess: () => {
      onSaved();
      toast.success(isNew ? 'Line added' : 'Line saved');
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={isNew ? 'Add line' : `Edit line ${line.line_no}`}
      subtitle={!isNew ? line.part_number : undefined}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={save.isPending} disabled={!f.part_number || f.quantity_required === ''} onClick={() => save.mutate()}>
            {isNew ? 'Add line' : 'Save line'}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="grid sm:grid-cols-3 gap-3"
      >
        <Field label="Part number (MPN)" required>{(id) => <Input id={id} autoFocus className="mono uppercase" value={f.part_number} onChange={set('part_number')} />}</Field>
        <Field label="Customer part no. (CPN)">{(id) => <Input id={id} className="mono" value={f.customer_part_number} onChange={set('customer_part_number')} />}</Field>
        <Field label="Manufacturer">{(id) => <MasterPicker id={id} list="manufacturers" value={f.manufacturer_id} onChange={set('manufacturer_id')} />}</Field>
        <Field label="Quantity" required>{(id) => <Input id={id} type="number" min="0" step="any" value={f.quantity_required} onChange={set('quantity_required')} />}</Field>
        <Field label="Unit price">{(id) => <Input id={id} type="number" min="0" step="any" value={f.target_price} onChange={set('target_price')} />}</Field>
        <Field label="Price currency" hint="Leave empty for the document currency.">{(id) => <MasterSelect id={id} list="currencies" value={f.target_currency_id} onChange={set('target_currency_id')} placeholder="Document currency" />}</Field>
        <Field label="Date code">{(id) => <Input id={id} value={f.date_code} onChange={set('date_code')} placeholder="e.g. 2024+" />}</Field>
        <Field label="Package">{(id) => <MasterPicker id={id} list="packages" value={f.package_type_id} onChange={set('package_type_id')} />}</Field>
        <Field label="Packaging">{(id) => <MasterSelect id={id} list="packaging" value={f.packaging_id} onChange={set('packaging_id')} />}</Field>
        <Field label="Lifecycle">{(id) => <MasterSelect id={id} list="lifecycle" value={f.lifecycle_status_id} onChange={set('lifecycle_status_id')} />}</Field>
        <Field label="Country of origin">{(id) => <MasterPicker id={id} list="countries" value={f.coo_country_id} onChange={set('coo_country_id')} />}</Field>
        <Field label="Category">{(id) => <MasterPicker id={id} list="categories" value={f.product_category_id} onChange={set('product_category_id')} />}</Field>
        <Field label="Reel size">{(id) => <MasterSelect id={id} list="reel-sizes" value={f.reel_size_id} onChange={set('reel_size_id')} />}</Field>
        <Field label="Unit">{(id) => <MasterSelect id={id} list="uoms" value={f.quantity_uom_id} onChange={set('quantity_uom_id')} placeholder="Pieces" />}</Field>
        <Field label="Required by">{(id) => <Input id={id} type="date" value={f.required_by_date} onChange={set('required_by_date')} />}</Field>
        <Field label="Lead time">{(id) => <Input id={id} value={f.lead_time} onChange={set('lead_time')} placeholder="e.g. 4-6 weeks" />}</Field>
        {cfg.lineStatus && (
          <Field label="Line status">
            {(id) => (
              <Select id={id} value={f.status} onChange={set('status')}>
                {['draft', 'sent', 'accepted', 'rejected', 'expired'].map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
              </Select>
            )}
          </Field>
        )}
        <Field label=" " className="flex items-end">
          <label className="flex items-center gap-2 h-9 text-[13px]">
            <input type="checkbox" className="size-4 accent-brand-600" checked={!!f.rohs_required} onChange={set('rohs_required')} /> RoHS required
          </label>
        </Field>
        <Field label="Description" span="full">{(id) => <Input id={id} value={f.description} onChange={set('description')} />}</Field>
        <Field label="Notes" span="full">{(id) => <Textarea id={id} rows={2} value={f.notes} onChange={set('notes')} />}</Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
