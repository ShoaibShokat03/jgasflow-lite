import { useEffect, useState } from 'react';
import { Check, ClipboardList, Cylinder, Flame, History, Package, PackagePlus, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, useAct, useGet } from '@/lib/api';
import { moveColumns, stockColumns } from '@/features/exports';
import { ExportMenu } from '@/ui/ExportMenu';
import { fDateShort, fTime, lossPerCylinder, MAX_UNIT_PRICE, money, num0, numInput, parseNum } from '@/lib/format';
import { moveLabel, t } from '@/lib/i18n';
import { Async, Button, Card, cn, Empty, IconBox, PageHeader, SectionHeader, StatTile, Tag } from '@/ui/kit';
import { Chips, MoneyInput, QtyStepper, Switch, TextInput } from '@/ui/form';
import { Modal, toast, useConfirm } from '@/ui/overlay';
import { StockValueTiles } from '@/ui/StockValue';
import { CYL_COLORS, CylinderArt, DEFAULT_CYL, groupOf, groupOptions, ITEM_CATEGORIES, StockArt } from '@/ui/StockArt';

export default function Stock() {
  const types = useGet('/types', { all: 1 });
  const [form, setForm] = useState(null); // 'new' | type
  const [adjust, setAdjust] = useState(null);
  const [fill, setFill] = useState(null);
  const [group, setGroup] = useState('');
  const confirm = useConfirm();
  const del = useAct((uid) => api.delete(`/types/${uid}`), {
    onSuccess: (r) => toast(r.deleted ? t('deleted') : t('type_hidden_web')),
    onError: (e) => toast(e.message, 'error'),
  });

  const remove = async (ty) => {
    const stock = ty.unit === 'pcs' ? `${ty.full_qty} ${t('in_stock')}` : `${ty.full_qty} ${t('full')}, ${ty.empty_qty} ${t('empty')}`;
    const msg = `${t('delete_type_msg')}\n\n${t('delete_type_stock')} ${stock}\n${t('delete_type_used_web')}`;
    if (await confirm({ title: `${t('delete')} ${ty.name}?`, message: msg, okLabel: t('delete'), danger: true })) del.mutate(ty.uid);
  };

  return (
    <div>
      <PageHeader
        title={t('stock')}
        sub={t('stock_sub')}
        actions={
          <>
            <ExportMenu title={t('x_stock')} columns={stockColumns} rows={types.data} />
            <Button data-shortcut="add" variant="outline" icon={Plus} onClick={() => setForm('new')}>
              {t('add_stock_item')}
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
          const cyl = live.filter((x) => x.unit === '');
          const items = live.filter((x) => x.unit === 'pcs');
          const shown = list.filter((x) => !group || groupOf(x) === group);
          return (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                <StatTile label={t('ready_to_sell')} value={num0(cyl.reduce((a, x) => a + Math.max(0, x.full_qty), 0))} icon={Cylinder} color="#020033" />
                <StatTile label={t('to_refill')} value={num0(cyl.reduce((a, x) => a + Math.max(0, x.empty_qty), 0))} icon={Cylinder} color="#B77D00" />
                <StatTile label={t('with_customers')} value={num0(cyl.reduce((a, x) => a + x.with_customers, 0))} icon={Cylinder} color="#6A3FB5" />
                <StatTile label={t('total_owned')} value={num0(cyl.reduce((a, x) => a + Math.max(0, x.full_qty) + Math.max(0, x.empty_qty) + x.with_customers, 0))} icon={ClipboardList} color="#2E7D32" />
                <StatTile label={t('other_items_stock')} value={num0(items.reduce((a, x) => a + Math.max(0, x.full_qty), 0))} icon={Package} color="#00897B" />
              </div>
              <StockValueTiles list={list} className="mt-2.5" />
              <SectionHeader title={t('stock_items')} />
              {groupOptions(list).length > 2 && <Chips className="mb-3" size="sm" value={group} onChange={setGroup} options={groupOptions(list)} />}
              <div className="grid md:grid-cols-2 gap-3">
                {shown.map((ty) => (
                  <Card key={ty.uid} className={cn('p-4', !ty.active && 'opacity-70')}>
                    <div className="flex items-start gap-3">
                      <StockArt type={ty} size={44} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-[15px]">{ty.name}</span>
                          {!ty.active && <Tag tone="gray">{t('inactive')}</Tag>}
                          {ty.active && ty.is_low && <Tag tone="red">{t('low')}</Tag>}
                        </div>
                        <div className="text-[12.5px] text-muted">
                          {ty.unit === 'kg'
                            ? `${t('sale_price')} ${money(ty.price)}/${t('kg')}`
                            : ty.unit === 'pcs'
                              ? `${ty.category || t('cat_other_items')} · ${t('sale_price')} ${money(ty.price)}`
                              : `${t('sale_price')} ${money(ty.price)} · ${t('security')} ${money(ty.deposit)}${ty.cyl_price > 0 ? ` · ${t('cyl_price')} ${money(ty.cyl_price)}` : ''}`}
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
                    ) : ty.unit === 'pcs' ? (
                      <div className="grid grid-cols-3 gap-2 mt-3">
                        <Count label={t('in_stock')} value={Math.max(0, ty.full_qty)} tone="text-primary" />
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
  const item = type?.unit === 'pcs';
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
          <Button data-shortcut="save" icon={Check} loading={save.isPending} onClick={() => save.mutate(byKg ? { kg: parseNum(kg), note } : { full, empty: item ? 0 : empty, note })}>
            {t('save')}
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <p className="text-[13px] text-muted">{t('adjust_help')}</p>
        {byKg ? (
          <TextInput label={t('gas_in_stock')} value={kg} onChange={setKg} filter="decimal" />
        ) : item ? (
          <div className="flex items-center justify-between">
            <span className="font-semibold">{t('in_stock')}</span>
            <QtyStepper value={full} onChange={setFull} />
          </div>
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
  const blank = { name: '', kg: '', price: '', wholesale_price: '', purchase_price: '', deposit: '', low_level: '5', sort: '', active: true, full_qty: 0, empty_qty: 0, unit: '', gas_kg: '', category: '', color: DEFAULT_CYL, cyl_price: '' };
  const all = useGet(open ? '/types' : null, { all: 1 });
  const cats = [...new Set([...(all.data ?? []).filter((x) => x.unit === 'pcs' && x.category).map((x) => x.category), ...ITEM_CATEGORIES])];
  const [f, setF] = useState(blank);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!open) return;
    setErr('');
    setF(
      initial
        ? {
            ...blank,
            ...initial,
            kg: numInput(initial.kg),
            price: numInput(initial.price),
            wholesale_price: numInput(initial.wholesale_price),
            purchase_price: numInput(initial.purchase_price),
            deposit: numInput(initial.deposit),
            low_level: String(initial.low_level),
            sort: String(initial.sort),
            color: initial.color || DEFAULT_CYL,
            cyl_price: numInput(initial.cyl_price),
            category: initial.category || '',
          }
        : blank,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const byKg = f.unit === 'kg';
  const item = f.unit === 'pcs';
  const cylinder = !byKg && !item;
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
    if (item && !f.category.trim()) return toast(t('item_category_needed'), 'error');
    const [sale, wholesale, purchase, deposit, cylPrice] = [f.price, f.wholesale_price, f.purchase_price, f.deposit, f.cyl_price].map(parseNum);
    if ([sale, wholesale, purchase, deposit, cylPrice].some((v) => v > MAX_UNIT_PRICE)) return toast(t('price_too_big', { max: money(MAX_UNIT_PRICE) }), 'error');
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
      category: item ? f.category.trim() : '',
      color: cylinder ? f.color : '',
      cyl_price: cylinder ? parseNum(f.cyl_price) : 0,
      ...(initial ? {} : { full_qty: noOpening ? 0 : f.full_qty, empty_qty: noOpening || item ? 0 : f.empty_qty, unit: f.unit, gas_kg: byKg ? parseNum(f.gas_kg) : 0 }),
    });
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? `${t('edit')} ${initial.name}` : t('add_stock_item')}
      icon={item ? Package : Cylinder}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button data-shortcut="save" icon={Check} loading={save.isPending} onClick={submit}>
            {t('save')}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3.5">
        {!initial && (
          <div className="col-span-2">
            <div className="label">{t('item_kind')}</div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: '', label: t('kind_cylinder'), sub: t('kind_cylinder_sub') },
                ...(noOpening ? [] : [{ value: 'kg', label: t('kind_loose_gas'), sub: t('kind_loose_gas_sub') }]),
                { value: 'pcs', label: t('kind_item'), sub: t('kind_item_sub') },
              ].map((k) => {
                const on = f.unit === k.value;
                return (
                  <button
                    key={k.value}
                    type="button"
                    onClick={() => setF((s) => ({ ...s, unit: k.value }))}
                    className={cn('h-[112px] flex flex-col items-center justify-start gap-1 rounded-[var(--radius-card)] border px-2 py-2.5 text-center transition overflow-hidden', on ? 'border-primary bg-soft ring-2 ring-primary/15' : 'border-line bg-white hover:bg-bg')}
                  >
                    <StockArt type={{ unit: k.value, color: f.color, category: f.category || 'Chulha' }} size={30} />
                    <span className="font-semibold text-[12.5px] leading-tight line-clamp-1">{k.label}</span>
                    <span className="text-[10.5px] text-muted leading-tight line-clamp-2">{k.sub}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <TextInput
          label={t('name')}
          value={f.name}
          onChange={set('name')}
          error={err}
          maxLength={60}
          placeholder={byKg ? t('loose_gas') : item ? t('item_name_ph') : '11.8 kg'}
          className={cn('col-span-2', cylinder && 'sm:col-span-1')}
          autoFocus
        />
        {cylinder && <TextInput label={t('weight_kg')} value={f.kg} onChange={set('kg')} filter="decimal" className="col-span-2 sm:col-span-1" />}
        {item && (
          <div className="col-span-2">
            <TextInput label={t('item_category')} value={f.category} onChange={set('category')} maxLength={60} list="jgf-item-cats" placeholder={ITEM_CATEGORIES[0]} />
            <datalist id="jgf-item-cats">
              {cats.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {cats.slice(0, 8).map((c) => (
                <button key={c} type="button" onClick={() => set('category')(c)} className={cn('h-7 px-2.5 rounded-full border text-[12px] font-semibold whitespace-nowrap', f.category === c ? 'bg-primary text-white border-primary' : 'bg-white border-line hover:border-primary')}>
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}
        {cylinder && (
          <div className="col-span-2">
            <div className="label">{t('cyl_color')}</div>
            <div className="flex items-center gap-3">
              <CylinderArt color={f.color} size={56} />
              <div className="flex flex-wrap gap-1.5">
                {CYL_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    title={t(c.key)}
                    aria-label={t(c.key)}
                    onClick={() => set('color')(c.value)}
                    className={cn('size-8 rounded-full border-2 transition', f.color === c.value ? 'border-ink scale-110' : 'border-white ring-1 ring-line')}
                    style={{ background: c.value }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
        <MoneyInput label={byKg ? t('price_per_kg') : t('sale_price')} value={f.price} onChange={set('price')} />
        <MoneyInput label={byKg ? t('wholesale_per_kg') : t('wholesale_price')} value={f.wholesale_price} onChange={set('wholesale_price')} />
        <MoneyInput label={byKg ? t('purchase_per_kg') : t('purchase_price')} value={f.purchase_price} onChange={set('purchase_price')} />
        {cylinder && <MoneyInput label={t('security_per_cyl')} value={f.deposit} onChange={set('deposit')} />}
        {cylinder && <MoneyInput label={t('cyl_price')} value={f.cyl_price} onChange={set('cyl_price')} hint={t('cyl_price_help')} className="col-span-2" />}
        <TextInput label={byKg ? `${t('low_stock_alert')} (${t('kg')})` : t('low_stock_alert')} value={f.low_level} onChange={set('low_level')} filter="int" hint={cylinder ? t('low_stock_help') : undefined} />
        <TextInput label={t('sort_order')} value={f.sort} onChange={set('sort')} filter="int" />
        {!initial && !noOpening && byKg && <TextInput label={t('gas_in_stock')} value={f.gas_kg} onChange={set('gas_kg')} filter="decimal" className="col-span-2" />}
        {!initial && !noOpening && item && (
          <div className="col-span-2 flex items-center justify-between">
            <span className="font-semibold">{t('opening_stock')}</span>
            <QtyStepper value={f.full_qty} onChange={set('full_qty')} />
          </div>
        )}
        {!initial && !noOpening && cylinder && (
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
  const sources = types.filter((x) => x.unit === '' && x.active && Number(x.kg) > 0 && x.full_qty > 0);
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
          <Button data-shortcut="save" icon={Check} loading={save.isPending} disabled={!src || count < 1} onClick={() => save.mutate()}>
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
