import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronsUpDown, CircleCheck, CircleDashed, Cylinder, Plus, Truck, Wallet } from 'lucide-react';
import { api, queryClient, useGet } from '@/lib/api';
import { dayKey, money, numInput, parseNum, PAYMENT_METHODS } from '@/lib/format';
import { methodLabel, t } from '@/lib/i18n';
import { Async, Balance, Button, Card, cn, Initials, KV, PageHeader, SectionHeader } from '@/ui/kit';
import { DateInput, Dropdown, MoneyInput, QtyStepper, Switch, Textarea } from '@/ui/form';
import { METHOD_ICONS } from './NewSale';
import { toast, useConfirm } from '@/ui/overlay';
import { SupplierPicker, useLeaveGuard } from '@/ui/pickers';
import { PartyForm } from './forms';
import { TypeForm } from './Stock';

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
  const [lines, setLines] = useState(() => types.map((ty) => ({ type: ty, price: numInput(ty.purchase_price), qty: 0, sent: 0 })));
  const [payMode, setPayMode] = useState('full');
  const [paid, setPaid] = useState('');
  const [method, setMethod] = useState('cash');
  const [date, setDate] = useState(dayKey());
  const [note, setNote] = useState('');
  const [updatePrices, setUpdatePrices] = useState(true);
  const [saving, setSaving] = useState(false);

  const set = (i, p) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...p } : l)));
  const total = lines.reduce((a, l) => a + l.qty * parseNum(l.price), 0);
  const paidAmount = !supplier || payMode === 'full' ? total : payMode === 'udhaar' ? 0 : parseNum(paid);
  const dirty = lines.some((l) => l.qty || l.sent) || !!note;
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
      if (ty) {
        setLines((ls) => (ls.some((l) => l.type.uid === ty.uid) ? ls : [...ls, { type: ty, price: numInput(ty.purchase_price), qty: 0, sent: 0 }]));
        toast(t('type_added_to_purchase', { name: ty.name }));
      }
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const save = async () => {
    if (!lines.some((l) => l.qty || l.sent)) return toast(t('add_qty_first'), 'error');
    if (paidAmount > total + 0.009) return toast(t('paid_more_than_total'), 'error');
    const short = lines.filter((l) => l.sent > l.type.empty_qty);
    if (short.length) {
      const ok = await confirm({
        title: t('empties_low_title'),
        message: `${short.map((l) => `${l.type.name}: ${t('empty')} ${l.type.empty_qty}, ${t('sending')} ${l.sent}`).join('\n')}\n\n${t('stock_low_msg')}`,
        okLabel: t('save'),
      });
      if (!ok) return;
    }
    setSaving(true);
    try {
      const res = await api.post('/purchases', {
        supplier_uid: supplier?.uid ?? null,
        date: date === dayKey() ? undefined : date,
        lines: lines.filter((l) => l.qty || l.sent).map((l) => ({ type_uid: l.type.uid, qty: l.qty, empty_sent: l.sent, price: parseNum(l.price) })),
        paid: paidAmount,
        method,
        note,
        update_prices: updatePrices,
      });
      window.onbeforeunload = null;
      await queryClient.invalidateQueries();
      toast(t('purchase_saved'));
      navigate(`/app/purchases/${res.uid}`, { replace: true });
    } catch (e) {
      toast(e.message, 'error');
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
            {supplier && <Balance value={supplier.balance} />}
            <ChevronsUpDown className="size-5 text-muted" />
          </Card>
            <Button variant="outline" icon={Plus} className="!h-auto" onClick={() => setAddSup('')} aria-label={t('add_new_supplier')} title={t('add_new_supplier')}>
              <span className="hidden sm:inline">{t('add_supplier')}</span>
            </Button>
          </div>

          <SectionHeader
            title={t('cylinders_received')}
            action={
              <Button size="sm" variant="outline" icon={Plus} onClick={() => setAddType(true)}>
                {t('add_cylinder_type')}
              </Button>
            }
          />
          <div className="grid sm:grid-cols-2 gap-2.5">
            {lines.map((l, i) => {
              const active = l.qty || l.sent;
              return (
                <div key={l.type.uid} className={cn('bg-white rounded-[var(--radius-card)] p-3 border transition', active ? 'border-primary ring-1 ring-primary/30' : 'border-line')}>
                  <div className="flex items-center gap-2">
                    <Cylinder className={cn('size-5', active ? 'text-primary' : 'text-muted')} />
                    <div className="min-w-0 flex-1">
                      <div className="font-extrabold truncate">{l.type.name}</div>
                      <div className="text-[11.5px] text-muted">
                        {t('full')}: {l.type.full_qty} · {t('empty')}: {l.type.empty_qty}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="text-[13px] font-semibold">{t('rate')}</span>
                    <MoneyInput value={l.price} onChange={(v) => set(i, { price: v })} className="w-[148px]" aria-label={t('rate')} />
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[13px] font-semibold">{t('full_recv')}</span>
                    <QtyStepper value={l.qty} onChange={(v) => set(i, { qty: v })} />
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[13px] font-semibold">{t('empty_sent')}</span>
                    <QtyStepper value={l.sent} onChange={(v) => set(i, { sent: v })} tone="orange" />
                  </div>
                  {l.qty > 0 && (
                    <div className="mt-2.5 pt-2.5 border-t border-line flex justify-between">
                      <span className="text-[12px] font-bold text-muted">{t('amount')}</span>
                      <span className="font-black num">{money(l.qty * parseNum(l.price))}</span>
                    </div>
                  )}
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
              <Dropdown label={t('payment_method')} value={method} onChange={setMethod} disabled={paidAmount <= 0} options={PAYMENT_METHODS.map((m) => ({ value: m, label: methodLabel(m), icon: METHOD_ICONS[m] }))} />
            </div>
            <MoneyInput
              label={t('paid_to_supplier')}
              value={supplier && payMode === 'partial' ? paid : numInput(paidAmount)}
              onChange={setPaid}
              disabled={!supplier || payMode !== 'partial'}
              hint={!supplier ? t('credit_needs_supplier') : undefined}
            />
            <Switch checked={updatePrices} onChange={setUpdatePrices} label={t('update_purchase_prices')} sub={t('update_purchase_prices_sub')} />
            <Textarea label={t('note')} value={note} onChange={setNote} />
            <div className="rounded-[var(--radius-card)] bg-bg px-3.5 py-2.5">
              <KV label={t('total')} value={money(total)} strong />
              {supplier && <KV label={t('payable')} value={money(total - paidAmount)} tone={total - paidAmount > 0.009 ? 'red' : undefined} />}
            </div>
            <Button size="lg" full icon={Check} loading={saving} onClick={save}>
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
