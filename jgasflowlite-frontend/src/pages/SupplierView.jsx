import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Check, FileText, HandCoins, MapPin, PackagePlus, Pencil, Phone, ReceiptText, Trash2, Truck, Wallet } from 'lucide-react';
import { api, useAct, useGet } from '@/lib/api';
import { supplierLedgerColumns } from '@/features/exports';
import { ExportMenu } from '@/ui/ExportMenu';
import { dayKey, fDate, money, num0, parseNum } from '@/lib/format';
import { methodLabel, opt, t } from '@/lib/i18n';
import { MoneySelect, useDefaultMoney, useMoneyChoices } from '@/ui/money';
import { useLowBalance } from './Accounts';
import { Async, Button, Card, cn, Empty, PageHeader } from '@/ui/kit';
import { DateInput, MoneyInput, Textarea } from '@/ui/form';
import { Modal, toast, useConfirm } from '@/ui/overlay';
import { PartyForm } from './forms';
import { printNow } from '@/lib/print';
import { Statement } from '@/ui/statement';

export default function SupplierView() {
  const { uid } = useParams();
  const q = useGet(`/suppliers/${uid}/ledger`);
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [dlg, setDlg] = useState(null);
  const del = useAct(() => api.delete(`/suppliers/${uid}`), {
    onSuccess: (r) => {
      toast(r.deleted ? t('deleted') : t('archived'));
      navigate('/app/suppliers', { replace: true });
    },
    onError: (e) => toast(e.message, 'error'),
  });
  const delPay = useAct((pid) => api.delete(`/supplier-payments/${pid}`), { onSuccess: () => toast(t('deleted')), onError: (e) => toast(e.message, 'error') });

  return (
    <Async q={q}>
      {({ supplier: s, entries }) => (
        <div>
          <PageHeader
            back="/app/suppliers"
            title={s.name}
            actions={
              <>
                <ExportMenu title={t('x_statement', { name: s.name })} columns={supplierLedgerColumns} rows={entries} />
                <Button variant="outline" icon={Pencil} onClick={() => setDlg('edit')}>
                  {t('edit')}
                </Button>
                <Button
                  variant="danger-outline"
                  icon={Trash2}
                  onClick={async () => {
                    if (await confirm({ title: t('delete_supplier'), message: t('delete_customer_msg'), okLabel: t('delete'), danger: true })) del.mutate();
                  }}
                />
              </>
            }
          />
          <div className="grid lg:grid-cols-[320px_1fr] gap-5 items-start">
            <div className="space-y-3">
              <SupplierCard s={s} entries={entries} />
              <div className="grid grid-cols-2 gap-2">
                <Button icon={PackagePlus} to="/app/purchases/new">
                  {t('purchase')}
                </Button>
                <Button variant="good" icon={HandCoins} onClick={() => setDlg('pay')}>
                  {t('pay_supplier')}
                </Button>
                <Button data-shortcut="print" variant="outline" icon={FileText} className="col-span-2" onClick={() => printNow('doc')}>
                  {t('statement')}
                </Button>
              </div>
            </div>
            <Card className="overflow-hidden">
              {entries.length <= 1 && !entries[0]?.debit && !entries[0]?.credit ? (
                <Empty title={t('no_transactions')} />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="bg-bg text-muted text-[12px]">
                        <th className="text-left font-semibold px-4 py-2.5">{t('date')}</th>
                        <th className="text-left font-semibold px-2">{t('detail')}</th>
                        <th className="text-right font-semibold px-2">{t('purchase')}</th>
                        <th className="text-right font-semibold px-2">{t('paid')}</th>
                        <th className="text-right font-semibold px-4">{t('balance')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((e, i) => (
                        <tr key={i} className={cn('border-t border-line', e.kind === 'purchase' && 'hover:bg-soft/50 cursor-pointer')} onClick={() => e.kind === 'purchase' && navigate(`/app/purchases/${e.uid}`)}>
                          <td className="px-4 py-2.5 whitespace-nowrap text-muted">{e.kind === 'opening' ? '' : fDate(e.date)}</td>
                          <td className="px-2 py-2.5 min-w-[160px]">
                            <div className="font-semibold">{e.kind === 'opening' ? t('opening_balance') : e.kind === 'purchase' ? `${t('purchase')} ${e.ref}` : t('paid_to_supplier')}</div>
                            <div className="text-[12px] text-muted">{e.kind === 'payment' ? `${methodLabel(e.method)}${e.ref ? ` · ${e.ref}` : ''}` : e.detail}</div>
                          </td>
                          <td className="px-2 text-right num">{e.debit ? num0(e.debit) : ''}</td>
                          <td className="px-2 text-right num text-good">
                            {e.credit ? num0(e.credit) : ''}
                            {e.standalone && (
                              <button
                                type="button"
                                className="ml-2 inline-grid place-items-center size-7 rounded-[var(--radius-xs)] border border-[#f0c4c4] text-bad hover:bg-[#fff5f5] align-middle"
                                aria-label={t('delete')}
                                onClick={async (ev) => {
                                  ev.stopPropagation();
                                  if (await confirm({ title: t('delete_payment'), message: t('delete_sp_msg'), okLabel: t('delete'), danger: true })) delPay.mutate(e.uid);
                                }}
                              >
                                <Trash2 className="size-4" />
                              </button>
                            )}
                          </td>
                          <td className={cn('px-4 text-right num font-bold', e.balance > 0.009 && 'text-bad')}>{money(e.balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
          <Statement
            title={t('supplier_statement')}
            party={{ kindLabel: t('supplier'), name: s.name, phone: s.phone, address: s.address }}
            entries={entries}
            cols={{ debit: t('purchase'), credit: t('paid') }}
            summary={summaryOf(s, entries)}
            describe={(e) =>
              e.kind === 'opening'
                ? t('opening_balance')
                : e.kind === 'purchase'
                  ? `${t('purchase')} ${e.ref}${e.detail ? `, ${e.detail}` : ''}`
                  : `${t('paid_to_supplier')}, ${methodLabel(e.method)}`
            }
          />
          <PartyForm open={dlg === 'edit'} kind="supplier" initial={s} onClose={() => setDlg(null)} />
          <PaySupplier open={dlg === 'pay'} supplier={s} onClose={() => setDlg(null)} />
        </div>
      )}
    </Async>
  );
}

function PaySupplier({ open, supplier, onClose }) {
  const [amount, setAmount] = useState('');
  const accounts = useMoneyChoices(open);
  const [moneyId, setMoneyId] = useState('');
  useDefaultMoney(accounts.data, moneyId, setMoneyId);
  const [onLow, lowUi] = useLowBalance();
  const [date, setDate] = useState(dayKey());
  const [note, setNote] = useState('');
  const save = useAct((b) => api.post('/supplier-payments', b), {
    onSuccess: () => {
      toast(t('payment_saved'));
      setAmount('');
      setNote('');
      onClose();
    },
    onError: onLow,
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${t('pay_supplier')} · ${supplier.name}`}
      icon={HandCoins}
      iconColor="#2E7D32"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button data-shortcut="save"
            variant="good"
            icon={Check}
            loading={save.isPending}
            onClick={() =>
              !(parseNum(amount) > 0)
                ? toast(t('enter_amount'), 'error')
                : !moneyId
                  ? toast(t('choose_cash_bank'), 'error')
                  : save.mutate({ supplier_uid: supplier.uid, amount: parseNum(amount), money_id: Number(moneyId), note, date: date === dayKey() ? undefined : date })
            }
          >
            {t('save_payment')}
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
          <MoneyInput label={t('amount')} value={amount} onChange={setAmount} autoFocus />
          {supplier.balance > 0 && (
            <Button variant="soft" onClick={() => setAmount(String(supplier.balance))}>
              {t('full_balance')}
            </Button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <MoneySelect label={t('acc_paid_from')} list={accounts.data} value={moneyId} onChange={setMoneyId} />
          <DateInput label={t('date')} value={date} onChange={setDate} max={dayKey()} />
        </div>
        <Textarea label={opt(t('note'))} value={note} onChange={setNote} />
      </div>
      {lowUi}
    </Modal>
  );
}

/** Totals for the card and the printed statement. */
function summaryOf(s, entries) {
  const sum = (k) => entries.filter((e) => e.kind !== 'opening').reduce((a, e) => a + (Number(e[k]) || 0), 0);
  const opening = entries.find((e) => e.kind === 'opening');
  return [
    { label: t('opening_balance'), value: money((opening?.debit || 0) - (opening?.credit || 0)) },
    { label: t('total_purchases'), value: money(sum('debit')) },
    { label: t('total_paid'), value: money(sum('credit')) },
    { label: s.balance < -0.009 ? t('advance') : t('payable'), value: money(Math.abs(s.balance)), tone: s.balance > 0.009 ? 'red' : s.balance < -0.009 ? 'green' : undefined },
  ];
}

/** The supplier at a glance: contact, what is owed, and how much business is done. */
function SupplierCard({ s, entries }) {
  const purchases = entries.filter((e) => e.kind === 'purchase');
  const last = purchases.reduce((a, e) => (!a || String(e.date) > String(a) ? e.date : a), null);
  const sum = (k) => entries.filter((e) => e.kind !== 'opening').reduce((a, e) => a + (Number(e[k]) || 0), 0);
  return (
    <Card className="overflow-hidden">
      <div className="bg-gradient-to-br from-primary to-primary-2 text-white p-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="grid place-items-center size-12 rounded-[var(--radius-card)] bg-white/12 shrink-0">
            <Truck className="size-6" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-white/60 font-bold">{t('supplier')}</div>
            <div className="font-black text-[17px] leading-tight [overflow-wrap:anywhere] line-clamp-2">{s.name}</div>
          </div>
        </div>
        <div className="mt-4">
          <div className="text-[12px] text-white/65 font-medium">{s.balance < -0.009 ? t('advance') : t('payable')}</div>
          <div className={cn('text-[26px] font-black num leading-tight', s.balance > 0.009 ? 'text-[#FFB4A8]' : 'text-white')}>{money(Math.abs(s.balance))}</div>
        </div>
      </div>
      <div className="p-4 space-y-2.5 text-[13.5px]">
        {s.phone ? (
          <a href={`tel:${s.phone}`} className="flex items-center gap-2.5 text-primary font-semibold hover:underline">
            <span className="grid place-items-center size-8 rounded-[var(--radius-xs)] bg-soft shrink-0">
              <Phone className="size-4" />
            </span>
            {s.phone}
          </a>
        ) : null}
        {s.address ? (
          <div className="flex items-start gap-2.5 text-muted">
            <span className="grid place-items-center size-8 rounded-[var(--radius-xs)] bg-soft shrink-0">
              <MapPin className="size-4 text-primary" />
            </span>
            <span className="min-w-0 pt-1.5 [overflow-wrap:anywhere]">{s.address}</span>
          </div>
        ) : null}
        <div className="grid grid-cols-3 gap-2 pt-1">
          {[
            [ReceiptText, t('purchases'), String(purchases.length)],
            [PackagePlus, t('total_purchases'), money(sum('debit'))],
            [Wallet, t('total_paid'), money(sum('credit'))],
          ].map(([Icon, label, value]) => (
            <div key={label} className="rounded-[var(--radius-ctl)] bg-bg px-2.5 py-2 min-w-0">
              <Icon className="size-4 text-muted" />
              <div className="text-[11px] text-muted mt-1 truncate">{label}</div>
              <div className="font-bold num truncate">{value}</div>
            </div>
          ))}
        </div>
        <div className="text-[12px] text-muted">
          {t('last_purchase')}: {last ? fDate(last) : t('none_yet')}
        </div>
      </div>
    </Card>
  );
}
