import { useEffect, useState } from 'react';
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, Banknote, Building2, Check, HandCoins, UserRound } from 'lucide-react';
import { api, useAct } from '@/lib/api';
import { dayKey, money, parseNum } from '@/lib/format';
import { opt, t } from '@/lib/i18n';
import { Button, cn } from '@/ui/kit';
import { DateInput, MoneyInput, TextInput } from '@/ui/form';
import { Modal, toast } from '@/ui/overlay';
import { useLowBalance } from './Accounts';

/**
 * Deposit, withdraw or transfer, saying where the money comes from and where
 * it goes. A deposit asks its source: Cash in hand (or another account), new
 * money from the owner, or a loan. The flow card shows both balances before
 * and after, with the money moving across, and money out can never be more
 * than the account holds.
 *
 * mode: 'deposit' (into account) | 'withdraw' (out of account) | 'transfer'
 */
export function MoveMoney({ open, mode, account, list, onClose }) {
  const [onLow, lowUi] = useLowBalance();
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(dayKey());
  const [note, setNote] = useState('');
  const [party, setParty] = useState('');
  // Deposit: where it comes from. Withdraw: where it goes. 'acc:<id>' | 'capital' | 'loan' | 'drawing'
  const [other, setOther] = useState('');
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const others = list.filter((a) => a.id !== account?.id);
  useEffect(() => {
    if (!open) return;
    setAmount('');
    setDate(dayKey());
    setNote('');
    setParty('');
    const cash = others.find((a) => a.kind === 'cash');
    const bank = others.find((a) => a.kind === 'bank');
    if (mode === 'deposit') setOther(account?.kind === 'bank' && cash ? `acc:${cash.id}` : bank ? `acc:${bank.id}` : 'capital');
    if (mode === 'withdraw') setOther(account?.kind === 'bank' && cash ? `acc:${cash.id}` : bank ? `acc:${bank.id}` : 'drawing');
    if (mode === 'transfer') {
      const c = list.find((a) => a.kind === 'cash') ?? list[0];
      const b = list.find((a) => a.id !== c?.id);
      setFromId(String(c?.id ?? ''));
      setToId(String(b?.id ?? ''));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, account?.id]);

  const amt = parseNum(amount);
  const byId = (id) => list.find((a) => String(a.id) === String(id));
  const otherAcc = other.startsWith('acc:') ? byId(other.slice(4)) : null;
  // The two ends of the move.
  let from;
  let to;
  if (mode === 'transfer') {
    from = byId(fromId);
    to = byId(toId);
  } else if (mode === 'deposit') {
    to = account;
    from = otherAcc ?? { name: t(other === 'loan' ? 'mm_src_loan' : 'mm_src_capital'), external: true };
  } else {
    from = account;
    to = otherAcc ?? { name: t('mm_dst_drawing'), external: true };
  }
  const short = from && !from.external && amt > from.balance + 0.005;

  const save = useAct((b) => api.post('/accounts/vouchers', b), {
    onSuccess: () => {
      toast(t('saved'));
      onClose();
    },
    onError: onLow,
  });
  const submit = () => {
    if (!(amt > 0)) return toast(t('enter_amount'), 'error');
    if (!from || !to) return toast(t('choose_cash_bank'), 'error');
    if (!from.external && !to.external && from.id === to.id) return toast(t('acc_two_accounts'), 'error');
    if (short) return;
    const b = { date, amount: amt, note: note.trim() };
    if (!from.external && !to.external) Object.assign(b, { kind: 'transfer', money_id: from.id, to_id: to.id });
    else if (mode === 'deposit' && other === 'loan') {
      if (party.trim().length < 2) return toast(t('loan_party_needed'), 'error');
      Object.assign(b, { kind: 'loan_taken', party: party.trim(), money_id: to.id });
    } else if (mode === 'deposit') Object.assign(b, { kind: 'capital', money_id: to.id });
    else Object.assign(b, { kind: 'drawing', money_id: from.id });
    save.mutate(b);
  };

  const Icon = mode === 'deposit' ? ArrowDownToLine : mode === 'withdraw' ? ArrowUpFromLine : ArrowLeftRight;
  const title = mode === 'transfer' ? t('acc_transfer') : `${t(mode === 'deposit' ? 'acc_deposit' : 'acc_withdraw')}: ${account?.name ?? ''}`;
  const accChoice = (a) => ({ value: `acc:${a.id}`, label: a.name, sub: `${t('acc_balance')}: ${money(a.balance)}`, icon: a.kind === 'cash' ? Banknote : Building2 });
  const choices =
    mode === 'deposit'
      ? [...others.map(accChoice), { value: 'capital', label: t('mm_src_capital'), sub: t('mm_src_capital_sub'), icon: UserRound }, { value: 'loan', label: t('mm_src_loan'), sub: t('mm_src_loan_sub'), icon: HandCoins }]
      : [...others.map(accChoice), { value: 'drawing', label: t('mm_dst_drawing'), sub: t('mm_dst_drawing_sub'), icon: UserRound }];
  const okLabel = amt > 0 && from && to ? t('mm_confirm', { amount: money(amt), from: from.name, to: to.name }) : t('save');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      icon={Icon}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button icon={Check} loading={save.isPending} disabled={!!short} onClick={submit} className="max-w-full">
            <span className="truncate">{okLabel}</span>
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <MoneyInput label={t('amount')} value={amount} onChange={setAmount} autoFocus />
          <DateInput label={t('date')} value={date} onChange={setDate} max={dayKey()} />
        </div>

        {mode === 'transfer' ? (
          <div className="grid grid-cols-2 gap-3">
            <AccountPick label={t('from')} list={list} value={fromId} onChange={setFromId} />
            <AccountPick label={t('to')} list={list} value={toId} onChange={setToId} />
          </div>
        ) : (
          <div>
            <div className="label">{t(mode === 'deposit' ? 'mm_where_from' : 'mm_where_to')}</div>
            <div className="grid sm:grid-cols-2 gap-2">
              {choices.map((c) => {
                const on = c.value === other;
                const CIcon = c.icon;
                return (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setOther(c.value)}
                    className={cn(
                      'flex items-center gap-2.5 rounded-[var(--radius-card)] border px-3 py-2.5 text-left transition',
                      on ? 'border-primary bg-soft ring-2 ring-primary/15' : 'border-line bg-white hover:bg-bg',
                    )}
                  >
                    <CIcon className={cn('size-5 shrink-0', on ? 'text-primary' : 'text-muted')} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-[13.5px] truncate">{c.label}</span>
                      <span className="block text-[11.5px] text-muted truncate">{c.sub}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {mode === 'deposit' && other === 'loan' && <TextInput label={t('loan_party')} value={party} onChange={setParty} maxLength={120} />}

        {from && to && <Flow from={from} to={to} amount={amt} />}

        {short && (
          <div className="rounded-[var(--radius-card)] border border-bad/30 bg-bad/5 px-3 py-2.5 text-[13px]">
            <div className="font-bold text-bad">{t('mm_short', { name: from.name, available: money(Math.max(0, from.balance)) })}</div>
            {mode === 'deposit' && (
              <div className="flex flex-wrap gap-2 mt-2">
                <Button size="sm" variant="soft" icon={UserRound} onClick={() => setOther('capital')}>
                  {t('mm_use_capital')}
                </Button>
                <Button size="sm" variant="soft" icon={HandCoins} onClick={() => setOther('loan')}>
                  {t('take_loan')}
                </Button>
              </div>
            )}
            {mode !== 'deposit' && <div className="mt-1 text-muted">{t('mm_short_help')}</div>}
          </div>
        )}

        <TextInput label={opt(t('note'))} value={note} onChange={setNote} maxLength={200} />
      </div>
      {lowUi}
    </Modal>
  );
}

function AccountPick({ label, list, value, onChange }) {
  return (
    <div>
      <div className="label">{label}</div>
      <select className="ctl" value={value} onChange={(e) => onChange(e.target.value)}>
        {list.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} ({money(a.balance)})
          </option>
        ))}
      </select>
    </div>
  );
}

/** From card, moving money, to card: balances now and after the move. */
function Flow({ from, to, amount }) {
  const moving = amount > 0;
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-bg p-3">
      <div className="grid grid-cols-[minmax(0,1fr)_72px_minmax(0,1fr)] sm:grid-cols-[minmax(0,1fr)_110px_minmax(0,1fr)] items-center gap-2">
        <End acc={from} delta={-amount} />
        <div className="relative h-10" aria-hidden="true">
          <div className="absolute top-1/2 left-1 right-3 -translate-y-1/2 border-t-2 border-dashed border-[#c7cad6]" />
          <div className="absolute top-1/2 right-0 -translate-y-1/2 size-0 border-y-[6px] border-y-transparent border-l-[9px] border-l-[#c7cad6]" />
          {moving &&
            [0, 1, 2].map((i) => (
              <span key={i} className="jgf-coin absolute top-1/2 left-0 grid place-items-center size-5 -mt-2.5 rounded-full bg-accent text-white text-[10px] font-black shadow" style={{ animationDelay: `${i * 0.45}s` }}>
                Rs
              </span>
            ))}
        </div>
        <End acc={to} delta={amount} />
      </div>
      <div className="mt-2 text-center text-[12px] text-muted">{moving ? t('mm_flow_note', { amount: money(amount) }) : t('mm_flow_empty')}</div>
    </div>
  );
}

function End({ acc, delta }) {
  const Icon = acc.external ? UserRound : acc.kind === 'cash' ? Banknote : Building2;
  const after = acc.external ? null : acc.balance + delta;
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-white px-2.5 py-2 min-w-0">
      <div className="flex items-center gap-1.5 min-w-0">
        <Icon className={cn('size-4 shrink-0', acc.external ? 'text-muted' : acc.kind === 'cash' ? 'text-good' : 'text-primary')} />
        <span className="font-semibold text-[13px] truncate">{acc.name}</span>
      </div>
      {acc.external ? (
        <div className="text-[11.5px] text-muted mt-0.5 truncate">{t('mm_outside')}</div>
      ) : (
        <div className="mt-0.5 text-[11.5px] whitespace-nowrap overflow-hidden text-ellipsis">
          <span className="text-muted num">{money(acc.balance)}</span>
          {delta !== 0 && (
            <>
              <span className="mx-1 text-muted">{'>'}</span>
              <span className={cn('num font-bold', after < -0.005 ? 'text-bad' : delta > 0 ? 'text-good' : 'text-ink')}>{money(after)}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

