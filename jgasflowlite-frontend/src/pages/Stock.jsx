import { useEffect, useState } from 'react';
import { Check, ClipboardList, Cylinder, Flame, History, PackagePlus, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, useAct, useGet } from '@/lib/api';
import { moveColumns, stockColumns } from '@/features/exports';
import { ExportMenu } from '@/ui/ExportMenu';
import { fDateShort, fTime, lossPerCylinder, MAX_UNIT_PRICE, money, num0, numInput, parseNum } from '@/lib/format';
import { moveLabel, t } from '@/lib/i18n';
import { Async, Button, Card, cn, Empty, IconBox, PageHeader, SectionHeader, StatTile, Tag } from '@/ui/kit';
import { Chips, MoneyInput, QtyStepper, Switch, TextInput } from '@/ui/form';
import { Modal, toast, useConfirm } from '@/ui/overlay';
import { StockValueTiles } from '@/ui/StockValue';

export default function Stock() {
  const types = useGet('/types', { all: 1 });
  const [form, setForm] = useState(null); // 'new' | type
  const [adjust, setAdjust] = useState(null);
  const [fill, setFill] = useState(null);
  const confirm = useConfirm();
  const del = useAct((uid) => api.delete(`/types/${uid}`), {
    onSuccess: (r) => toast(r.deleted ? t('deleted') : t('type_hidden_web')),
    onError: (e) => toast(e.message, 'error'),
  });

  const remove = async (ty) => {
    const msg = `${t('delete_type_msg')}\n\n${t('delete_type_stock')} ${ty.full_qty} ${t('full')}, ${ty.empty_qty} ${t('empty')}\n${t('delete_type_used_web')}`;
    if (await confirm({ title: `${t('delete')} ${ty.name}?`, message: msg, okLabel: t('delete'), danger: true })) del.mutate(ty.uid);
  };

  return (
    <div>
      <PageHeader
        title={t('stock_cylinders')}
        actions={
          <>
            <ExportMenu title={t('x_stock')} columns={stockColumns} rows={types.data} />
            <Button variant="outline" icon={Plus} onClick={() => setForm('new')}>
              {t('add_cylinder_type')}
            </Button>
            <Button icon={PackagePlus} to="/app/purchases/new">
              {t('new_purchase')}
            </Button>
          </>
        }
      />
      <Async q={types}>
        {(list) => {
          const live = list.filter((x) => x.active);
          return (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <StatTile label={t('ready_to_sell')} value={num0(live.reduce((a, x) => a + x.full_qty, 0))} icon={Cylinder} color="#020033" />
                <StatTile label={t('to_refill')} value={num0(live.reduce((a, x) => a + x.empty_qty, 0))} icon={Cylinder} color="#B77D00" />
                <StatTile label={t('with_customers')} value={num0(live.reduce((a, x) => a + x.with_customers, 0))} icon={Cylinder} color="#6A3FB5" />
                <StatTile label={t('total_owned')} value={num0(live.reduce((a, x) => a + x.full_qty + x.empty_qty + x.with_customers, 0))} icon={ClipboardList} color="#2E7D32" />
              </div>
              <StockValueTiles list={list} className="mt-2.5" />
              <SectionHeader title={t('manage_cylinder_types')} />
              <div className="grid md:grid-cols-2 gap-3">
                {list.map((ty) => (
                  <Card key={ty.uid} className={cn('p-4', !ty.active && 'opacity-70')}>
                    <div className="flex items-start gap-3">
                      <IconBox icon={Cylinder} color={ty.is_low && ty.active ? '#C62828' : '#020033'} size={40} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-[15px]">{ty.name}</span>
                          {!ty.active && <Tag tone="gray">{t('inactive')}</Tag>}
                          {ty.active && ty.is_low && <Tag tone="red">{t('low')}</Tag>}
                        </div>
                        <div className="text-[12.5px] text-muted">
                          {ty.unit === 'kg' ? `${t('sale_price')} ${money(ty.price)}/${t('kg')}` : `${t('sale_price')} ${money(ty.price)} · ${t('security')} ${money(ty.deposit)}`}
                        </div>
                        {(ty.unit === 'kg' ? ty.gas_kg : ty.full_qty) > 0 && (
                          <div className="text-[12.5px] text-muted whitespace-nowrap">
                            {t('stock_value')}: <b className="text-ink num">{money((ty.unit === 'kg' ? ty.gas_kg : ty.full_qty) * (ty.purchase_price || 0))}</b>
                          </div>
                        )}
                      </div>
                    </div>
                    {ty.unit === 'kg' ? (
                      <div className="grid grid-cols-3 gap-2 mt-3">
                        <Count label={t('gas_kg_label')} value={ty.gas_kg} tone="text-primary" />
                        <Count label={t('low_stock_alert')} value={ty.low_level} tone="text-muted" />
                        <div />
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 gap-2 mt-3">
                        <Count label={t('stock_full')} value={ty.full_qty} tone="text-primary" />
                        <Count label={t('stock_empty')} value={ty.empty_qty} tone="text-warn" />
                        <Count label={t('with_customers')} value={ty.with_customers} tone="text-purple" />
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2 mt-3">
                      {ty.unit === 'kg' && (
                        <Button size="sm" icon={Flame} onClick={() => setFill(ty)}>
                          {t('fill_from_cyl')}
                        </Button>
                      )}
                      <Button size="sm" variant="soft" icon={ClipboardList} onClick={() => setAdjust(ty)}>
                        {t('adjust_stock')}
                      </Button>
                      <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setForm(ty)}>
                        {t('edit')}
                      </Button>
                      <Button size="sm" variant="danger-outline" icon={Trash2} className="ml-auto" onClick={() => remove(ty)} aria-label={t('delete')} title={t('delete')} />
                    </div>
                  </Card>
                ))}
              </div>
              <Moves types={list} />
            </>
          );
        }}
      </Async>
      <TypeForm open={!!form} initial={form === 'new' ? null : form} onClose={() => setForm(null)} />
      <AdjustStock type={adjust} onClose={() => setAdjust(null)} />
      <FillGas gas={fill} types={types.data ?? []} onClose={() => setFill(null)} />
    </div>
  );
}

function Count({ label, value, tone }) {
  return (
    <div className="rounded-[var(--radius-ctl)] bg-bg px-2.5 py-2 min-w-0">
      <div className={cn('text-[18px] font-extrabold num whitespace-nowrap', tone)}>{num0(value)}</div>
      <div className="text-[11.5px] text-muted truncate">{label}</div>
    </div>
  );
}

function Moves({ types }) {
  const [type, setType] = useState('');
  const moves = useGet('/stock/moves', { type });
  return (
    <>
      <SectionHeader
        title={t('stock_history')}
        action={<ExportMenu title={t('x_stock_history')} columns={moveColumns} rows={moves.data} all={() => api.get('/stock/moves', { params: { limit: 50000 } })} />}
      />
      <Chips className="mb-3" size="sm" value={type} onChange={setType} options={[{ value: '', label: t('all') }, ...types.map((x) => ({ value: x.uid, label: x.name }))]} />
      <Async q={moves}>
        {(rows) => (
          <Card className="overflow-hidden">
            {rows.length === 0 ? (
              <Empty icon={History} title={t('no_stock_moves')} />
            ) : (
              <div className="divide-rows">
                {rows.map((m) => (
                  <div key={m.uid} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold truncate">
                        {m.type_name} · {moveLabel(m.reason)}
                      </div>
                      <div className="text-[12px] text-muted truncate">
                        {fDateShort(m.date)}, {fTime(m.date)}
                        {m.ref ? ` · ${m.ref}` : ''}
                      </div>
                    </div>
                    <div className="text-right text-[12.5px] num whitespace-nowrap">
                      {Number(m.kg_delta) !== 0 && (
                        <div className={m.kg_delta > 0 ? 'text-good font-bold' : 'text-bad font-bold'}>
                          {m.kg_delta > 0 ? '+' : ''}
                          {num0(m.kg_delta)} {t('kg')}
                        </div>
                      )}
                      {m.full_delta !== 0 && (
                        <div className={m.full_delta > 0 ? 'text-good font-bold' : 'text-bad font-bold'}>
                          {m.full_delta > 0 ? '+' : ''}
                          {m.full_delta} {t('full')}
                        </div>
                      )}
                      {m.empty_delta !== 0 && (
                        <div className="text-muted font-semibold">
                          {m.empty_delta > 0 ? '+' : ''}
                          {m.empty_delta} {t('empty')}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
      </Async>
    </>
  );
}

function AdjustStock({ type, onClose }) {
  const [full, setFull] = useState(0);
  const [empty, setEmpty] = useState(0);
  const [kg, setKg] = useState('');
  const [note, setNote] = useState('');
  const byKg = type?.unit === 'kg';
  useEffect(() => {
    if (type) {
      setFull(type.full_qty);
      setEmpty(type.empty_qty);
      setKg(numInput(type.gas_kg));
      setNote('');
    }
  }, [type]);
  const save = useAct((b) => api.post(`/types/${type.uid}/stock`, b), {
    onSuccess: () => {
      toast(t('saved'));
      onClose();
    },
    onError: (e) => toast(e.message, 'error'),
  });
  return (
    <Modal
      open={!!type}
      onClose={onClose}
      title={`${t('adjust_stock')} · ${type?.name ?? ''}`}
      icon={ClipboardList}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button icon={Check} loading={save.isPending} onClick={() => save.mutate(byKg ? { kg: parseNum(kg), note } : { full, empty, note })}>
            {t('save')}
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <p className="text-[13px] text-muted">{t('adjust_help')}</p>
        {byKg ? (
          <TextInput label={t('gas_in_stock')} value={kg} onChange={setKg} filter="decimal" />
        ) : (
          <>
            <div className="flex items-center justify-between">
              <span className="font-semibold">{t('full_cylinders')}</span>
              <QtyStepper value={full} onChange={setFull} />
            </div>
            <div className="flex items-center justify-between">
              <span className="font-semibold">{t('empty_cylinders')}</span>
              <QtyStepper value={empty} onChange={setEmpty} tone="orange" />
            </div>
          </>
        )}
        <TextInput label={t('reason')} value={note} onChange={setNote} maxLength={60} />
      </div>
    </Modal>
  );
}

/** noOpening: added from a purchase, so the purchase brings the stock (no opening counts). */
export function TypeForm({ open, initial, onClose, onSaved, noOpening = false }) {
  const confirm = useConfirm();
  const blank = { name: '', kg: '', price: '', wholesale_price: '', purchase_price: '', deposit: '', low_level: '5', sort: '', active: true, full_qty: 0, empty_qty: 0, unit: '', gas_kg: '' };
  const [f, setF] = useState(blank);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!open) return;
    setErr('');
    setF(
      initial
        ? { ...blank, ...initial, kg: numInput(initial.kg), price: numInput(initial.price), wholesale_price: numInput(initial.wholesale_price), purchase_price: numInput(initial.purchase_price), deposit: numInput(initial.deposit), low_level: String(initial.low_level), sort: String(initial.sort) }
        : blank,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const byKg = f.unit === 'kg';
  const save = useAct((b) => (initial ? api.put(`/types/${initial.uid}`, b) : api.post('/types', b)), {
    onSuccess: (res) => {
      toast(t('saved'));
      onClose();
      onSaved?.(res);
    },
    onError: (e) => toast(e.message, 'error'),
  });
  const submit = async () => {
    if (!f.name.trim()) return setErr(t('required'));
    const [sale, wholesale, purchase, deposit] = [f.price, f.wholesale_price, f.purchase_price, f.deposit].map(parseNum);
    if ([sale, wholesale, purchase, deposit].some((v) => v > MAX_UNIT_PRICE)) return toast(t('price_too_big', { max: money(MAX_UNIT_PRICE) }), 'error');
    if (parseNum(f.kg) > 1000) return toast(t('weight_too_big'), 'error');
    const loss = Math.max(lossPerCylinder(sale, purchase), lossPerCylinder(wholesale, purchase));
    if (loss > 0 && !(await confirm({ title: t('loss_title'), message: t('loss_msg', { loss: money(loss) }), okLabel: t('save_anyway'), danger: true }))) return;
    save.mutate({
      name: f.name.trim(),
      kg: parseNum(f.kg),
      price: parseNum(f.price),
      wholesale_price: parseNum(f.wholesale_price),
      purchase_price: parseNum(f.purchase_price),
      deposit: parseNum(f.deposit),
      low_level: parseNum(f.low_level),
      sort: parseNum(f.sort),
      active: f.active,
      ...(initial ? {} : { full_qty: noOpening ? 0 : f.full_qty, empty_qty: noOpening ? 0 : f.empty_qty, unit: byKg ? 'kg' : '', gas_kg: byKg ? parseNum(f.gas_kg) : 0 }),
    });
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? t('edit_cylinder_type') : t('add_cylinder_type')}
      icon={Cylinder}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button icon={Check} loading={save.isPending} onClick={submit}>
            {t('save')}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3.5">
        {!initial && !noOpening && (
          <div className="col-span-2">
            <div className="label">{t('sold_by')}</div>
            <Chips
              value={f.unit}
              onChange={set('unit')}
              options={[
                { value: '', label: t('by_cylinder'), icon: Cylinder },
                { value: 'kg', label: t('by_kg'), icon: Flame },
              ]}
            />
          </div>
        )}
        <TextInput label={t('name')} value={f.name} onChange={set('name')} error={err} maxLength={60} placeholder={byKg ? t('loose_gas') : '11.8 kg'} className={cn('col-span-2', !byKg && 'sm:col-span-1')} autoFocus />
        {!byKg && <TextInput label={t('weight_kg')} value={f.kg} onChange={set('kg')} filter="decimal" className="col-span-2 sm:col-span-1" />}
        <MoneyInput label={byKg ? t('price_per_kg') : t('sale_price')} value={f.price} onChange={set('price')} />
        <MoneyInput label={byKg ? t('wholesale_per_kg') : t('wholesale_price')} value={f.wholesale_price} onChange={set('wholesale_price')} />
        <MoneyInput label={byKg ? t('purchase_per_kg') : t('purchase_price')} value={f.purchase_price} onChange={set('purchase_price')} />
        {!byKg && <MoneyInput label={t('security_per_cyl')} value={f.deposit} onChange={set('deposit')} />}
        <TextInput label={byKg ? `${t('low_stock_alert')} (${t('kg')})` : t('low_stock_alert')} value={f.low_level} onChange={set('low_level')} filter="int" hint={byKg ? undefined : t('low_stock_help')} />
        <TextInput label={t('sort_order')} value={f.sort} onChange={set('sort')} filter="int" />
        {!initial && !noOpening && byKg && <TextInput label={t('gas_in_stock')} value={f.gas_kg} onChange={set('gas_kg')} filter="decimal" className="col-span-2" />}
        {!initial && !noOpening && !byKg && (
          <>
            <div className="col-span-2 flex items-center justify-between">
              <span className="font-semibold">{t('opening_full')}</span>
              <QtyStepper value={f.full_qty} onChange={set('full_qty')} />
            </div>
            <div className="col-span-2 flex items-center justify-between">
              <span className="font-semibold">{t('opening_empty')}</span>
              <QtyStepper value={f.empty_qty} onChange={set('empty_qty')} tone="orange" />
            </div>
          </>
        )}
        {!noOpening && (
          <div className="col-span-2">
            <Switch checked={f.active} onChange={set('active')} label={t('active')} sub={t('active_help')} />
          </div>
        )}
        {initial && <div className="col-span-2 text-[12px] text-muted">{t('price_change_logged')}</div>}
      </div>
    </Modal>
  );
}

/** Open full cylinders into loose gas: the cylinders become empty, their kg is added. */
function FillGas({ gas, types, onClose }) {
  const sources = types.filter((x) => x.unit !== 'kg' && x.active && Number(x.kg) > 0 && x.full_qty > 0);
  const [from, setFrom] = useState('');
  const [count, setCount] = useState(1);
  const [note, setNote] = useState('');
  useEffect(() => {
    if (gas) {
      setFrom([...sources].sort((a, b) => b.kg - a.kg)[0]?.uid ?? '');
      setCount(1);
      setNote('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gas]);
  const src = sources.find((x) => x.uid === from);
  const save = useAct(() => api.post(`/types/${gas.uid}/fill`, { from_uid: from, count, note }), {
    onSuccess: (r) => {
      toast(`+${num0(r.kg)} ${t('kg')}`);
      onClose();
    },
    onError: (e) => toast(e.message, 'error'),
  });
  return (
    <Modal
      open={!!gas}
      onClose={onClose}
      title={`${t('fill_from_cyl')} · ${gas?.name ?? ''}`}
      icon={Flame}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button icon={Check} loading={save.isPending} disabled={!src || count < 1} onClick={() => save.mutate()}>
            {t('save')}
          </Button>
        </>
      }
    >
      {sources.length === 0 ? (
        <p className="text-[13.5px] text-muted">{t('no_cyl_to_fill')}</p>
      ) : (
        <div className="space-y-3.5">
          <p className="text-[13px] text-muted">{t('fill_help')}</p>
          <Chips
            value={from}
            onChange={(v) => (setFrom(v), setCount(1))}
            options={sources.map((x) => ({ value: x.uid, label: `${x.name} (${x.full_qty})` }))}
          />
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold">{t('how_many')}</span>
            <QtyStepper value={count} onChange={setCount} min={1} max={src?.full_qty ?? 1} />
          </div>
          {src && (
            <div className="rounded-[var(--radius-ctl)] bg-bg px-3 py-2.5 flex items-center justify-between">
              <span className="text-muted font-medium">{t('gas_added')}</span>
              <span className="text-[18px] font-black num whitespace-nowrap">
                +{num0(count * src.kg)} {t('kg')}
              </span>
            </div>
          )}
          <TextInput label={t('note')} value={note} onChange={setNote} maxLength={60} />
        </div>
      )}
    </Modal>
  );
}
