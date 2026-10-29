import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronsUpDown, CircleCheck, CircleDashed, Cylinder, Plus, Truck, Wallet } from 'lucide-react';
import { api, queryClient, useGet } from '@/lib/api';
import { dayKey, money, numInput, parseNum } from '@/lib/format';
import { opt, t } from '@/lib/i18n';
import { MoneySelect, useDefaultMoney, useMoneyChoices } from '@/ui/money';
import { useLowBalance } from './Accounts';
import { Async, Balance, Button, Card, cn, Initials, KV, PageHeader, SectionHeader } from '@/ui/kit';
import { DateInput, Dropdown, MoneyInput, QtyStepper, Switch, Textarea } from '@/ui/form';
import { toast, useConfirm } from '@/ui/overlay';
import { SupplierPicker, useLeaveGuard } from '@/ui/pickers';
import { PartyForm } from './forms';
import { TypeForm } from './Stock';
import { StockArt } from '@/ui/StockArt';

export default function NewPurchase() {
  const types = useGet('/types');
  return <Async q={types}>{(list) => <Form types={list} />}</Async>;
}

function Form({ types }) {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [supplier, setSupplier] = useState(null);
  const [picker, setPicker] = useState(false);
  // New supplier from the purchase: null = closed, else the name typed in the search.
  const [addSup, setAddSup] = useState(null);
  const [addType, setAddType] = useState(false);
  // Partial or payable chosen before a supplier: applied once one is picked.
  const [wantMode, setWantMode] = useState(null);
  // Loose gas (sold by kg) comes from opening full cylinders, not from purchases.
  const [lines, setLines] = useState(() => types.filter((ty) => ty.unit !== 'kg').map((ty) => ({ type: ty, price: numInput(ty.purchase_price), qty: 0, sent: 0, emptyBuy: 0, emptyRate: '', more: false })));
  const [payMode, setPayMode] = useState('full');
  const [paid, setPaid] = useState('');
  const accounts = useMoneyChoices();
  const [moneyId, setMoneyId] = useState('');
  useDefaultMoney(accounts.data, moneyId, setMoneyId);
  const [onLow, lowUi] = useLowBalance();
  const [date, setDate] = useState(dayKey());
  const [note, setNote] = useState('');
  const [updatePrices, setUpdatePrices] = useState(true);
  const [saving, setSaving] = useState(false);

  const set = (i, p) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...p } : l)));
  // Gas or items at their rate, plus new empty cylinders bought at theirs.
  const total = lines.reduce((a, l) => a + l.qty * parseNum(l.price) + l.emptyBuy * parseNum(l.emptyRate), 0);
  const paidAmount = !supplier || payMode === 'full' ? total : payMode === 'udhaar' ? 0 : parseNum(paid);
  const dirty = lines.some((l) => l.qty || l.sent || l.emptyBuy) || !!note;
  useLeaveGuard(dirty && !saving);

  const pickSupplier = (s) => {
    setSupplier(s);
    setPicker(false);
    setPayMode(s ? wantMode || payMode : 'full');
    setWantMode(null);
  };
  /** A supplier added here: load it (with its balance) and select it. */
  const supplierAdded = async (res) => {
    if (!res?.uid) return;
    try {
      pickSupplier(await api.get(`/suppliers/${res.uid}`));
    } catch (e) {
      toast(e.message, 'error');
    }
  };
  /** A cylinder type added here: add its line to this purchase. */
  const typeAdded = async (res) => {
    if (!res?.uid) return;
    try {
      const all = await queryClient.fetchQuery({ queryKey: ['/types', {}], queryFn: () => api.get('/types'), staleTime: 0 });
      const ty = all.find((x) => x.uid === res.uid);
      if (ty && ty.unit !== 'kg') {
        setLines((ls) => (ls.some((l) => l.type.uid === ty.uid) ? ls : [...ls, { type: ty, price: numInput(ty.purchase_price), qty: 0, sent: 0 }]));
        toast(t('type_added_to_purchase', { name: ty.name }));
      }
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const save = async () => {
    if (!lines.some((l) => l.qty || l.sent || l.emptyBuy)) return toast(t('add_qty_first'), 'error');
    if (paidAmount > total + 0.009) return toast(t('paid_more_than_total'), 'error');
    if (paidAmount > 0 && !moneyId) return toast(t('choose_cash_bank'), 'error');
    // Never send more empties than the shop has: stock cannot go below zero.
    const short = lines.filter((l) => l.sent > Math.max(0, l.type.empty_qty));
    if (short.length) {
      await confirm({
        title: t('empties_low_title'),
        message: `${short.map((l) => `${l.type.name}: ${t('empty')} ${Math.max(0, l.type.empty_qty)}, ${t('sending')} ${l.sent}`).join('\n')}\n\n${t('empties_short_msg')}`,
        okLabel: t('ok'),
        cancelLabel: false,
      });
      return;
    }
    setSaving(true);
    try {
      const res = await api.post('/purchases', {
        supplier_uid: supplier?.uid ?? null,
        date: date === dayKey() ? undefined : date,
        lines: lines.flatMap((l) => [
          ...(l.qty || l.sent ? [{ type_uid: l.type.uid, qty: l.qty, empty_sent: l.type.unit === 'pcs' ? 0 : l.sent, price: parseNum(l.price) }] : []),
          ...(l.emptyBuy ? [{ type_uid: l.type.uid, qty: l.emptyBuy, empty_sent: 0, price: parseNum(l.emptyRate), mode: 'empty' }] : []),
        ]),
        paid: paidAmount,
        money_id: paidAmount > 0 ? Number(moneyId) : undefined,
        note,
        update_prices: updatePrices,
      });
      window.onbeforeunload = null;
      await queryClient.invalidateQueries();
      toast(t('purchase_saved'));
      navigate(`/app/purchases/${res.uid}`, { replace: true });
    } catch (e) {
      onLow(e);
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader title={t('new_purchase')} back />
      <div className="grid lg:grid-cols-[1fr_360px] gap-5 items-start">
        <div className="min-w-0">
          <div className="flex gap-2.5 items-stretch">
          <Card as="button" onClick={() => setPicker(true)} className="flex-1 min-w-0 text-left p-3 flex items-center gap-3">
            {supplier ? <Initials name={supplier.name} tone="blue" size={42} /> : <div className="grid place-items-center size-[42px] rounded-[var(--radius-ctl)] bg-bg text-muted"><Truck className="size-5" /></div>}
            <div className="min-w-0 flex-1">
              <div className="text-[11.5px] font-semibold text-muted">{t('supplier')}</div>
              <div className="font-extrabold text-[15px] truncate">{supplier ? supplier.name : t('no_supplier')}</div>
            </div>
            {supplier && <Balance value={supplier.balance} supplier />}
            <ChevronsUpDown className="size-5 text-muted" />
          </Card>
            <Button variant="outline" icon={Plus} className="!h-auto" onClick={() => setAddSup('')} aria-label={t('add_new_supplier')} title={t('add_new_supplier')}>
              <span className="hidden sm:inline">{t('add_supplier')}</span>
            </Button>
          </div>

          <SectionHeader
            title={t('items_received')}
            action={
              <Button size="sm" variant="outline" icon={Plus} onClick={() => setAddType(true)}>
                {t('add_stock_item')}
              </Button>
            }
          />
          <div className="grid sm:grid-cols-2 gap-2.5">
            {lines.map((l, i) => {
              const active = l.qty || l.sent || l.emptyBuy;
              const item = l.type.unit === 'pcs';
              return (
                <div key={l.type.uid} className={cn('flex flex-col bg-white rounded-[var(--radius-card)] p-3 border transition', active ? 'border-primary ring-1 ring-primary/30' : 'border-line')}>
                  <div className="flex items-center gap-2.5">
                    <StockArt type={l.type} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="font-extrabold truncate">{l.type.name}</div>
                      <div className="text-[11.5px] text-muted truncate">
                        {item ? `${l.type.category || t('cat_other_items')} · ${t('in_stock')}: ${Math.max(0, l.type.full_qty)}` : `${t('full')}: ${l.type.full_qty} · ${t('empty')}: ${l.type.empty_qty}`}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="text-[13px] font-semibold">{t('rate')}</span>
                    <MoneyInput value={l.price} onChange={(v) => set(i, { price: v })} className="w-[148px]" aria-label={t('rate')} />
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[13px] font-semibold">{item ? t('qty_received') : t('full_recv')}</span>
                    <QtyStepper value={l.qty} onChange={(v) => set(i, { qty: v })} />
                  </div>
                  {!item && (
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-[13px] font-semibold">{t('empty_sent')}</span>
                      <QtyStepper value={l.sent} onChange={(v) => set(i, { sent: v })} tone="orange" />
                    </div>
                  )}
                  {!item &&
                    (l.more || l.emptyBuy > 0 ? (
                      <div className="mt-2 pt-2 border-t border-dashed border-line">
                        <div className="flex items-center justify-between">
                          <span className="text-[13px] font-semibold truncate">{t('buy_empty_cyl')}</span>
                          <QtyStepper value={l.emptyBuy} onChange={(v) => set(i, { emptyBuy: v })} tone="orange" />
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="text-[13px] font-semibold truncate">{t('empty_cyl_rate')}</span>
                          <MoneyInput value={l.emptyRate} onChange={(v) => set(i, { emptyRate: v })} className="w-[148px]" aria-label={t('empty_cyl_rate')} />
                        </div>
                      </div>
                    ) : (
                      <button type="button" onClick={() => set(i, { more: true, emptyRate: l.emptyRate || (l.type.cyl_price ? numInput(l.type.cyl_price) : '') })} className="mt-2 w-full h-8 rounded-[var(--radius-xs)] bg-bg text-[12.5px] font-bold text-primary hover:bg-soft">
                        {t('buy_empty_more')}
                      </button>
                    ))}
                  <div className="mt-auto pt-2.5">
                    <div className="pt-2.5 border-t border-line flex justify-between">
                      <span className="text-[12px] font-bold text-muted">{t('amount')}</span>
                      <span className={cn('font-black num whitespace-nowrap', !(l.qty > 0 || l.emptyBuy > 0) && 'text-muted/60')}>{money(l.qty * parseNum(l.price) + l.emptyBuy * parseNum(l.emptyRate))}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="lg:sticky lg:top-5">
          <SectionHeader title={t('payment')} className="lg:mt-0" />
          <Card className="p-4 space-y-4">
            <DateInput label={t('date')} value={date} onChange={setDate} max={dayKey()} />
            <div className="grid grid-cols-2 gap-3">
              <Dropdown
                label={t('payment')}
                value={supplier ? payMode : 'full'}
                onChange={(m) => {
                  // Credit needs a supplier: ask for one instead of refusing the choice.
                  if (m !== 'full' && !supplier) {
                    setWantMode(m);
                    toast(t('credit_needs_supplier'), 'error');
                    setPicker(true);
                    return;
                  }
                  setPayMode(m);
                }}
                options={[
                  { value: 'full', label: t('paid'), icon: CircleCheck },
                  { value: 'partial', label: t('partial'), icon: CircleDashed },
                  { value: 'udhaar', label: t('payable'), icon: Wallet },
                ]}
              />
              <MoneySelect label={t('acc_paid_from')} list={accounts.data} value={moneyId} onChange={setMoneyId} disabled={paidAmount <= 0} />
            </div>
            <MoneyInput
              label={t('paid_to_supplier')}
              value={supplier && payMode === 'partial' ? paid : numInput(paidAmount)}
              onChange={setPaid}
              disabled={!supplier || payMode !== 'partial'}
              hint={!supplier ? t('credit_needs_supplier') : undefined}
            />
            <Switch checked={updatePrices} onChange={setUpdatePrices} label={t('update_purchase_prices')} sub={t('update_purchase_prices_sub')} />
            <Textarea label={opt(t('note'))} value={note} onChange={setNote} />
            {lowUi}
            <div className="rounded-[var(--radius-card)] bg-bg px-3.5 py-2.5">
              <KV label={t('total')} value={money(total)} strong />
              {supplier && <KV label={t('payable')} value={money(total - paidAmount)} tone={total - paidAmount > 0.009 ? 'red' : undefined} />}
            </div>
            <Button data-shortcut="save" size="lg" full icon={Check} loading={saving} onClick={save}>
              {t('save')}
            </Button>
          </Card>
        </div>
      </div>
      <SupplierPicker
        open={picker}
        onClose={() => (setPicker(false), setWantMode(null))}
        onPick={pickSupplier}
        onAddNew={(name) => {
          setPicker(false);
          setAddSup(name);
        }}
      />
      <PartyForm kind="supplier" open={addSup !== null} prefill={addSup ?? ''} onClose={() => setAddSup(null)} onSaved={supplierAdded} />
      <TypeForm open={addType} noOpening onClose={() => setAddType(false)} onSaved={typeAdded} />
    </div>
  );
}
