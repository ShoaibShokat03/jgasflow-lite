import { useEffect, useState } from 'react';
import { Check, ClipboardList, Cylinder, History, PackagePlus, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, useAct, useGet } from '@/lib/api';
import { moveColumns, stockColumns } from '@/features/exports';
import { ExportMenu } from '@/ui/ExportMenu';
import { fDateShort, fTime, lossPerCylinder, MAX_UNIT_PRICE, money, num0, numInput, parseNum } from '@/lib/format';
import { moveLabel, t } from '@/lib/i18n';
import { Async, Button, Card, cn, Empty, IconBox, PageHeader, SectionHeader, StatTile, Tag } from '@/ui/kit';
import { Chips, MoneyInput, QtyStepper, Switch, TextInput } from '@/ui/form';
import { Modal, toast, useConfirm } from '@/ui/overlay';

export default function Stock() {
  const types = useGet('/types', { all: 1 });
  const [form, setForm] = useState(null); // 'new' | type
  const [adjust, setAdjust] = useState(null);
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
                          {t('sale_price')} {money(ty.price)} · {t('security')} {money(ty.deposit)}
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-3">
                      <Count label={t('full')} value={ty.full_qty} tone="text-primary" />
                      <Count label={t('empty')} value={ty.empty_qty} tone="text-warn" />
                      <Count label={t('with_customers')} value={ty.with_customers} tone="text-purple" />
                    </div>
                    <div className="flex flex-wrap gap-2 mt-3">
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
    </div>
  );
}

function Count({ label, value, tone }) {
  return (
    <div className="rounded-[var(--radius-ctl)] bg-bg px-2.5 py-2 min-w-0">
      <div className={cn('text-[18px] font-extrabold num', tone)}>{num0(value)}</div>
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
  const [note, setNote] = useState('');
  useEffect(() => {
    if (type) {
      setFull(type.full_qty);
      setEmpty(type.empty_qty);
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
          <Button icon={Check} loading={save.isPending} onClick={() => save.mutate({ full, empty, note })}>
            {t('save')}
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <p className="text-[13px] text-muted">{t('adjust_help')}</p>
        <div className="flex items-center justify-between">
          <span className="font-semibold">{t('full_cylinders')}</span>
          <QtyStepper value={full} onChange={setFull} />
        </div>
        <div className="flex items-center justify-between">
          <span className="font-semibold">{t('empty_cylinders')}</span>
          <QtyStepper value={empty} onChange={setEmpty} tone="orange" />
        </div>
        <TextInput label={t('reason')} value={note} onChange={setNote} maxLength={60} />
      </div>
    </Modal>
  );
}

/** noOpening: added from a purchase, so the purchase brings the stock (no opening counts). */
export function TypeForm({ open, initial, onClose, onSaved, noOpening = false }) {
  const confirm = useConfirm();
  const blank = { name: '', kg: '', price: '', wholesale_price: '', purchase_price: '', deposit: '', low_level: '5', sort: '', active: true, full_qty: 0, empty_qty: 0 };
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
      ...(initial ? {} : { full_qty: noOpening ? 0 : f.full_qty, empty_qty: noOpening ? 0 : f.empty_qty }),
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
        <TextInput label={t('name')} value={f.name} onChange={set('name')} error={err} maxLength={60} placeholder="11.8 kg" className="col-span-2 sm:col-span-1" autoFocus />
        <TextInput label={t('weight_kg')} value={f.kg} onChange={set('kg')} filter="decimal" className="col-span-2 sm:col-span-1" />
        <MoneyInput label={t('sale_price')} value={f.price} onChange={set('price')} />
        <MoneyInput label={t('wholesale_price')} value={f.wholesale_price} onChange={set('wholesale_price')} />
        <MoneyInput label={t('purchase_price')} value={f.purchase_price} onChange={set('purchase_price')} />
        <MoneyInput label={t('security_per_cyl')} value={f.deposit} onChange={set('deposit')} />
        <TextInput label={t('low_stock_alert')} value={f.low_level} onChange={set('low_level')} filter="int" hint={t('low_stock_help')} />
        <TextInput label={t('sort_order')} value={f.sort} onChange={set('sort')} filter="int" />
        {!initial && !noOpening && (
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
