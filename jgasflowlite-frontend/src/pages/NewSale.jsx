import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Banknote, Building2, Check, ChevronsUpDown, CircleCheck, CircleDashed, Cylinder, FileText, Footprints, Pencil, Smartphone, UserPlus, Wallet } from 'lucide-react';
import { api, queryClient, useGet } from '@/lib/api';
import { dayKey, MAX_UNIT_PRICE, money, num0, numInput, parseNum } from '@/lib/format';
import { opt, t } from '@/lib/i18n';
import { MoneySelect, useDefaultMoney, useMoneyChoices } from '@/ui/money';
import { Async, Balance, Button, Card, cn, Initials, KV, PageHeader, SectionHeader } from '@/ui/kit';
import { DateInput, Dropdown, MoneyInput, QtyStepper, Switch, Textarea } from '@/ui/form';
import { Modal, toast, useConfirm } from '@/ui/overlay';
import { CustomerPicker, useLeaveGuard } from '@/ui/pickers';
import { PartyForm } from './forms';

export const METHOD_ICONS = { cash: Banknote, bank: Building2, jazzcash: Smartphone, easypaisa: Smartphone, cheque: FileText };

/** Price for a customer: special > wholesale (wholesale customers) > retail. Same as the app. */
const priceFor = (type, customer, custom) => {
  if (custom?.[type.uid] != null) return custom[type.uid];
  if (customer?.type === 'wholesale' && type.wholesale_price > 0) return type.wholesale_price;
  return type.price;
};

const isKg = (ty) => ty.unit === 'kg';
const round2 = (v) => Math.round(v * 100) / 100;
/** Amount of one line: cylinders x price, or kg x price per kg for loose gas. */
const lineAmount = (l) => round2(isKg(l.type) ? parseNum(l.kg) * l.price : l.qty * l.price);

/** Loose gas: type the kg, or the rupees the customer wants (kg is worked out). */
function KgEntry({ line, onChange, max }) {
  const rs = line.rs ?? '';
  const setKg = (s) => {
    const v = s.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1').slice(0, 8);
    onChange({ kg: v, rs: '' });
  };
  const setRs = (s) => {
    const v = s.replace(/[^0-9]/g, '').slice(0, 7);
    const kg = line.price > 0 && v ? String(round2(Number(v) / line.price)) : '';
    onChange({ kg, rs: v });
  };
  const field = 'w-full h-10 px-3 text-right num font-bold text-[16px] rounded-[var(--radius-xs)] border border-field outline-none focus:border-primary';
  return (
    <div className="mt-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <label className="min-w-0">
          <span className="text-[12px] font-semibold text-muted">{t('kg')}</span>
          <input value={line.kg} onChange={(e) => setKg(e.target.value)} onFocus={(e) => e.target.select()} inputMode="decimal" placeholder="0" className={field} />
        </label>
        <label className="min-w-0">
          <span className="text-[12px] font-semibold text-muted">{t('or_rupees')}</span>
          <input value={rs} onChange={(e) => setRs(e.target.value)} onFocus={(e) => e.target.select()} inputMode="numeric" placeholder="0" className={field} />
        </label>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {[1, 2, 3, 5, 10].map((k) => (
          <button
            key={k}
            type="button"
            disabled={k > max}
            onClick={() => onChange({ kg: String(k), rs: '' })}
            className={cn('h-8 px-3 rounded-full text-[12.5px] font-bold border transition whitespace-nowrap disabled:opacity-35', parseNum(line.kg) === k ? 'bg-primary text-white border-primary' : 'bg-white border-line hover:border-primary')}
          >
            {k} {t('kg')}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function NewSale() {
  const types = useGet('/types');
  return <Async q={types}>{(list) => <SaleForm types={list} />}</Async>;
}

function SaleForm({ types }) {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [params] = useSearchParams();
  const [customer, setCustomer] = useState(null);
  const [custom, setCustom] = useState({});
  const [lines, setLines] = useState(() => types.map((ty) => ({ type: ty, price: ty.price, qty: 0, empty: 0, kg: '', rs: '' })));
  const [chargeDeposit, setChargeDeposit] = useState(false);
  const [payMode, setPayMode] = useState('full');
  const accounts = useMoneyChoices();
  const [moneyId, setMoneyId] = useState('');
  useDefaultMoney(accounts.data, moneyId, setMoneyId);
  const [discount, setDiscount] = useState('');
  const [paid, setPaid] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(dayKey());
  const [picker, setPicker] = useState(false);
  // New customer from the sale: null = closed, else the name typed in the search.
  const [addCust, setAddCust] = useState(null);
  // Udhaar or partial chosen before a customer: applied once one is picked.
  const [wantMode, setWantMode] = useState(null);
  const [editPrice, setEditPrice] = useState(null);
  const [saving, setSaving] = useState(false);

  const choose = async (c) => {
    setPicker(false);
    let prices = {};
    if (c) {
      const full = await queryClient.fetchQuery({ queryKey: ['/customers/' + c.uid, {}], queryFn: () => api.get(`/customers/${c.uid}`) });
      prices = full.prices || {};
      c = full;
    }
    setCustomer(c);
    setCustom(prices);
    setLines((ls) => ls.map((l) => ({ ...l, price: priceFor(l.type, c, prices) })));
    if (!c) {
      setPayMode('full');
      setChargeDeposit(false);
    } else if (wantMode) setPayMode(wantMode);
    setWantMode(null);
  };

  /** Credit needs a customer: ask for one instead of refusing the choice. */
  const pickPayMode = (m) => {
    if (m !== 'full' && !customer) {
      setWantMode(m);
      toast(t('credit_needs_customer'), 'error');
      setPicker(true);
      return;
    }
    setPayMode(m);
  };

  useEffect(() => {
    const uid = params.get('customer');
    if (uid) choose({ uid }).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (i, patch) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const unreturned = (l) => (l.qty > l.empty ? l.qty - l.empty : 0);
  const depositAmt = (l, charge) => (charge ? unreturned(l) * l.type.deposit : 0);
  const subtotal = round2(lines.reduce((a, l) => a + lineAmount(l), 0));
  const deposit = customer ? lines.reduce((a, l) => a + depositAmt(l, chargeDeposit), 0) : 0;
  const disc = parseNum(discount);
  const total = Math.max(0, subtotal + deposit - disc);
  const paidAmount = !customer || payMode === 'full' ? total : payMode === 'udhaar' ? 0 : parseNum(paid);
  const anyUnreturned = lines.some((l) => unreturned(l) > 0 && l.type.deposit > 0);
  const dirty = lines.some((l) => l.qty || l.empty || parseNum(l.kg)) || !!discount || !!note;
  useLeaveGuard(dirty && !saving);

  const save = async () => {
    if (saving) return;
    if (!lines.some((l) => l.qty > 0 || parseNum(l.kg) > 0)) return toast(t('add_qty_first'), 'error');
    if (disc > subtotal + deposit) return toast(t('discount_too_big'), 'error');
    if (paidAmount > total + 0.009) return toast(t('paid_more_than_total'), 'error');
    if (paidAmount > 0 && !moneyId) return toast(t('choose_cash_bank'), 'error');
    // No sale of cylinders the shop does not have: record the purchase first.
    const short = lines.filter((l) => (isKg(l.type) ? parseNum(l.kg) > Math.max(0, l.type.gas_kg) + 0.001 : l.qty > Math.max(0, l.type.full_qty)));
    if (short.length) {
      await confirm({
        title: t('stock_short_title'),
        message: `${short
          .map((l) =>
            isKg(l.type)
              ? `${l.type.name}: ${t('in_stock')} ${num0(Math.max(0, l.type.gas_kg))} ${t('kg')}, ${t('selling')} ${num0(parseNum(l.kg))} ${t('kg')}`
              : `${l.type.name}: ${t('in_stock')} ${Math.max(0, l.type.full_qty)}, ${t('selling')} ${l.qty}`,
          )
          .join('\n')}\n\n${isKg(short[0].type) ? t('gas_short_msg') : t('stock_short_msg')}`,
        okLabel: t('ok'),
        cancelLabel: false,
      });
      return;
    }
    setSaving(true);
    try {
      const res = await api.post('/sales', {
        customer_uid: customer?.uid ?? null,
        date: date === dayKey() ? undefined : date,
        lines: lines
          .filter((l) => l.qty || l.empty || parseNum(l.kg) > 0)
          .map((l) => (isKg(l.type) ? { type_uid: l.type.uid, qty: 0, empty: 0, kg: round2(parseNum(l.kg)), price: l.price } : { type_uid: l.type.uid, qty: l.qty, empty: l.empty, price: l.price })),
        charge_deposit: !!customer && chargeDeposit,
        discount: disc,
        paid: paidAmount,
        money_id: paidAmount > 0 ? Number(moneyId) : undefined,
        note,
      });
      window.onbeforeunload = null;
      await queryClient.invalidateQueries();
      toast(t('sale_saved'));
      navigate(`/app/sales/${res.uid}?saved=1`, { replace: true });
    } catch (e) {
      toast(e.message, 'error');
      setSaving(false);
    }
  };

  const leave = async () => {
    if (dirty && !(await confirm({ title: t('discard_title'), message: t('discard_msg'), okLabel: t('discard'), danger: true }))) return;
    window.onbeforeunload = null;
    navigate(-1);
  };

  return (
    <div>
      <PageHeader title={t('new_sale')} actions={<Button variant="outline" onClick={leave}>{t('cancel')}</Button>} />
      <div className="grid lg:grid-cols-[1fr_380px] gap-5 items-start">
        <div className="min-w-0">
          {/* customer */}
          <div className="flex gap-2.5 items-stretch">
          <Card as="button" onClick={() => setPicker(true)} className="flex-1 min-w-0 text-left p-3 flex items-center gap-3 hover:border-[#cfd2e6] transition">
            {customer ? (
              <Initials name={customer.name} size={42} tone={customer.type === 'wholesale' ? 'purple' : 'navy'} />
            ) : (
              <div className="grid place-items-center size-[42px] rounded-[var(--radius-ctl)] bg-bg text-muted">
                <Footprints className="size-5" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-[11.5px] font-semibold text-muted">{t('customer')}</div>
              <div className="font-extrabold text-[15px] truncate">{customer ? customer.name : t('walk_in')}</div>
              {customer && (
                <div className="text-[12px] text-muted truncate">
                  {t(customer.type)}
                  {customer.phone ? ` · ${customer.phone}` : ''}
                </div>
              )}
            </div>
            {customer && <Balance value={customer.balance} className="text-[13px]" />}
            <ChevronsUpDown className="size-5 text-muted shrink-0" />
          </Card>
            <Button variant="outline" icon={UserPlus} className="!h-auto" onClick={() => setAddCust('')} aria-label={t('add_new_customer')} title={t('add_new_customer')}>
              <span className="hidden sm:inline">{t('add_customer')}</span>
            </Button>
          </div>

          <SectionHeader title={t('cylinders')} action={<span className="text-[11.5px] text-muted">{t('tap_price_to_change')}</span>} />
          <div className="grid sm:grid-cols-2 gap-2.5">
            {lines.map((l, i) => {
              const byKg = isKg(l.type);
              const active = byKg ? parseNum(l.kg) > 0 : l.qty > 0 || l.empty > 0;
              const inStock = byKg ? Math.max(0, l.type.gas_kg) : Math.max(0, l.type.full_qty);
              const short = byKg ? parseNum(l.kg) > inStock + 0.001 : l.qty > inStock;
              const out = inStock <= 0;
              return (
                <div key={l.type.uid} className={cn('bg-white rounded-[var(--radius-card)] p-3 transition border', active ? 'border-primary ring-1 ring-primary/30 shadow-[var(--shadow-card)]' : 'border-line')}>
                  <div className="flex items-center gap-2">
                    <Cylinder className={cn('size-5 shrink-0', active ? 'text-primary' : 'text-muted')} />
                    <div className="min-w-0 flex-1">
                      <div className="font-extrabold text-[14.5px] truncate">{l.type.name}</div>
                      <div className={cn('text-[11.5px] truncate', short || out ? 'text-bad font-bold' : 'text-muted')}>
                        {byKg ? (out ? t('out_of_stock') : `${num0(inStock)} ${t('kg')} ${t('in_stock')}`) : <>{out ? t('out_of_stock') : `${t('full')}: ${inStock}`} · {t('empty')}: {l.type.empty_qty}</>}
                      </div>
                    </div>
                    <button type="button" onClick={() => setEditPrice(i)} className="inline-flex items-center gap-1 h-8 px-2 rounded-[var(--radius-xs)] bg-[#fff0e6] text-accent-dark font-extrabold text-[13px] whitespace-nowrap num hover:bg-[#ffe2cf]">
                      {money(l.price)}
                      {byKg && <span className="text-[11px] font-bold">/{t('kg')}</span>}
                      <Pencil className="size-3.5" />
                      {custom[l.type.uid] != null && <span className="text-[10px] font-bold">*</span>}
                    </button>
                  </div>
                  {byKg ? (
                    <KgEntry line={l} onChange={(p) => set(i, p)} max={inStock} />
                  ) : (
                    <>
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <span className="text-[13px] font-semibold">{t('qty')}</span>
                        <QtyStepper value={l.qty} onChange={(v) => set(i, { qty: v })} max={inStock} />
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="text-[13px] font-semibold">{t('empty_recv')}</span>
                        <QtyStepper value={l.empty} onChange={(v) => set(i, { empty: v })} tone="orange" />
                      </div>
                    </>
                  )}
                  {active && (
                    <div className="mt-2.5 pt-2.5 border-t border-line flex items-center justify-between">
                      <span className={cn('text-[12px] font-bold', customer && unreturned(l) > 0 ? 'text-warn' : 'text-muted')}>
                        {customer && unreturned(l) > 0 ? `${unreturned(l)} ${t('not_returned')}` : t('amount')}
                      </span>
                      <span className="font-black text-[15px] num">{money(lineAmount(l))}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* payment */}
        <div className="lg:sticky lg:top-5">
          <SectionHeader title={t('payment')} className="lg:mt-0" />
          <Card className="p-4 space-y-4">
            {customer && anyUnreturned && (
              <Switch checked={chargeDeposit} onChange={setChargeDeposit} label={t('charge_security')} sub={`${t('security_deposit')}: ${money(lines.reduce((a, l) => a + depositAmt(l, true), 0))}`} />
            )}
            <div className="grid grid-cols-2 gap-3">
              <MoneyInput label={opt(t('discount'))} value={discount} onChange={setDiscount} />
              <DateInput label={t('date')} value={date} onChange={setDate} max={dayKey()} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Dropdown
                label={t('payment')}
                value={customer ? payMode : 'full'}
                onChange={pickPayMode}
                options={[
                  { value: 'full', label: t('paid'), icon: CircleCheck, sub: t('pay_full_sub') },
                  { value: 'partial', label: t('partial'), icon: CircleDashed, sub: t('pay_partial_sub') },
                  { value: 'udhaar', label: t('udhaar'), icon: Wallet, sub: t('pay_udhaar_sub') },
                ]}
              />
              <MoneySelect label={t('acc_received_in')} list={accounts.data} value={moneyId} onChange={setMoneyId} disabled={paidAmount <= 0} />
            </div>
            <MoneyInput
              label={t('amount_paid_now')}
              value={customer && payMode === 'partial' ? paid : numInput(paidAmount)}
              onChange={setPaid}
              disabled={!customer || payMode !== 'partial'}
              hint={!customer ? t('walk_in_cash_only') : undefined}
            />
            <Textarea label={opt(t('note'))} value={note} onChange={setNote} maxLength={500} />
            <div className="rounded-[var(--radius-card)] bg-bg px-3.5 py-2.5">
              <KV label={t('subtotal')} value={money(subtotal)} />
              {deposit > 0 && <KV label={t('security_deposit')} value={money(deposit)} />}
              {disc > 0 && <KV label={t('discount')} value={`- ${money(disc)}`} />}
              <div className="border-t border-line mt-1.5 pt-1.5">
                <KV label={t('total')} value={money(total)} strong />
                {customer && <KV label={t('due_this_bill')} value={money(total - paidAmount)} tone={total - paidAmount > 0.009 ? 'red' : undefined} />}
              </div>
            </div>
            <div className="hidden lg:block">
              <Button variant="accent" size="lg" full icon={Check} loading={saving} onClick={save}>
                {t('save_sale')}
              </Button>
            </div>
          </Card>
        </div>
      </div>

      {/* phone: sticky total + save */}
      <div className="lg:hidden fixed inset-x-0 bottom-16 z-20 px-3 pb-2 no-print">
        <div className="card flex items-center gap-3 p-3 shadow-[var(--shadow-pop)]">
          <div className="min-w-0 flex-1">
            <div className="text-[11.5px] font-semibold text-muted">{t('total')}</div>
            <div className="text-[21px] font-black text-primary num truncate">{money(total)}</div>
          </div>
          <Button variant="accent" size="lg" icon={Check} loading={saving} onClick={save}>
            {t('save_sale')}
          </Button>
        </div>
      </div>
      <div className="h-24 lg:hidden" />

      <CustomerPicker
        open={picker}
        onClose={() => setPicker(false)}
        onPick={choose}
        onAddNew={(name) => {
          setPicker(false);
          setAddCust(name);
        }}
      />
      <PartyForm open={addCust !== null} prefill={addCust ?? ''} onClose={() => setAddCust(null)} onSaved={(res) => res?.uid && choose({ uid: res.uid })} />
      <PriceDialog
        line={editPrice != null ? lines[editPrice] : null}
        onClose={() => setEditPrice(null)}
        onSave={(p) => (p > MAX_UNIT_PRICE ? toast(t('price_too_big', { max: money(MAX_UNIT_PRICE) }), 'error') : (set(editPrice, { price: p, rs: '' }), setEditPrice(null)))}
      />
    </div>
  );
}

function PriceDialog({ line, onClose, onSave }) {
  const [v, setV] = useState('');
  useEffect(() => {
    setV(line ? String(line.price) : '');
  }, [line]);
  if (!line) return null;
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={`${t('price')} · ${line.type.name}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button icon={Check} onClick={() => onSave(parseNum(v))}>
            {t('set')}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(parseNum(v));
        }}
      >
        <MoneyInput value={v} onChange={setV} autoFocus onFocus={(e) => e.target.select()} />
        <div className="mt-2 text-[12px] text-muted">
          {t('sale_price')}: {money(line.type.price)}
          {line.type.wholesale_price ? ` · ${t('wholesale')}: ${money(line.type.wholesale_price)}` : ''}
        </div>
      </form>
    </Modal>
  );
}
