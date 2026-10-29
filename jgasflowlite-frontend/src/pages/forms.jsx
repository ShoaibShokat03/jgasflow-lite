import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronsUpDown, HandCoins, Undo2 } from 'lucide-react';
import { api, useAct, useGet } from '@/lib/api';
import { dayKey, money, numInput, parseNum } from '@/lib/format';
import { opt, t } from '@/lib/i18n';
import { MoneySelect, useDefaultMoney, useMoneyChoices } from '@/ui/money';
import { useLowBalance } from './Accounts';
import { Balance, Button, Card, Initials, KV } from '@/ui/kit';
import { businessNameError, Chips, DateInput, MoneyInput, phoneError, QtyStepper, Select, Textarea, textError, TextInput } from '@/ui/form';
import { Modal, toast } from '@/ui/overlay';
import { CustomerPicker } from '@/ui/pickers';

/** Add / edit a customer or supplier (kind = 'customer' | 'supplier'). */
export function PartyForm({ open, onClose, kind = 'customer', initial, onSaved, prefill = '' }) {
  const isCust = kind === 'customer';
  const blank = { name: '', phone: '', address: '', type: 'retail', note: '', bal: '', side: 'udhaar' };
  const [f, setF] = useState(blank);
  const [errs, setErrs] = useState({});
  useEffect(() => {
    if (!open) return;
    setErrs({});
    if (initial) {
      const ob = Number(initial.opening_balance) || 0;
      setF({ name: initial.name, phone: initial.phone || '', address: initial.address || '', type: initial.type || 'retail', note: initial.note || '', bal: numInput(Math.abs(ob)), side: ob < 0 ? 'advance' : 'udhaar' });
    } else setF({ ...blank, name: prefill });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const base = isCust ? '/customers' : '/suppliers';
  const save = useAct(
    (body) => (initial ? api.put(`${base}/${initial.uid}`, body) : api.post(base, body)),
    {
      onSuccess: (res) => {
        toast(t('saved'));
        onClose();
        onSaved?.(res);
      },
      onError: (e) => toast(e.message, 'error'),
    },
  );
  const submit = (e) => {
    e?.preventDefault();
    const es = { name: businessNameError(f.name), phone: phoneError(f.phone, false), address: textError(f.address) };
    setErrs(es);
    if (Object.values(es).some(Boolean)) return;
    const amt = parseNum(f.bal);
    save.mutate({ name: f.name, phone: f.phone, address: f.address, type: f.type, note: f.note, opening_balance: f.side === 'advance' ? -amt : amt });
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? t(isCust ? 'edit_customer' : 'edit_supplier') : t(isCust ? 'add_customer' : 'add_supplier')}
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
      <form onSubmit={submit} className="space-y-3.5" noValidate>
        <TextInput label={t(isCust ? 'customer_shop_name' : 'supplier_name')} value={f.name} onChange={set('name')} filter="business" maxLength={50} error={errs.name} autoFocus />
        <div className="grid sm:grid-cols-2 gap-3.5">
          <TextInput label={opt(t('phone'))} value={f.phone} onChange={set('phone')} filter="phone" error={errs.phone} placeholder="03xx-xxxxxxx" />
          {isCust && (
            <div>
              <div className="label">{t('customer_type')}</div>
              <Chips value={f.type} onChange={set('type')} className="!grid grid-cols-2" options={[{ value: 'retail', label: t('retail') }, { value: 'wholesale', label: t('wholesale') }]} />
            </div>
          )}
        </div>
        <TextInput label={opt(t('address'))} value={f.address} onChange={set('address')} maxLength={255} error={errs.address} />
        <div>
          <div className="label">{opt(t(isCust ? 'previous_balance' : 'previous_payable'))}</div>
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <Chips value={f.side} onChange={set('side')} options={[{ value: 'udhaar', label: t(isCust ? 'udhaar' : 'payable') }, { value: 'advance', label: t('advance') }]} />
            <MoneyInput value={f.bal} onChange={set('bal')} />
          </div>
          <div className="mt-1 text-[12px] text-muted">{t(f.side === 'advance' ? 'advance_help' : isCust ? 'previous_balance_help' : 'previous_payable_help')}</div>
        </div>
        <Textarea label={opt(t('note'))} value={f.note} onChange={set('note')} maxLength={1000} />
      </form>
    </Modal>
  );
}

/** Receive udhaar from a customer. */
export function ReceivePayment({ open, onClose, customer: fixed }) {
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(fixed || null);
  const [picker, setPicker] = useState(false);
  const [amount, setAmount] = useState('');
  const accounts = useMoneyChoices(open);
  const [moneyId, setMoneyId] = useState('');
  useDefaultMoney(accounts.data, moneyId, setMoneyId);
  const [date, setDate] = useState(dayKey());
  const [note, setNote] = useState('');
  useEffect(() => {
    if (open) {
      setCustomer(fixed || null);
      setAmount('');
      setDate(dayKey());
      setNote('');
      if (!fixed) setPicker(true);
    }
  }, [open, fixed]);
  const save = useAct((body) => api.post('/payments', body), {
    onSuccess: (res) => {
      toast(t('payment_saved'));
      onClose();
      navigate(`/app/payments/${res.uid}?saved=1`);
    },
    onError: (e) => toast(e.message, 'error'),
  });
  const submit = () => {
    if (!customer) return setPicker(true);
    const a = parseNum(amount);
    if (a <= 0) return toast(t('enter_amount'), 'error');
    if (!moneyId) return toast(t('choose_cash_bank'), 'error');
    save.mutate({ customer_uid: customer.uid, amount: a, money_id: Number(moneyId), note, date: date === dayKey() ? undefined : date });
  };
  return (
    <>
      <Modal
        open={open && !picker}
        onClose={onClose}
        title={t('receive_payment_title')}
        icon={HandCoins}
        iconColor="#2E7D32"
        footer={
          <>
            <Button variant="outline" onClick={onClose}>
              {t('cancel')}
            </Button>
            <Button data-shortcut="save" variant="good" icon={Check} loading={save.isPending} onClick={submit}>
              {t('save_payment')}
            </Button>
          </>
        }
      >
        <div className="space-y-3.5">
          <Card as="button" onClick={() => !fixed && setPicker(true)} className="w-full text-left p-3 flex items-center gap-3">
            <Initials name={customer?.name || '?'} />
            <div className="min-w-0 flex-1">
              <div className="text-[11.5px] text-muted font-semibold">{t('customer')}</div>
              <div className="font-bold truncate">{customer?.name || t('select_customer')}</div>
            </div>
            {customer && <Balance value={customer.balance} />}
            {!fixed && <ChevronsUpDown className="size-5 text-muted" />}
          </Card>
          <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
            <MoneyInput label={t('amount_received')} value={amount} onChange={setAmount} autoFocus />
            {customer?.balance > 0 && (
              <Button variant="soft" onClick={() => setAmount(String(customer.balance))}>
                {t('full_balance')}
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <MoneySelect label={t('acc_received_in')} list={accounts.data} value={moneyId} onChange={setMoneyId} />
            <DateInput label={t('date')} value={date} onChange={setDate} max={dayKey()} />
          </div>
          <Textarea label={opt(t('note'))} value={note} onChange={setNote} maxLength={500} />
          {customer && parseNum(amount) > 0 && <KV label={t('remaining_balance')} value={money(customer.balance - parseNum(amount))} strong />}
        </div>
      </Modal>
      <CustomerPicker open={open && picker} allowWalkIn={false} onClose={() => (setPicker(false), !customer && onClose())} onPick={(c) => (setCustomer(c), setPicker(false))} />
    </>
  );
}

/** Customer gives back empty cylinders (optionally gets security back). */
export function ReturnEmpties({ open, onClose, customer }) {
  const held = customer?.held_cylinders ?? [];
  const [typeUid, setTypeUid] = useState('');
  const [qty, setQty] = useState(1);
  const [refund, setRefund] = useState('');
  const [note, setNote] = useState('');
  const types = useGet(open ? '/types' : null, { all: 1 });
  const accounts = useMoneyChoices(open);
  const [moneyId, setMoneyId] = useState('');
  useDefaultMoney(accounts.data, moneyId, setMoneyId);
  const [onLow, lowUi] = useLowBalance();
  const h = held.find((x) => x.type_uid === typeUid);
  useEffect(() => {
    if (open) {
      setTypeUid(held[0]?.type_uid || '');
      setQty(1);
      setRefund('');
      setNote('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const perCyl = h && h.qty > 0 ? h.deposit / h.qty : 0;
  const save = useAct((body) => api.post(`/customers/${customer.uid}/returns`, body), {
    onSuccess: () => {
      toast(t('saved'));
      onClose();
    },
    onError: onLow,
  });
  const options = (types.data ?? []).filter((ty) => ty.unit === '').map((ty) => {
    const hh = held.find((x) => x.type_uid === ty.uid);
    return { value: ty.uid, label: `${ty.name}${hh ? ` (${hh.qty})` : ''}` };
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('return_cylinders')}
      icon={Undo2}
      iconColor="#B77D00"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button data-shortcut="save"
            icon={Check}
            loading={save.isPending}
            onClick={() => (typeUid && qty > 0 ? save.mutate({ type_uid: typeUid, qty, refund: parseNum(refund), money_id: parseNum(refund) > 0 && moneyId ? Number(moneyId) : undefined, note }) : toast(t('add_qty_first'), 'error'))}
          >
            {t('save')}
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <Select label={t('cylinder_type')} value={typeUid} onChange={setTypeUid} options={options} placeholder={t('select')} />
        <div className="flex items-center justify-between">
          <span className="font-semibold">{t('empty_qty_returned')}</span>
          <QtyStepper value={qty} onChange={setQty} min={1} />
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
          <MoneyInput label={opt(t('security_refund'))} value={refund} onChange={setRefund} />
          {perCyl > 0 && (
            <Button variant="soft" onClick={() => setRefund(String(Math.round(perCyl * qty)))}>
              {money(Math.round(perCyl * qty))}
            </Button>
          )}
        </div>
        <MoneySelect label={t('acc_paid_from')} list={accounts.data} value={moneyId} onChange={setMoneyId} disabled={!(parseNum(refund) > 0)} />
        {h && (
          <div className="text-[12.5px] text-muted">
            {t('cylinders_with_customer')}: {h.qty} · {t('security_held')}: {money(h.deposit)}
          </div>
        )}
        <Textarea label={opt(t('note'))} value={note} onChange={setNote} />
      </div>
      {lowUi}
    </Modal>
  );
}

/** Opening / correction of cylinders a customer holds (no stock change). */
export function SetHeld({ open, onClose, customer }) {
  const types = useGet(open ? '/types' : null);
  const [typeUid, setTypeUid] = useState('');
  const [qty, setQty] = useState(0);
  const [dep, setDep] = useState('');
  const held = customer?.held_cylinders ?? [];
  useEffect(() => {
    if (!open) return;
    const first = types.data?.[0]?.uid || '';
    setTypeUid((u) => u || first);
  }, [open, types.data]);
  useEffect(() => {
    const h = held.find((x) => x.type_uid === typeUid);
    setQty(h?.qty ?? 0);
    setDep(numInput(h?.deposit ?? 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeUid, open]);
  const save = useAct((body) => api.put(`/customers/${customer.uid}/held`, body), {
    onSuccess: () => {
      toast(t('saved'));
      onClose();
    },
    onError: (e) => toast(e.message, 'error'),
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('set_cylinders_held')}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button data-shortcut="save" icon={Check} loading={save.isPending} onClick={() => save.mutate({ type_uid: typeUid, qty, deposit: parseNum(dep) })}>
            {t('save')}
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <p className="text-[13px] text-muted">{t('set_held_help')}</p>
        <Select label={t('cylinder_type')} value={typeUid} onChange={setTypeUid} options={(types.data ?? []).filter((ty) => ty.unit === '').map((ty) => ({ value: ty.uid, label: ty.name }))} />
        <div className="flex items-center justify-between">
          <span className="font-semibold">{t('cylinders')}</span>
          <QtyStepper value={qty} onChange={setQty} />
        </div>
        <MoneyInput label={t('security_held')} value={dep} onChange={setDep} />
      </div>
    </Modal>
  );
}
