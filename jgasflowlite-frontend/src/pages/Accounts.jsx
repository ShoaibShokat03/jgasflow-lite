import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, BookOpen, Check, FileSpreadsheet, HandCoins, Landmark, ListTree, NotebookPen, Pencil, Plus, Printer, Scale, Trash2, TrendingUp, Wallet } from 'lucide-react';
import { api, useAct, useGet } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dayKey, fDate, money, numInput, parseNum } from '@/lib/format';
import { opt, t } from '@/lib/i18n';
import { printNow } from '@/lib/print';
import { Async, Button, Card, cn, Empty, PageHeader, SectionHeader, Tag } from '@/ui/kit';
import { Chips, DateInput, MoneyInput, Select, TextInput } from '@/ui/form';
import { Modal, toast, useConfirm } from '@/ui/overlay';
import { ExportMenu } from '@/ui/ExportMenu';
import { PrintCredit, useShopLogo } from '@/ui/receipt';
import { PeriodFilter, usePeriod } from '@/ui/PeriodFilter';
import { Summary } from './Sales';

const TYPE_LABEL = () => ({ asset: t('acc_t_asset'), liability: t('acc_t_liability'), income: t('acc_t_income'), expense: t('acc_t_expense'), equity: t('acc_t_equity') });
const KIND_LABEL = () => ({
  expense: t('acc_k_expense'),
  income: t('acc_k_income'),
  capital: t('acc_k_capital'),
  drawing: t('acc_k_drawing'),
  transfer: t('acc_k_transfer'),
  opening: t('acc_k_opening'),
  journal: t('acc_k_journal'),
  loan_taken: t('acc_k_loan_taken'),
  loan_repaid: t('acc_k_loan_repaid'),
  loan_given: t('acc_k_loan_given'),
  loan_back: t('acc_k_loan_back'),
});
const LOANS = ['loan_taken', 'loan_repaid', 'loan_given', 'loan_back'];
/** Entries that take money out of a cash/bank account. */
const OUT_KINDS = ['expense', 'drawing', 'loan_repaid', 'loan_given'];
const moneyCol = (label, key) => ({ label: `${label} (Rs)`, type: 'money', value: (r) => Number(r[key]) || 0 });

/** Where a ledger line's source record opens. */
function sourceLink(l) {
  if (!l.link) return null;
  if (l.ref_type === 'sale') return `/app/sales/${l.link}`;
  if (l.ref_type === 'payment') return `/app/payments/${l.link}`;
  if (l.ref_type === 'purchase') return `/app/purchases/${l.link}`;
  return null;
}

/** A page of the Accounts section, with an optional Print button. */
function Page({ title, sub, print, actions, children }) {
  return (
    <div>
      <PageHeader
        title={title}
        sub={sub}
        actions={
          (print || actions) && (
            <>
              {actions}
              {print && (
                <Button data-shortcut="print" variant="outline" icon={Printer} onClick={() => printNow('doc')}>
                  {t('print')}
                </Button>
              )}
            </>
          )
        }
      />
      {children}
    </div>
  );
}

/** "As at" date for the balance sheet and trial balance (default today). */
function useAsAt(key) {
  const [d, setD] = useState(() => {
    try {
      return sessionStorage.getItem(`jgf-asat:${key}`) || dayKey();
    } catch {
      return dayKey();
    }
  });
  const set = (v) => {
    const next = v || dayKey();
    setD(next);
    try {
      sessionStorage.setItem(`jgf-asat:${key}`, next);
    } catch {
      /* storage blocked */
    }
  };
  return [d, set];
}

function AsAtBar({ value, onChange }) {
  return (
    <div className="flex flex-wrap items-end gap-2.5 mb-3 no-print">
      <DateInput label={t('acc_as_at')} value={value} onChange={onChange} max={dayKey()} className="w-48" />
      <Button variant="outline" onClick={() => onChange(dayKey())}>
        {t('today')}
      </Button>
    </div>
  );
}

export function ChartPage() {
  return (
    <Page title={t('acc_chart')} sub={t('acc_chart_help')}>
      <ChartTab />
    </Page>
  );
}

export function LedgerPage() {
  const p = usePeriod('acc-ledger', 'month');
  return (
    <Page title={t('acc_ledger')} print>
      <PeriodFilter className="mb-3" p={p} />
      <LedgerTab p={p} />
    </Page>
  );
}

export function ProfitLossPage() {
  const p = usePeriod('acc-pnl', 'month');
  return (
    <Page title={t('acc_pnl')} print>
      <PeriodFilter className="mb-3" p={p} />
      <div className="no-print">
        <SummaryTab p={p} />
      </div>
      <SectionHeader title={t('acc_pnl')} />
      <PnlTab p={p} />
    </Page>
  );
}

export function BalanceSheetPage() {
  const [d, setD] = useAsAt('balance');
  return (
    <Page title={t('acc_balance_sheet')} print>
      <AsAtBar value={d} onChange={setD} />
      <BalanceTab asAt={d} />
    </Page>
  );
}

export function TrialBalancePage() {
  const [d, setD] = useAsAt('trial');
  return (
    <Page title={t('acc_trial')} print>
      <AsAtBar value={d} onChange={setD} />
      <TrialTab asAt={d} />
    </Page>
  );
}

export function JournalPage() {
  const p = usePeriod('acc-journal', 'month');
  return (
    <Page title={t('acc_journal')} print>
      <PeriodFilter className="mb-3" p={p} />
      <JournalTab p={p} />
    </Page>
  );
}

export function LoansPage() {
  const q = useGet('/accounts/loans');
  const p = usePeriod('acc-loans', 'all');
  const [form, setForm] = useState(null);
  return (
    <Page
      title={t('acc_loans')}
      sub={t('acc_loans_sub')}
      actions={
        <>
          <Button variant="outline" icon={HandCoins} onClick={() => setForm({ kind: 'loan_given' })}>
            {t('give_loan')}
          </Button>
          <Button data-shortcut="add" icon={Plus} onClick={() => setForm({ kind: 'loan_taken' })}>
            {t('take_loan')}
          </Button>
        </>
      }
    >
      <Async q={q}>
        {(r) => (
          <>
            <div className="grid grid-cols-2 gap-2.5 mb-4">
              <Summary label={t('loans_to_repay')} value={money(r.total_taken)} tone={r.total_taken > 0.009 ? 'red' : undefined} />
              <Summary label={t('loans_to_get_back')} value={money(r.total_given)} tone={r.total_given > 0.009 ? 'green' : undefined} />
            </div>
            {r.list.length === 0 ? (
              <Card>
                <Empty icon={HandCoins} title={t('acc_no_loans')} action={<Button icon={Plus} onClick={() => setForm({ kind: 'loan_taken' })}>{t('take_loan')}</Button>} />
              </Card>
            ) : (
              <Card className="overflow-hidden divide-rows">
                {r.list.map((x) => (
                  <div key={`${x.side}:${x.party}`} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold flex items-center gap-2 min-w-0">
                        <Tag tone={x.side === 'taken' ? 'red' : 'green'}>{t(x.side === 'taken' ? 'loan_side_taken' : 'loan_side_given')}</Tag>
                        <span className="truncate">{x.party}</span>
                      </div>
                      <div className="text-[12px] text-muted whitespace-nowrap overflow-hidden text-ellipsis">
                        {money(x.amount)} · {t('loan_returned')} {money(x.returned)} · {fDate(x.last)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] text-muted">{t('loan_left')}</div>
                      <div className={cn('font-black num whitespace-nowrap', x.balance > 0.009 && (x.side === 'taken' ? 'text-bad' : 'text-good'))}>{money(x.balance)}</div>
                    </div>
                    {x.balance > 0.009 && (
                      <Button size="sm" variant="soft" onClick={() => setForm({ kind: x.side === 'taken' ? 'loan_repaid' : 'loan_back', party: x.party, amount: numInput(x.balance) })}>
                        {t(x.side === 'taken' ? 'repay' : 'get_back')}
                      </Button>
                    )}
                  </div>
                ))}
              </Card>
            )}
          </>
        )}
      </Async>
      <SectionHeader title={t('acc_loan_entries')} />
      <PeriodFilter className="mb-3" p={p} />
      <EntriesTab p={p} only={LOANS} />
      <EntryForm open={!!form} initial={null} preset={form} onClose={() => setForm(null)} />
    </Page>
  );
}

/**
 * Handles "not enough money" from the server: explains it and, for the owner
 * or manager, offers to record a loan into that account for the amount short.
 * Returns [onError, dialogs]; render the dialogs once in the screen.
 */
export function useLowBalance(allowLoan = true) {
  const auth = useAuth();
  const [low, setLow] = useState(null);
  const [loan, setLoan] = useState(null);
  const canLoan = allowLoan && auth.isManager;
  const onError = (e) => {
    if (e?.code === 'LOW_BALANCE' && e.data) return setLow(e.data);
    toast(e?.message || t('error'), 'error');
  };
  const ui = (
    <>
      <Modal
        open={!!low}
        onClose={() => setLow(null)}
        title={t('low_balance_title')}
        icon={AlertTriangle}
        iconColor="#C62828"
        footer={
          <>
            <Button variant="outline" onClick={() => setLow(null)}>
              {t('ok')}
            </Button>
            {canLoan && (
              <Button
                icon={HandCoins}
                onClick={() => {
                  setLoan({ kind: 'loan_taken', money: String(low.account_id), amount: numInput(low.short) });
                  setLow(null);
                }}
              >
                {t('take_loan')}
              </Button>
            )}
          </>
        }
      >
        <p className="font-semibold">{t('low_balance_msg', { name: low?.account_name ?? '', available: money(low?.available ?? 0) })}</p>
        <p className="mt-2 text-[13px] text-muted">{t(canLoan ? 'low_balance_help' : 'low_balance_help_staff')}</p>
      </Modal>
      {canLoan && <EntryForm open={!!loan} initial={null} preset={loan} onClose={() => setLoan(null)} noLoan />}
    </>
  );
  return [onError, ui];
}

export function EntriesPage() {
  const p = usePeriod('acc-entries', 'month');
  return (
    <Page title={t('acc_entries')}>
      <PeriodFilter className="mb-3" p={p} />
      <EntriesTab p={p} />
    </Page>
  );
}

export default ChartPage;

/** Printed header for a report. */
function PrintHead({ title, sub }) {
  const { shop } = useAuth();
  const logo = useShopLogo();
  return (
    <div className="hidden print:block mb-3">
      {logo && <img src={logo} alt="" className="shop-logo max-h-12 max-w-[140px] object-contain mb-1" />}
      <div className="font-black text-[18px]">{shop?.name}</div>
      <div className="font-bold">{title}</div>
      <div className="text-[12px] text-muted">{sub}</div>
    </div>
  );
}

function Balanced({ ok }) {
  return ok ? <Tag tone="green">{t('acc_balanced')}</Tag> : <Tag tone="red">{t('acc_not_balanced')}</Tag>;
}

// ───────────────────────── summary

function SummaryTab({ p }) {
  const q = useGet('/accounts/summary', p.range);
  const tb = useGet('/accounts/trial-balance', { to: p.range.to });
  return (
    <Async q={q}>
      {(s) => (
        <>
          <SectionHeader title={t('acc_money_now')} action={tb.data && <Balanced ok={tb.data.balanced} />} className="mt-0" />
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5">
            <Summary label={t('acc_cash')} value={money(s.cash)} />
            <Summary label={t('acc_bank')} value={money(s.bank)} />
            <Summary label={t('acc_to_receive')} value={money(s.receivable)} tone={s.receivable > 0.009 ? 'red' : undefined} />
            <Summary label={t('acc_to_pay')} value={money(s.payable)} tone={s.payable > 0.009 ? 'red' : undefined} />
            <Summary label={t('acc_security_held')} value={money(s.security_held)} />
          </div>
          <SectionHeader title={`${t('acc_profit_period')} · ${p.label}`} />
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5">
            <Summary label={t('acc_gas_sales')} value={money(s.sales)} />
            <Summary label={t('acc_total_income')} value={money(s.income)} />
            <Summary label={t('acc_gas_purchases')} value={money(s.purchases)} />
            <Summary label={t('acc_total_expense')} value={money(s.expense)} />
            <Summary label={s.profit >= 0 ? t('acc_profit') : t('acc_loss')} value={money(Math.abs(s.profit))} tone={s.profit >= 0 ? 'green' : 'red'} />
          </div>
          <p className="mt-3 text-[12.5px] text-muted">{t('acc_summary_help')}</p>
        </>
      )}
    </Async>
  );
}

// ───────────────────────── profit and loss

function Rows({ items, total, label, tone }) {
  return (
    <Card className="overflow-hidden">
      <div className="divide-rows">
        {items.length === 0 && <div className="px-4 py-3 text-[13px] text-muted">{t('acc_nothing')}</div>}
        {items.map((x) => (
          <div key={x.code} className="flex items-center gap-3 px-4 py-2.5">
            <span className="text-[12px] text-muted num w-10 shrink-0">{x.code}</span>
            <span className="flex-1 min-w-0 truncate">{x.name}</span>
            <span className="num font-semibold whitespace-nowrap">{money(x.amount ?? x.balance)}</span>
          </div>
        ))}
        <div className="flex items-center gap-3 px-4 py-3 bg-bg font-bold">
          <span className="flex-1">{label}</span>
          <span className={cn('num whitespace-nowrap', tone === 'red' && 'text-bad', tone === 'green' && 'text-good')}>{money(total)}</span>
        </div>
      </div>
    </Card>
  );
}

function PnlTab({ p }) {
  const q = useGet('/accounts/profit-loss', p.range);
  return (
    <Async q={q}>
      {(r) => (
        <div className="print-area">
          <PrintHead title={t('acc_pnl')} sub={p.label} />
          <div className="flex justify-end no-print mb-2">
            <ExportMenu
              title={`${t('acc_pnl')} ${p.label}`}
              columns={() => [{ label: t('acc_section'), value: (x) => x.section }, { label: t('acc_code'), value: (x) => x.code }, { label: t('acc_account'), value: (x) => x.name }, moneyCol(t('amount'), 'amount')]}
              rows={[
                ...r.income.map((x) => ({ ...x, section: t('acc_t_income') })),
                { section: t('acc_total_income'), code: '', name: '', amount: r.total_income },
                ...r.expense.map((x) => ({ ...x, section: t('acc_t_expense') })),
                { section: t('acc_total_expense'), code: '', name: '', amount: r.total_expense },
                { section: r.net_profit >= 0 ? t('acc_profit') : t('acc_loss'), code: '', name: '', amount: r.net_profit },
              ]}
            />
          </div>
          <div className="grid lg:grid-cols-2 gap-4 items-start">
            <div>
              <SectionHeader title={t('acc_t_income')} className="mt-0" />
              <Rows items={r.income} total={r.total_income} label={t('acc_total_income')} />
            </div>
            <div>
              <SectionHeader title={t('acc_t_expense')} className="mt-0" />
              <Rows items={r.expense} total={r.total_expense} label={t('acc_total_expense')} />
            </div>
          </div>
          <Card className="mt-4 p-4 flex items-center justify-between">
            <span className="font-bold text-[15px]">{r.net_profit >= 0 ? t('acc_net_profit') : t('acc_net_loss')}</span>
            <span className={cn('text-[22px] font-black num whitespace-nowrap', r.net_profit >= 0 ? 'text-good' : 'text-bad')}>{money(Math.abs(r.net_profit))}</span>
          </Card>
          <PrintCredit className="hidden print:block" />
        </div>
      )}
    </Async>
  );
}

// ───────────────────────── balance sheet

function BalanceTab({ asAt }) {
  const q = useGet('/accounts/balance-sheet', { to: asAt });
  return (
    <Async q={q}>
      {(r) => (
        <div className="print-area">
          <PrintHead title={t('acc_balance_sheet')} sub={`${t('acc_as_at')} ${fDate(r.as_at)}`} />
          <div className="flex items-center gap-2 mb-2 no-print">
            <span className="text-[13px] text-muted">
              {t('acc_as_at')} {fDate(r.as_at)}
            </span>
            <Balanced ok={r.balanced} />
          </div>
          <div className="grid lg:grid-cols-2 gap-4 items-start">
            <div>
              <SectionHeader title={t('acc_t_asset')} className="mt-0" />
              <Rows items={r.assets} total={r.totals.assets} label={t('acc_total_assets')} />
            </div>
            <div>
              <SectionHeader title={t('acc_t_liability')} className="mt-0" />
              <Rows items={r.liabilities} total={r.totals.liabilities} label={t('acc_total_liabilities')} />
              <SectionHeader title={t('acc_t_equity')} />
              <Rows items={[...r.equity, { code: '', name: t('acc_retained'), balance: r.retained_earnings }]} total={r.totals.equity} label={t('acc_total_equity')} />
              <Card className="mt-3 p-3 flex items-center justify-between font-bold">
                <span>{t('acc_total_liab_equity')}</span>
                <span className="num whitespace-nowrap">{money(r.totals.liabilities_equity)}</span>
              </Card>
            </div>
          </div>
          <PrintCredit className="hidden print:block" />
        </div>
      )}
    </Async>
  );
}

// ───────────────────────── trial balance

function TrialTab({ asAt }) {
  const q = useGet('/accounts/trial-balance', { to: asAt });
  return (
    <Async q={q}>
      {(r) => (
        <div className="print-area">
          <PrintHead title={t('acc_trial')} sub={`${t('acc_as_at')} ${fDate(r.as_at)}`} />
          <div className="flex flex-wrap items-center gap-2 mb-2 no-print">
            <span className="text-[13px] text-muted">
              {t('acc_as_at')} {fDate(r.as_at)}
            </span>
            <Balanced ok={r.balanced} />
            <ExportMenu
              className="ml-auto"
              title={`${t('acc_trial')} ${r.as_at}`}
              columns={() => [{ label: t('acc_code'), value: (x) => x.code }, { label: t('acc_account'), value: (x) => x.name }, moneyCol(t('acc_debit'), 'debit'), moneyCol(t('acc_credit'), 'credit')]}
              rows={[...r.lines, { code: '', name: t('total'), debit: r.total_debit, credit: r.total_credit }]}
            />
          </div>
          <Card className="overflow-x-auto">
            <table className="w-full text-[13.5px] min-w-[520px]">
              <thead>
                <tr className="bg-bg text-muted text-[12px] text-left">
                  <th className="font-semibold px-4 py-2.5 w-16">{t('acc_code')}</th>
                  <th className="font-semibold px-2">{t('acc_account')}</th>
                  <th className="font-semibold px-2 text-right">{t('acc_debit')}</th>
                  <th className="font-semibold px-4 text-right">{t('acc_credit')}</th>
                </tr>
              </thead>
              <tbody>
                {r.lines.map((l) => (
                  <tr key={l.code} className="border-t border-line">
                    <td className="px-4 py-2 num text-muted">{l.code}</td>
                    <td className="px-2">{l.name}</td>
                    <td className="px-2 text-right num whitespace-nowrap">{l.debit ? money(l.debit) : ''}</td>
                    <td className="px-4 text-right num whitespace-nowrap">{l.credit ? money(l.credit) : ''}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-line bg-bg font-bold">
                  <td className="px-4 py-2.5" colSpan={2}>
                    {t('total')}
                  </td>
                  <td className="px-2 text-right num whitespace-nowrap">{money(r.total_debit)}</td>
                  <td className="px-4 text-right num whitespace-nowrap">{money(r.total_credit)}</td>
                </tr>
              </tfoot>
            </table>
          </Card>
          <PrintCredit className="hidden print:block" />
        </div>
      )}
    </Async>
  );
}

// ───────────────────────── account ledger

export function useChart() {
  return useGet('/accounts/chart');
}

function LedgerTab({ p }) {
  const chart = useChart();
  const [params, setParams] = useSearchParams();
  const code = params.get('code') || '1001';
  const setCode = (c) => setParams({ code: c }, { replace: true });
  const q = useGet(code ? `/accounts/ledger/${code}` : null, p.range);
  return (
    <>
      <div className="max-w-sm mb-3 no-print">
        <Select label={t('acc_account')} value={code} onChange={setCode} options={(chart.data ?? []).map((a) => ({ value: a.code, label: `${a.code} · ${a.name}` }))} />
      </div>
      <Async q={q}>
        {(r) => (
          <div className="print-area">
            <PrintHead title={`${t('acc_ledger')}: ${r.account.code} ${r.account.name}`} sub={p.label} />
            <div className="flex justify-end no-print mb-2">
              <ExportMenu
                title={`${t('acc_ledger')} ${r.account.name} ${p.label}`}
                columns={() => [
                  { label: t('col_date'), value: (x) => (x.date ? fDate(x.date) : '') },
                  { label: t('acc_ref'), value: (x) => x.ref || '' },
                  { label: t('acc_description'), value: (x) => x.description },
                  moneyCol(t('acc_debit'), 'debit'),
                  moneyCol(t('acc_credit'), 'credit'),
                  moneyCol(t('acc_balance'), 'balance'),
                ]}
                rows={[{ date: '', ref: '', description: t('acc_opening'), debit: 0, credit: 0, balance: r.opening }, ...r.entries, { date: '', ref: '', description: t('acc_closing'), debit: r.total_debit, credit: r.total_credit, balance: r.closing }]}
              />
            </div>
            <Card className="overflow-x-auto">
              <table className="w-full text-[13.5px] min-w-[680px]">
                <thead>
                  <tr className="bg-bg text-muted text-[12px] text-left">
                    <th className="font-semibold px-4 py-2.5">{t('col_date')}</th>
                    <th className="font-semibold px-2">{t('acc_description')}</th>
                    <th className="font-semibold px-2 text-right">{t('acc_debit')}</th>
                    <th className="font-semibold px-2 text-right">{t('acc_credit')}</th>
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
                  {r.entries.map((l, i) => {
                    const to = sourceLink(l);
                    return (
                      <tr key={i} className="border-t border-line">
                        <td className="px-4 py-2 whitespace-nowrap">{fDate(l.date)}</td>
                        <td className="px-2">{to ? <Link to={to} className="text-primary hover:underline">{l.description}</Link> : l.description}</td>
                        <td className="px-2 text-right num whitespace-nowrap">{l.debit ? money(l.debit) : ''}</td>
                        <td className="px-2 text-right num whitespace-nowrap">{l.credit ? money(l.credit) : ''}</td>
                        <td className="px-4 text-right num font-semibold whitespace-nowrap">{money(l.balance)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-line bg-bg font-bold">
                    <td className="px-4 py-2.5" colSpan={2}>
                      {t('acc_closing')}
                    </td>
                    <td className="px-2 text-right num whitespace-nowrap">{money(r.total_debit)}</td>
                    <td className="px-2 text-right num whitespace-nowrap">{money(r.total_credit)}</td>
                    <td className="px-4 text-right num whitespace-nowrap">{money(r.closing)}</td>
                  </tr>
                </tfoot>
              </table>
            </Card>
            <PrintCredit className="hidden print:block" />
          </div>
        )}
      </Async>
    </>
  );
}

// ───────────────────────── journal (every line)

function JournalTab({ p }) {
  const q = useGet('/accounts/journal', { ...p.range, limit: 5000 });
  return (
    <Async q={q}>
      {(r) => (
        <div className="print-area">
          <PrintHead title={t('acc_journal')} sub={p.label} />
          <div className="flex flex-wrap items-center gap-2 mb-2 no-print">
            <span className="text-[13px] text-muted">
              {r.lines.length} {t('acc_lines')}
            </span>
            <ExportMenu
              className="ml-auto"
              title={`${t('acc_journal')} ${p.label}`}
              columns={() => [
                { label: t('col_date'), value: (x) => fDate(x.date) },
                { label: t('acc_ref'), value: (x) => x.ref || '' },
                { label: t('acc_account'), value: (x) => `${x.code} ${x.account}` },
                { label: t('acc_description'), value: (x) => x.description },
                moneyCol(t('acc_debit'), 'debit'),
                moneyCol(t('acc_credit'), 'credit'),
              ]}
              rows={r.lines}
            />
          </div>
          {r.lines.length === 0 ? (
            <Card>
              <Empty icon={FileSpreadsheet} title={t('acc_nothing')} />
            </Card>
          ) : (
            <Card className="overflow-x-auto">
              <table className="w-full text-[13.5px] min-w-[760px]">
                <thead>
                  <tr className="bg-bg text-muted text-[12px] text-left">
                    <th className="font-semibold px-4 py-2.5">{t('col_date')}</th>
                    <th className="font-semibold px-2">{t('acc_account')}</th>
                    <th className="font-semibold px-2">{t('acc_description')}</th>
                    <th className="font-semibold px-2 text-right">{t('acc_debit')}</th>
                    <th className="font-semibold px-4 text-right">{t('acc_credit')}</th>
                  </tr>
                </thead>
                <tbody>
                  {r.lines.map((l, i) => {
                    const to = sourceLink(l);
                    return (
                      <tr key={i} className="border-t border-line">
                        <td className="px-4 py-2 whitespace-nowrap">{fDate(l.date)}</td>
                        <td className="px-2 whitespace-nowrap">
                          <span className="text-muted num">{l.code}</span> {l.account}
                        </td>
                        <td className="px-2">{to ? <Link to={to} className="text-primary hover:underline">{l.description}</Link> : l.description}</td>
                        <td className="px-2 text-right num whitespace-nowrap">{l.debit ? money(l.debit) : ''}</td>
                        <td className="px-4 text-right num whitespace-nowrap">{l.credit ? money(l.credit) : ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-line bg-bg font-bold">
                    <td className="px-4 py-2.5" colSpan={3}>
                      {t('total')}
                    </td>
                    <td className="px-2 text-right num whitespace-nowrap">{money(r.total_debit)}</td>
                    <td className="px-4 text-right num whitespace-nowrap">{money(r.total_credit)}</td>
                  </tr>
                </tfoot>
              </table>
            </Card>
          )}
        </div>
      )}
    </Async>
  );
}

// ───────────────────────── accounting-only entries

/** Cash drawers, banks and wallets for a dropdown. */
export function useMoneyAccounts() {
  return useGet('/accounts/money');
}
const moneyOpts = (list) => (list ?? []).map((a) => ({ value: String(a.id), label: `${a.name} (${money(a.balance)})` }));
/** The account a chart code goes to by default (older entries have no account). */
const defaultFor = (list, code) => String((list ?? []).find((a) => a.code === code)?.id ?? '');

export function EntryForm({ open, initial, onClose, chart, preset, noLoan }) {
  const auth = useAuth();
  const banks = useMoneyAccounts();
  const [onLow, lowUi] = useLowBalance(!noLoan);
  const loans = useGet(open ? '/accounts/loans' : null);
  const list = banks.data ?? [];
  const firstCash = defaultFor(list, '1001');
  const firstBank = defaultFor(list, '1002');
  const blank = { kind: 'expense', date: dayKey(), amount: '', account: '', money: '', from: '', to: '', party: '', note: '' };
  const [f, setF] = useState(blank);
  useEffect(() => {
    if (!open) return;
    if (initial) {
      const k = initial.kind;
      const out = OUT_KINDS.includes(k);
      setF({
        kind: k,
        date: initial.date,
        amount: String(initial.amount),
        account: k === 'expense' || k === 'journal' ? initial.debit_code : k === 'income' ? initial.credit_code : '',
        money: k === 'journal' ? initial.credit_code : String(initial.money_id ?? defaultFor(list, out ? initial.credit_code : initial.debit_code)),
        from: String(initial.money_id ?? defaultFor(list, initial.credit_code)),
        to: String(initial.to_id ?? defaultFor(list, initial.debit_code)),
        party: initial.party ?? '',
        note: initial.note,
      });
    } else setF({ ...blank, ...(preset || {}) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);
  // Defaults once the accounts are loaded: cash for money, cash to bank for a transfer.
  useEffect(() => {
    if (!open || initial || !list.length) return;
    setF((s) => ({ ...s, money: s.money || firstCash, from: s.from || firstCash, to: s.to || firstBank }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial, list.length]);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const active = (chart ?? []).filter((a) => a.active);
  const of = (type) => active.filter((a) => a.type === type).map((a) => ({ value: a.code, label: `${a.code} · ${a.name}` }));
  const all = active.map((a) => ({ value: a.code, label: `${a.code} · ${a.name}` }));
  const kinds = Object.entries(KIND_LABEL())
    .filter(([k]) => k !== 'journal' || auth.isOwner)
    .map(([value, label]) => ({ value, label }));
  const save = useAct((b) => (initial ? api.put(`/accounts/vouchers/${initial.id}`, b) : api.post('/accounts/vouchers', b)), {
    onSuccess: () => {
      toast(t('saved'));
      onClose();
    },
    onError: onLow,
  });
  const isLoan = LOANS.includes(f.kind);
  const submit = () => {
    const amount = parseNum(f.amount);
    if (!(amount > 0)) return toast(t('enter_amount'), 'error');
    if (isLoan && f.party.trim().length < 2) return toast(t('loan_party_needed'), 'error');
    const b = { kind: f.kind, date: f.date, amount, note: f.note.trim() };
    if (isLoan) Object.assign(b, { party: f.party.trim(), money_id: Number(f.money) });
    if (f.kind === 'expense' || f.kind === 'income') Object.assign(b, { account: f.account, money_id: Number(f.money) });
    if (['capital', 'drawing', 'opening'].includes(f.kind)) b.money_id = Number(f.money);
    if (f.kind === 'transfer') {
      if (f.from === f.to) return toast(t('acc_two_accounts'), 'error');
      Object.assign(b, { money_id: Number(f.from), to_id: Number(f.to) });
    }
    if (f.kind === 'journal') Object.assign(b, { account: f.account, money: f.money });
    if ((f.kind === 'expense' || f.kind === 'income' || f.kind === 'journal') && !f.account) return toast(t('acc_choose_account'), 'error');
    save.mutate(b);
  };
  const incomeOpts = of('income').filter((o) => o.value !== '3001');
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? `${t('edit')} ${initial.ref}` : t('acc_new_entry')}
      icon={NotebookPen}
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
        <Select className="col-span-2" label={t('acc_entry_type')} value={f.kind} onChange={(v) => setF((s) => ({ ...s, kind: v, account: '' }))} options={kinds} />
        <DateInput label={t('date')} value={f.date} onChange={set('date')} max={dayKey()} />
        <MoneyInput label={t('amount')} value={f.amount} onChange={set('amount')} />
        {f.kind === 'expense' && <Select className="col-span-2" label={t('acc_expense_account')} value={f.account} onChange={set('account')} options={of('expense')} placeholder={t('acc_choose')} />}
        {f.kind === 'income' && <Select className="col-span-2" label={t('acc_income_account')} value={f.account} onChange={set('account')} options={incomeOpts} placeholder={t('acc_choose')} />}
        {isLoan && (
          <>
            <TextInput className="col-span-2" label={t('loan_party')} value={f.party} onChange={set('party')} maxLength={120} list="jgf-loan-parties" />
            <datalist id="jgf-loan-parties">
              {[...new Set((loans.data?.list ?? []).map((x) => x.party))].map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </>
        )}
        {OUT_KINDS.includes(f.kind) && <Select className="col-span-2" label={t('acc_paid_from')} value={f.money} onChange={set('money')} options={moneyOpts(list)} />}
        {['income', 'capital', 'opening', 'loan_taken', 'loan_back'].includes(f.kind) && <Select className="col-span-2" label={t('acc_received_in')} value={f.money} onChange={set('money')} options={moneyOpts(list)} />}
        {f.kind === 'transfer' && (
          <>
            <Select label={t('from')} value={f.from} onChange={set('from')} options={moneyOpts(list)} />
            <Select label={t('to')} value={f.to} onChange={set('to')} options={moneyOpts(list)} />
          </>
        )}
        {f.kind === 'journal' && (
          <>
            <Select className="col-span-2" label={t('acc_debit_account')} value={f.account} onChange={set('account')} options={all} placeholder={t('acc_choose')} />
            <Select className="col-span-2" label={t('acc_credit_account')} value={f.money} onChange={set('money')} options={all} placeholder={t('acc_choose')} />
          </>
        )}
        <TextInput className="col-span-2" label={opt(t('note'))} value={f.note} onChange={set('note')} maxLength={200} />
        <p className="col-span-2 text-[12px] text-muted">{t(`acc_help_${f.kind}`)}</p>
      </div>
      {lowUi}
    </Modal>
  );
}

function EntriesTab({ p, only }) {
  const chart = useChart();
  const all = useGet('/accounts/vouchers', p.range);
  const q = only && all.data ? { ...all, data: all.data.filter((v) => only.includes(v.kind)) } : all;
  const [form, setForm] = useState(null); // 'new' | voucher
  const confirm = useConfirm();
  const [onLow, lowUi] = useLowBalance();
  const del = useAct((id) => api.delete(`/accounts/vouchers/${id}`), { onSuccess: () => toast(t('deleted')), onError: onLow });
  const kinds = KIND_LABEL();
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <p className="text-[13px] text-muted flex-1 min-w-[220px]">{only ? '' : t('acc_entries_help')}</p>
        <ExportMenu
          title={`${t('acc_entries')} ${p.label}`}
          columns={() => [
            { label: t('acc_ref'), value: (x) => x.ref },
            { label: t('col_date'), value: (x) => fDate(x.date) },
            { label: t('acc_entry_type'), value: (x) => kinds[x.kind] ?? x.kind },
            { label: t('acc_debit'), value: (x) => x.debit_name },
            { label: t('acc_credit'), value: (x) => x.credit_name },
            { label: t('loan_party'), value: (x) => x.party },
            moneyCol(t('amount'), 'amount'),
            { label: t('note'), value: (x) => x.note },
          ]}
          rows={q.data}
        />
        {!only && (
          <Button data-shortcut="add" icon={Plus} onClick={() => setForm('new')}>
            {t('acc_new_entry')}
          </Button>
        )}
      </div>
      <Async q={q}>
        {(rows) =>
          rows.length === 0 ? (
            <Card>
              <Empty icon={NotebookPen} title={t('acc_no_entries')} action={only ? undefined : <Button icon={Plus} onClick={() => setForm('new')}>{t('acc_new_entry')}</Button>} />
            </Card>
          ) : (
            <Card className="overflow-hidden divide-rows">
              {rows.map((v) => (
                <div key={v.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold flex items-center gap-2 flex-wrap">
                      <Tag tone={OUT_KINDS.includes(v.kind) ? 'red' : v.kind === 'transfer' || v.kind === 'journal' ? 'navy' : 'green'}>{kinds[v.kind]}</Tag>
                      <span className="truncate">{v.note || v.party || `${v.debit_name} / ${v.credit_name}`}</span>
                    </div>
                    <div className="text-[12px] text-muted">
                      {v.ref} · {fDate(v.date)} ·{' '}
                      {v.kind === 'transfer'
                        ? `${v.money_name || v.credit_name} ${t('to')} ${v.to_name || v.debit_name}`
                        : v.kind === 'journal'
                          ? `${t('acc_debit')}: ${v.debit_name} · ${t('acc_credit')}: ${v.credit_name}`
                          : `${v.party ? `${v.party} · ` : ''}${v.debit_name} · ${v.credit_name}${v.money_name ? ` (${v.money_name})` : ''}`}
                    </div>
                  </div>
                  <div className="font-black num whitespace-nowrap">{money(v.amount)}</div>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="soft" icon={Pencil} aria-label={t('edit')} title={t('edit')} onClick={() => setForm(v)} />
                    <Button
                      size="sm"
                      variant="danger-outline"
                      icon={Trash2}
                      aria-label={t('delete')}
                      title={t('delete')}
                      onClick={async () => (await confirm({ title: `${t('delete')} ${v.ref}?`, message: t('acc_delete_msg'), okLabel: t('delete'), danger: true })) && del.mutate(v.id)}
                    />
                  </div>
                </div>
              ))}
            </Card>
          )
        }
      </Async>
      <EntryForm open={!!form} initial={form === 'new' ? null : form} onClose={() => setForm(null)} chart={chart.data} />
      {lowUi}
    </>
  );
}

// ───────────────────────── chart of accounts

function ChartTab() {
  const q = useChart();
  const [form, setForm] = useState(null); // 'new' | account
  const [name, setName] = useState('');
  const [type, setType] = useState('expense');
  const types = TYPE_LABEL();
  useEffect(() => {
    if (form && form !== 'new') setName(form.name);
    else if (form === 'new') {
      setName('');
      setType('expense');
    }
  }, [form]);
  const save = useAct((b) => (form === 'new' ? api.post('/accounts/chart', b) : api.put(`/accounts/chart/${form.code}`, b)), {
    onSuccess: () => {
      toast(t('saved'));
      setForm(null);
    },
    onError: (e) => toast(e.message, 'error'),
  });
  const toggle = useAct((a) => api.put(`/accounts/chart/${a.code}`, { active: !a.active }), { onSuccess: () => toast(t('saved')), onError: (e) => toast(e.message, 'error') });
  const groups = useMemo(() => ['asset', 'liability', 'equity', 'income', 'expense'], []);
  return (
    <Async q={q}>
      {(list) => (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="flex-1" />
            <Button data-shortcut="add" icon={Plus} onClick={() => setForm('new')}>
              {t('acc_add_account')}
            </Button>
          </div>
          <div className="grid lg:grid-cols-2 gap-4 items-start">
            {groups.map((g) => (
              <div key={g}>
                <SectionHeader title={types[g]} className="mt-0" />
                <Card className="overflow-hidden divide-rows">
                  {list
                    .filter((a) => a.type === g)
                    .map((a) => (
                      <div key={a.code} className={cn('flex items-center gap-3 px-4 py-2.5', !a.active && 'opacity-55')}>
                        <span className="text-[12px] text-muted num w-10 shrink-0">{a.code}</span>
                        <Link to={`/app/accounts/ledger?code=${a.code}`} className="flex-1 min-w-0 truncate text-primary hover:underline" title={t('acc_open_ledger')}>
                          {a.name}
                        </Link>
                        {!a.active && <Tag tone="gray">{t('inactive')}</Tag>}
                        <span className="num font-semibold whitespace-nowrap">{money(a.balance)}</span>
                        <Button size="sm" variant="ghost" icon={Pencil} aria-label={t('edit')} title={t('edit')} onClick={() => setForm(a)} />
                        {!a.system && (
                          <Button size="sm" variant="ghost" className="whitespace-nowrap" onClick={() => toggle.mutate(a)}>
                            {a.active ? t('hide') : t('active')}
                          </Button>
                        )}
                      </div>
                    ))}
                </Card>
              </div>
            ))}
          </div>
          <Modal
            open={!!form}
            onClose={() => setForm(null)}
            title={form === 'new' ? t('acc_add_account') : t('edit')}
            icon={Landmark}
            footer={
              <>
                <Button variant="outline" onClick={() => setForm(null)}>
                  {t('cancel')}
                </Button>
                <Button data-shortcut="save" icon={Check} loading={save.isPending} onClick={() => (name.trim().length < 2 ? toast(t('required'), 'error') : save.mutate(form === 'new' ? { name: name.trim(), type } : { name: name.trim() }))}>
                  {t('save')}
                </Button>
              </>
            }
          >
            <div className="space-y-3.5">
              <TextInput label={t('name')} value={name} onChange={setName} maxLength={160} autoFocus />
              {form === 'new' && <Select label={t('acc_type')} value={type} onChange={setType} options={groups.map((g) => ({ value: g, label: types[g] }))} />}
            </div>
          </Modal>
        </>
      )}
    </Async>
  );
}
