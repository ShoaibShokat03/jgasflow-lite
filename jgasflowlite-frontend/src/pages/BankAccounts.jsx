import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, Banknote, Building2, Check, FileText, Pencil, Plus, Printer, Trash2 } from 'lucide-react';
import { api, useAct } from '@/lib/api';
import { dayKey, fDate, money, numInput, parseNum } from '@/lib/format';
import { methodLabel, opt, t } from '@/lib/i18n';
import { printNow } from '@/lib/print';
import { Async, Button, Card, cn, Empty, IconBox, PageHeader, Tag } from '@/ui/kit';
import { DateInput, MoneyInput, Switch, TextInput } from '@/ui/form';
import { Modal, toast, useConfirm } from '@/ui/overlay';
import { ExportMenu } from '@/ui/ExportMenu';
import { PrintCredit } from '@/ui/receipt';
import { PeriodFilter, usePeriod } from '@/ui/PeriodFilter';
import { useGet } from '@/lib/api';
import { useLowBalance, useMoneyAccounts } from './Accounts';
import { MoveMoney } from './MoveMoney';
import { Summary } from './Sales';

const METHODS = ['cash', 'bank', 'jazzcash', 'easypaisa', 'cheque'];

/** Where a movement's source record opens. */
const linkOf = (m) => (m.ref_type === 'payment' && m.link ? `/app/payments/${m.link}` : null);

export default function BankAccounts() {
  const q = useMoneyAccounts();
  const [form, setForm] = useState(null); // 'new' | account
  const [move, setMove] = useState(null); // { mode, account }
  const [statement, setStatement] = useState(null);
  const confirm = useConfirm();
  const del = useAct((id) => api.delete(`/accounts/money/${id}`), { onSuccess: () => toast(t('deleted')), onError: (e) => toast(e.message, 'error') });
  const below = (q.data ?? []).filter((a) => a.balance < -0.009);
  const list = q.data ?? [];
  return (
    <div>
      <PageHeader
        title={t('acc_banks')}
        sub={t('acc_banks_sub')}
        actions={
          <>
            <Button variant="outline" icon={ArrowLeftRight} disabled={list.length < 2} onClick={() => setMove({ mode: 'transfer' })}>
              {t('acc_transfer')}
            </Button>
            <Button data-shortcut="add" icon={Plus} onClick={() => setForm('new')}>
              {t('acc_add_bank')}
            </Button>
          </>
        }
      />
      <Async q={q}>
        {(rows) => {
          const cash = rows.filter((a) => a.kind === 'cash').reduce((s, a) => s + a.balance, 0);
          const bank = rows.filter((a) => a.kind === 'bank').reduce((s, a) => s + a.balance, 0);
          return (
            <>
              <div className="grid grid-cols-3 gap-2.5 mb-4">
                <Summary label={t('acc_cash')} value={money(cash)} />
                <Summary label={t('acc_bank')} value={money(bank)} />
                <Summary label={t('acc_total_money')} value={money(cash + bank)} />
              </div>
              {below.length > 0 && (
                <Card className="p-3.5 mb-3 border-bad/40 bg-bad/5 text-[13px]">
                  <span className="font-bold text-bad">{t('acc_below_zero')}</span> {below.map((a) => a.name).join(', ')}. {t('acc_below_zero_help')}
                </Card>
              )}
              {rows.length === 0 ? (
                <Card>
                  <Empty icon={Building2} title={t('acc_no_banks')} />
                </Card>
              ) : (
                <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {rows.map((a) => (
                    <Card key={a.id} className="p-4 flex flex-col">
                      <div className="flex items-start gap-3">
                        <IconBox icon={a.kind === 'cash' ? Banknote : Building2} color={a.kind === 'cash' ? '#2E7D32' : '#020033'} size={40} />
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-[15px] truncate">{a.name}</div>
                          <div className="text-[12px] text-muted truncate">{[a.title, a.number, a.branch].filter(Boolean).join(' · ') || (a.kind === 'cash' ? t('acc_cash_drawer') : t('acc_bank_or_wallet'))}</div>
                        </div>
                        <Tag tone={a.kind === 'cash' ? 'green' : 'navy'}>{a.kind === 'cash' ? t('acc_kind_cash') : t('acc_kind_bank')}</Tag>
                      </div>
                      <div className={cn('mt-3 text-[24px] font-black num whitespace-nowrap', a.balance < 0 && 'text-bad')}>{money(a.balance)}</div>
                      <div className="mt-1 flex flex-wrap gap-1.5 min-h-[22px]">
                        {a.methods.length ? (
                          a.methods.map((m) => (
                            <Tag key={m} tone="gray">
                              {methodLabel(m)}
                            </Tag>
                          ))
                        ) : (
                          <span className="text-[12px] text-muted">{t('acc_no_methods')}</span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-line">
                        <Button size="sm" variant="soft" icon={ArrowDownToLine} onClick={() => setMove({ mode: 'deposit', account: a })}>
                          {t(a.kind === 'cash' ? 'mm_add_cash' : 'acc_deposit')}
                        </Button>
                        <Button size="sm" variant="soft" icon={ArrowUpFromLine} onClick={() => setMove({ mode: 'withdraw', account: a })}>
                          {t(a.kind === 'cash' ? 'mm_take_cash' : 'acc_withdraw')}
                        </Button>
                        <Button size="sm" variant="outline" icon={FileText} onClick={() => setStatement(a)}>
                          {t('acc_statement')}
                        </Button>
                        <Button size="sm" variant="ghost" icon={Pencil} aria-label={t('edit')} title={t('edit')} onClick={() => setForm(a)} />
                        <Button
                          size="sm"
                          variant="danger-outline"
                          icon={Trash2}
                          className="ml-auto"
                          aria-label={t('delete')}
                          title={t('delete')}
                          onClick={async () => (await confirm({ title: `${t('delete')} ${a.name}?`, message: t('acc_delete_bank_msg'), okLabel: t('delete'), danger: true })) && del.mutate(a.id)}
                        />
                      </div>
                    </Card>
                  ))}
                </div>
              )}
              <p className="mt-3 text-[12.5px] text-muted">{t('acc_banks_help')}</p>
            </>
          );
        }}
      </Async>
      <BankForm open={!!form} initial={form === 'new' ? null : form} onClose={() => setForm(null)} all={list} />
      <MoveMoney open={!!move} mode={move?.mode} account={move?.account} list={list} onClose={() => setMove(null)} />
      <Statement account={statement} onClose={() => setStatement(null)} />
    </div>
  );
}

function BankForm({ open, initial, onClose, all }) {
  const blank = { name: '', kind: '', title: '', number: '', branch: '', opening_balance: '', opening_date: dayKey(), methods: [] };
  const [f, setF] = useState(blank);
  useEffect(() => {
    if (!open) return;
    setF(initial ? { ...initial, opening_balance: numInput(initial.opening_balance), methods: [...initial.methods] } : blank);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const owner = (m) => all.find((a) => a.methods.includes(m) && a.id !== initial?.id);
  const [onLow, lowUi] = useLowBalance(false);
  const save = useAct((b) => (initial ? api.put(`/accounts/money/${initial.id}`, b) : api.post('/accounts/money', b)), {
    onSuccess: () => {
      toast(t('saved'));
      onClose();
    },
    onError: onLow,
  });
  const allowed = METHODS.filter((m) => (f.kind === 'cash' ? m === 'cash' : m !== 'cash'));
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? t('edit') : t('acc_add_bank')}
      icon={Building2}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button data-shortcut="save"
            icon={Check}
            loading={save.isPending}
            onClick={() =>
              !f.kind
                ? toast(t('acc_choose_kind'), 'error')
                : f.name.trim().length < 2
                ? toast(t('required'), 'error')
                : save.mutate({
                    name: f.name.trim(),
                    kind: f.kind,
                    title: f.title.trim(),
                    number: f.number.trim(),
                    branch: f.branch.trim(),
                    opening_balance: parseNum(f.opening_balance),
                    opening_date: f.opening_date,
                    methods: f.methods.filter((m) => allowed.includes(m)),
                  })
            }
          >
            {t('save')}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3.5">
        {!initial && (
          <div className="col-span-2">
            <div className="label">{t('acc_type')}</div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'cash', icon: Banknote, label: t('acc_cash_drawer'), sub: t('acc_cash_drawer_sub') },
                { value: 'bank', icon: Building2, label: t('acc_bank_or_wallet'), sub: t('acc_bank_or_wallet_sub') },
              ].map((k) => {
                const on = f.kind === k.value;
                const KIcon = k.icon;
                return (
                  <button
                    key={k.value}
                    type="button"
                    onClick={() => setF((s) => ({ ...s, kind: k.value, methods: k.value === 'cash' ? ['cash'].filter((m) => !all.some((a) => a.methods.includes(m))) : [], title: '', number: '', branch: '' }))}
                    className={cn('flex items-start gap-2.5 rounded-[var(--radius-card)] border px-3 py-2.5 text-left transition', on ? 'border-primary bg-soft ring-2 ring-primary/15' : 'border-line bg-white hover:bg-bg')}
                  >
                    <KIcon className={cn('size-5 mt-0.5 shrink-0', on ? 'text-primary' : 'text-muted')} />
                    <span className="min-w-0">
                      <span className="block font-semibold text-[13.5px]">{k.label}</span>
                      <span className="block text-[11.5px] text-muted">{k.sub}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {f.kind && (
          <>
        <TextInput className="col-span-2" label={t('name')} value={f.name} onChange={set('name')} maxLength={120} placeholder={f.kind === 'cash' ? t('acc_cash_drawer') : 'Meezan Bank, JazzCash'} autoFocus />
        {f.kind === 'bank' && (
          <>
            <TextInput label={opt(t('account_title'))} value={f.title} onChange={set('title')} maxLength={120} />
            <TextInput label={opt(t('account_number'))} value={f.number} onChange={set('number')} maxLength={60} />
            <TextInput className="col-span-2" label={opt(t('branch'))} value={f.branch} onChange={set('branch')} maxLength={120} />
          </>
        )}
        <MoneyInput label={opt(t('acc_opening'))} value={f.opening_balance} onChange={set('opening_balance')} />
        <DateInput label={t('acc_opening_date')} value={f.opening_date} onChange={set('opening_date')} max={dayKey()} />
        <p className="col-span-2 -mt-1.5 text-[12px] text-muted">{t('acc_opening_help')}</p>
        <div className="col-span-2">
          <div className="label">{t('acc_methods_here')}</div>
          <div className="space-y-1.5">
            {allowed.map((m) => {
              const other = owner(m);
              return (
                <Switch
                  key={m}
                  checked={f.methods.includes(m)}
                  onChange={(on) => setF((s) => ({ ...s, methods: on ? [...s.methods, m] : s.methods.filter((x) => x !== m) }))}
                  label={methodLabel(m)}
                  sub={other && !f.methods.includes(m) ? `${t('acc_now_goes_to')} ${other.name}` : undefined}
                />
              );
            })}
          </div>
          <p className="mt-1.5 text-[12px] text-muted">{t('acc_methods_help')}</p>
        </div>
          </>
        )}
      </div>
      {lowUi}
    </Modal>
  );
}

function Statement({ account, onClose }) {
  const p = usePeriod('bank-statement', 'month');
  const q = useGet(account ? `/accounts/money/${account.id}/statement` : null, p.range);
  return (
    <Modal open={!!account} onClose={onClose} title={`${t('acc_statement')}: ${account?.name ?? ''}`} icon={FileText} size="xl">
      <PeriodFilter className="mb-3" p={p} />
      <Async q={q}>
        {(r) => (
          <div className="print-area">
            <div className="hidden print:block mb-2 font-bold">
              {r.account.name} · {p.label}
            </div>
            <div className="flex flex-wrap items-center gap-2 mb-2 no-print">
              <span className="text-[13px] text-muted">
                {t('acc_in')} {money(r.total_in)} · {t('acc_out')} {money(r.total_out)}
              </span>
              <ExportMenu
                className="ml-auto"
                title={`${r.account.name} ${p.label}`}
                columns={() => [
                  { label: t('col_date'), value: (x) => (x.date ? fDate(x.date) : '') },
                  { label: t('acc_description'), value: (x) => x.description },
                  { label: `${t('acc_in')} (Rs)`, type: 'money', value: (x) => x.money_in },
                  { label: `${t('acc_out')} (Rs)`, type: 'money', value: (x) => x.money_out },
                  { label: `${t('acc_balance')} (Rs)`, type: 'money', value: (x) => x.balance },
                ]}
                rows={[{ date: '', description: t('acc_opening'), money_in: 0, money_out: 0, balance: r.opening }, ...r.entries]}
              />
              <Button data-shortcut="print" size="sm" variant="outline" icon={Printer} onClick={() => printNow('doc')}>
                {t('print')}
              </Button>
            </div>
            <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line">
              <table className="w-full text-[13.5px] min-w-[620px]">
                <thead>
                  <tr className="bg-bg text-muted text-[12px] text-left">
                    <th className="font-semibold px-4 py-2.5">{t('col_date')}</th>
                    <th className="font-semibold px-2">{t('acc_description')}</th>
                    <th className="font-semibold px-2 text-right">{t('acc_in')}</th>
                    <th className="font-semibold px-2 text-right">{t('acc_out')}</th>
                    <th className="font-semibold px-4 text-right">{t('acc_balance')}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-line bg-bg/60">
                    <td className="px-4 py-2" colSpan={4}>
                      {t('acc_opening')}
                    </td>
                    <td className="px-4 text-right num font-semibold whitespace-nowrap">{money(r.opening)}</td>
                  </tr>
                  {r.entries.length === 0 && (
                    <tr>
                      <td className="px-4 py-3 text-muted" colSpan={5}>
                        {t('acc_nothing')}
                      </td>
                    </tr>
                  )}
                  {r.entries.map((m, i) => {
                    const to = linkOf(m);
                    return (
                      <tr key={i} className="border-t border-line">
                        <td className="px-4 py-2 whitespace-nowrap">{fDate(m.date)}</td>
                        <td className="px-2">
                          {to ? (
                            <Link to={to} className="text-primary hover:underline">
                              {m.description}
                            </Link>
                          ) : (
                            m.description
                          )}
                        </td>
                        <td className="px-2 text-right num whitespace-nowrap text-good">{m.money_in ? money(m.money_in) : ''}</td>
                        <td className="px-2 text-right num whitespace-nowrap text-bad">{m.money_out ? money(m.money_out) : ''}</td>
                        <td className="px-4 text-right num font-semibold whitespace-nowrap">{money(m.balance)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-line bg-bg font-bold">
                    <td className="px-4 py-2.5" colSpan={2}>
                      {t('acc_closing')}
                    </td>
                    <td className="px-2 text-right num whitespace-nowrap">{money(r.total_in)}</td>
                    <td className="px-2 text-right num whitespace-nowrap">{money(r.total_out)}</td>
                    <td className="px-4 text-right num whitespace-nowrap">{money(r.closing)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <PrintCredit className="hidden print:block" />
          </div>
        )}
      </Async>
    </Modal>
  );
}
