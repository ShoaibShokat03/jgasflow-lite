import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowUp, Check, ChevronDown, History, Pencil, Plus, Tag as TagIcon, Trash2, Users } from 'lucide-react';
import { api, useAct, useGet } from '@/lib/api';
import { priceColumns, priceHistoryColumns, specialPriceColumns } from '@/features/exports';
import { ExportMenu } from '@/ui/ExportMenu';
import { fDate, lossPerCylinder, MAX_UNIT_PRICE, money, num0, numInput, parseNum } from '@/lib/format';
import { t } from '@/lib/i18n';
import { Async, Button, Card, Empty, IconBox, Initials, PageHeader, Tag } from '@/ui/kit';
import { Chips, Dropdown, MoneyInput, TextInput } from '@/ui/form';
import { CustomerPicker } from '@/ui/pickers';
import { TypeForm } from './Stock';
import { Modal, toast, useConfirm } from '@/ui/overlay';
import { StockValueTiles } from '@/ui/StockValue';

export default function Prices() {
  const [tab, setTab] = useState('current');
  return (
    <div>
      <PageHeader title={t('prices')} />
      <Chips
        className="mb-3"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'current', label: t('current'), icon: TagIcon },
          { value: 'history', label: t('history'), icon: History },
          { value: 'special', label: t('customer_prices'), icon: Users },
        ]}
      />
      {tab === 'current' && <Current />}
      {tab === 'history' && <PriceHistory />}
      {tab === 'special' && <Special />}
    </div>
  );
}

function Current() {
  const types = useGet('/types');
  const [edit, setEdit] = useState(null);
  const [form, setForm] = useState(null); // 'new' | type
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
    <Async q={types}>
      {(list) => (
        <>
          <div className="flex flex-wrap items-center gap-2.5 mb-3">
            <p className="text-[13px] text-muted flex-1 min-w-[200px]">{t('tap_to_update_price')}</p>
            <ExportMenu title={t('x_prices')} columns={priceColumns} rows={list} />
            <Button icon={Plus} onClick={() => setForm('new')}>
              {t('add_cylinder_type')}
            </Button>
          </div>
          {list.length > 0 && <StockValueTiles list={list} className="mb-3" />}
          {list.length === 0 ? (
            <Card>
              <Empty icon={TagIcon} title={t('nothing_found')} action={<Button icon={Plus} onClick={() => setForm('new')}>{t('add_cylinder_type')}</Button>} />
            </Card>
          ) : (
            <div className="grid md:grid-cols-2 gap-3">
              {list.map((ty) => (
                <Card key={ty.uid} className="p-4">
                  <button type="button" onClick={() => setEdit(ty)} className="w-full text-left">
                    <div className="flex items-center gap-3">
                      <IconBox icon={TagIcon} color="#F26B1D" />
                      <div className="font-bold text-[15px] flex-1 min-w-0 truncate">{ty.name}</div>
                      {ty.unit === 'kg' && <span className="text-[11px] font-bold text-accent-dark bg-[#fff0e6] px-2 py-0.5 rounded-md whitespace-nowrap">{t('per_kg')}</span>}
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-3">
                      <PriceBox label={t('pk_sale')} value={ty.price} strong />
                      <PriceBox label={t('wholesale')} value={ty.wholesale_price} />
                      <PriceBox label={t('pk_purchase')} value={ty.purchase_price} />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12.5px]">
                      {ty.unit === 'kg' ? (
                        <span className="whitespace-nowrap">
                          <span className="text-muted">{t('gas_kg_label')}:</span> <b className="num">{num0(ty.gas_kg)}</b>
                        </span>
                      ) : (
                        <>
                          <span className="whitespace-nowrap">
                            <span className="text-muted">{t('stock_full')}:</span> <b className="num">{ty.full_qty}</b>
                          </span>
                          <span className="whitespace-nowrap">
                            <span className="text-muted">{t('stock_empty')}:</span> <b className="num">{ty.empty_qty}</b>
                          </span>
                        </>
                      )}
                      {(ty.unit === 'kg' ? ty.gas_kg : ty.full_qty) > 0 && (
                        <span className="whitespace-nowrap">
                          <span className="text-muted">{t('stock_value')}:</span> <b className="num">{money((ty.unit === 'kg' ? ty.gas_kg : ty.full_qty) * (ty.purchase_price || 0))}</b>
                        </span>
                      )}
                    </div>
                    {ty.price > 0 && ty.purchase_price > 0 && (
                      <div className="mt-2 text-[12px] text-muted">
                        {t('margin')}: <b className={ty.price - ty.purchase_price < 0 ? 'text-bad' : 'text-good'}>{money(ty.price - ty.purchase_price)}</b> / {t('cyl')}
                        {ty.price - ty.purchase_price < 0 && <span className="ml-1.5 font-bold text-bad">{t('selling_at_loss')}</span>}
                      </div>
                    )}
                  </button>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <Button size="sm" icon={TagIcon} onClick={() => setEdit(ty)}>
                      {t('update_price')}
                    </Button>
                    <Button size="sm" variant="outline" icon={Pencil} onClick={() => setForm(ty)}>
                      {t('edit')}
                    </Button>
                    <Button size="sm" variant="danger-outline" icon={Trash2} className="ml-auto" onClick={() => remove(ty)} aria-label={t('delete')}>
                      {t('delete')}
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
          <UpdatePrice type={edit} onClose={() => setEdit(null)} />
          <TypeForm open={!!form} initial={form === 'new' ? null : form} onClose={() => setForm(null)} />
        </>
      )}
    </Async>
  );
}

function PriceBox({ label, value, strong }) {
  return (
    <div className="rounded-[var(--radius-ctl)] bg-bg px-2.5 py-2 min-w-0">
      <div className="text-[11px] text-muted truncate">{label}</div>
      <div className={`num truncate ${strong ? 'font-extrabold text-accent-dark' : 'font-bold'}`}>{money(value)}</div>
    </div>
  );
}

function UpdatePrice({ type, onClose }) {
  const confirm = useConfirm();
  const [f, setF] = useState({ sale: '', wholesale: '', purchase: '', note: '' });
  useEffect(() => {
    if (type) setF({ sale: numInput(type.price), wholesale: numInput(type.wholesale_price), purchase: numInput(type.purchase_price), note: '' });
  }, [type]);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const save = useAct((b) => api.post(`/types/${type.uid}/prices`, b), {
    onSuccess: () => {
      toast(t('price_updated'));
      onClose();
    },
    onError: (e) => toast(e.message, 'error'),
  });
  const submit = async () => {
    const sale = parseNum(f.sale);
    const wholesale = parseNum(f.wholesale);
    const purchase = parseNum(f.purchase);
    if ([sale, wholesale, purchase].some((v) => v > MAX_UNIT_PRICE)) return toast(t('price_too_big', { max: money(MAX_UNIT_PRICE) }), 'error');
    // Selling below cost is allowed, but never by accident.
    const loss = Math.max(lossPerCylinder(sale, purchase), lossPerCylinder(wholesale, purchase));
    if (loss > 0 && !(await confirm({ title: t('loss_title'), message: t('loss_msg', { loss: money(loss) }), okLabel: t('save_anyway'), danger: true }))) return;
    save.mutate({ sale, wholesale, purchase, note: f.note });
  };
  const live = Math.max(lossPerCylinder(parseNum(f.sale), parseNum(f.purchase)), lossPerCylinder(parseNum(f.wholesale), parseNum(f.purchase)));
  return (
    <Modal
      open={!!type}
      onClose={onClose}
      title={`${t('update_price')} · ${type?.name ?? ''}`}
      icon={TagIcon}
      iconColor="#F26B1D"
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
      <div className="space-y-3.5">
        <MoneyInput label={t('sale_price')} value={f.sale} onChange={set('sale')} autoFocus />
        <MoneyInput label={t('wholesale_price')} value={f.wholesale} onChange={set('wholesale')} />
        <MoneyInput label={t('purchase_price')} value={f.purchase} onChange={set('purchase')} />
        {live > 0 && <div className="text-[12.5px] font-semibold text-bad bg-[#fdecea] rounded-[var(--radius-ctl)] px-3 py-2">{t('loss_hint', { loss: money(live) })}</div>}
        <TextInput label={t('note')} value={f.note} onChange={set('note')} maxLength={255} placeholder={t('price_note_hint')} />
        <p className="text-[12px] text-muted">{t('price_change_logged')}</p>
      </div>
    </Modal>
  );
}

function PriceHistory() {
  const types = useGet('/types', { all: 1 });
  const [type, setType] = useState('');
  const list = useGet('/prices/history', { type });
  return (
    <>
      <div className="flex flex-wrap items-center gap-2.5 mb-3">
        <Chips size="sm" value={type} onChange={setType} options={[{ value: '', label: t('all') }, ...(types.data ?? []).map((x) => ({ value: x.uid, label: x.name }))]} />
        <ExportMenu className="ml-auto" title={t('x_price_history')} columns={priceHistoryColumns} rows={list.data} all={() => api.get('/prices/history', { params: { limit: 50000 } })} />
      </div>
      <Async q={list}>
        {(rows) => (
          <Card className="overflow-hidden">
            {rows.length === 0 ? (
              <Empty icon={History} title={t('no_price_changes')} />
            ) : (
              <div className="divide-rows">
                {rows.map((h) => {
                  const up = h.price > h.old_price;
                  return (
                    <div key={h.uid} className="flex items-center gap-3 px-4 py-3">
                      <div className={`grid place-items-center size-9 rounded-[var(--radius-xs)] ${h.note === 'opening' ? 'bg-soft text-primary' : up ? 'bg-[#fdecea] text-bad' : 'bg-[#e8f5e9] text-good'}`}>
                        {h.note === 'opening' ? <TagIcon className="size-4" /> : up ? <ArrowUp className="size-4" /> : <ArrowDown className="size-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold truncate">
                          {h.type_name} · {t(`pk_${h.kind}`)}
                        </div>
                        <div className="text-[12px] text-muted truncate">
                          {fDate(h.date)}
                          {h.note && h.note !== 'opening' ? ` · ${h.note}` : ''}
                        </div>
                      </div>
                      <div className="text-right num whitespace-nowrap">
                        {h.old_price > 0 && <div className="text-[12px] text-muted line-through">{money(h.old_price)}</div>}
                        <div className="font-bold">{money(h.price)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        )}
      </Async>
    </>
  );
}

function Special() {
  const list = useGet('/prices/customers');
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [form, setForm] = useState(null); // 'new' | row
  const remove = useAct(({ customer_uid, type_uid }) => api.put(`/customers/${customer_uid}/prices`, { type_uid, price: null }), {
    onSuccess: () => toast(t('deleted')),
    onError: (e) => toast(e.message, 'error'),
  });
  return (
    <>
      <div className="flex flex-wrap items-center gap-2.5 mb-3">
        <p className="text-[13px] text-muted flex-1 min-w-[200px]">{t('customer_prices_help')}</p>
        <ExportMenu title={t('x_special_prices')} columns={specialPriceColumns} rows={list.data} />
        <Button icon={Plus} onClick={() => setForm('new')}>
          {t('add_special_price')}
        </Button>
      </div>
      <Async q={list}>
        {(rows) => (
          <Card className="overflow-hidden">
            {rows.length === 0 ? (
              <Empty icon={Users} title={t('no_customer_prices')} sub={t('special_how')} action={<Button icon={Plus} onClick={() => setForm('new')}>{t('add_special_price')}</Button>} />
            ) : (
              <div className="divide-rows">
                {rows.map((r) => (
                  <div key={r.customer_uid + r.type_uid} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <button type="button" className="flex items-center gap-3 min-w-0 flex-1 text-left hover:opacity-80" onClick={() => navigate(`/app/customers/${r.customer_uid}`)}>
                      <Initials name={r.customer_name} />
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{r.customer_name}</div>
                        <div className="text-[12px] text-muted">
                          {r.type_name} · {t('default')} {money(r.default_price)}
                        </div>
                      </div>
                    </button>
                    <Tag tone="orange">{money(r.price)}</Tag>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" icon={Pencil} aria-label={t('edit')} onClick={() => setForm(r)} />
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={Trash2}
                        className="!text-bad"
                        aria-label={t('remove')}
                        onClick={async () => {
                          if (await confirm({ title: `${t('remove')}?`, message: `${r.customer_name} · ${r.type_name}: ${money(r.price)}\n${t('remove_price_msg')}`, okLabel: t('remove'), danger: true })) remove.mutate(r);
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
      </Async>
      <SpecialPriceForm row={form === 'new' ? null : form} open={!!form} onClose={() => setForm(null)} />
    </>
  );
}

/** Add or change a customer's special price: customer, cylinder and price. */
function SpecialPriceForm({ open, row, onClose }) {
  const types = useGet(open ? '/types' : null);
  const [customer, setCustomer] = useState(null);
  const [picker, setPicker] = useState(false);
  const [typeUid, setTypeUid] = useState('');
  const [price, setPrice] = useState('');
  useEffect(() => {
    if (!open) return;
    setCustomer(row ? { uid: row.customer_uid, name: row.customer_name } : null);
    setTypeUid(row ? row.type_uid : '');
    setPrice(row ? numInput(row.price) : '');
  }, [open, row]);
  const list = types.data ?? [];
  const ty = list.find((x) => x.uid === typeUid) ?? list[0];
  const save = useAct((b) => api.put(`/customers/${customer.uid}/prices`, b), {
    onSuccess: () => {
      toast(t('saved'));
      onClose();
    },
    onError: (e) => toast(e.message, 'error'),
  });
  const submit = () => {
    if (!customer) return toast(t('select_customer'), 'error');
    const v = parseNum(price);
    if (v <= 0) return toast(t('enter_amount'), 'error');
    if (v > MAX_UNIT_PRICE) return toast(t('price_too_big', { max: money(MAX_UNIT_PRICE) }), 'error');
    save.mutate({ type_uid: ty.uid, price: v });
  };
  return (
    <>
      <Modal
        open={open && !picker}
        onClose={onClose}
        title={row ? t('edit') : t('add_special_price')}
        icon={Users}
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
        <div className="space-y-3.5">
          <div>
            <div className="label">{t('customer')}</div>
            <button type="button" disabled={!!row} onClick={() => setPicker(true)} className="ctl flex items-center gap-2 text-left disabled:opacity-70">
              <span className="flex-1 truncate font-semibold">{customer?.name || t('select_customer')}</span>
              {!row && <ChevronDown className="size-4 text-muted" />}
            </button>
          </div>
          <Dropdown label={t('cylinder_type')} value={ty?.uid ?? ''} onChange={setTypeUid} disabled={!!row} options={list.map((x) => ({ value: x.uid, label: x.name, sub: `${t('default')} ${money(x.price)}` }))} />
          <MoneyInput label={t('special_price')} value={price} onChange={setPrice} hint={ty ? `${t('default')}: ${money(ty.price)}` : undefined} autoFocus={!!row} />
        </div>
      </Modal>
      <CustomerPicker
        open={open && picker}
        allowWalkIn={false}
        onClose={() => setPicker(false)}
        onPick={(c) => {
          setPicker(false);
          if (c) setCustomer(c);
        }}
      />
    </>
  );
}
