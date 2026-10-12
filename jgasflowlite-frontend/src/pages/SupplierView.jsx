import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Check, HandCoins, MapPin, PackagePlus, Pencil, Phone, Trash2 } from 'lucide-react';
import { api, useAct, useGet } from '@/lib/api';
import { dayKey, fDate, money, num0, parseNum } from '@/lib/format';
import { methodLabel, t } from '@/lib/i18n';
import { Async, Balance, Button, Card, cn, Empty, Initials, PageHeader } from '@/ui/kit';
import { DateInput, MethodPicker, MoneyInput, Textarea } from '@/ui/form';
import { Modal, toast, useConfirm } from '@/ui/overlay';
import { PartyForm } from './forms';

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
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <Initials name={s.name} size={46} tone="blue" />
                  <div className="font-bold text-[16px] truncate">{s.name}</div>
                </div>
                <div className="mt-3 space-y-1.5 text-[13.5px]">
                  {s.phone && (
                    <a href={`tel:${s.phone}`} className="flex items-center gap-2 text-primary font-semibold">
                      <Phone className="size-4" /> {s.phone}
                    </a>
                  )}
                  {s.address && (
                    <div className="flex items-center gap-2 text-muted">
                      <MapPin className="size-4" /> {s.address}
                    </div>
                  )}
                </div>
                <div className="mt-4 rounded-[var(--radius-card)] bg-bg p-3">
                  <div className="text-[12px] text-muted font-medium">{s.balance < -0.009 ? t('advance') : t('payable')}</div>
                  <Balance value={s.balance} label={false} className="text-[20px]" />
                </div>
              </Card>
              <div className="grid grid-cols-2 gap-2">
                <Button icon={PackagePlus} to="/app/purchases/new">
                  {t('purchase')}
                </Button>
                <Button variant="good" icon={HandCoins} onClick={() => setDlg('pay')}>
                  {t('pay_supplier')}
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
          <PartyForm open={dlg === 'edit'} kind="supplier" initial={s} onClose={() => setDlg(null)} />
          <PaySupplier open={dlg === 'pay'} supplier={s} onClose={() => setDlg(null)} />
        </div>
      )}
    </Async>
  );
}

function PaySupplier({ open, supplier, onClose }) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [date, setDate] = useState(dayKey());
  const [note, setNote] = useState('');
  const save = useAct((b) => api.post('/supplier-payments', b), {
    onSuccess: () => {
      toast(t('payment_saved'));
      setAmount('');
      setNote('');
      onClose();
    },
    onError: (e) => toast(e.message, 'error'),
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
          <Button
            variant="good"
            icon={Check}
            loading={save.isPending}
            onClick={() => (parseNum(amount) > 0 ? save.mutate({ supplier_uid: supplier.uid, amount: parseNum(amount), method, note, date: date === dayKey() ? undefined : date }) : toast(t('enter_amount'), 'error'))}
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
        <MethodPicker value={method} onChange={setMethod} />
        <div className="grid grid-cols-2 gap-3">
          <DateInput label={t('date')} value={date} onChange={setDate} max={dayKey()} />
        </div>
        <Textarea label={t('note')} value={note} onChange={setNote} />
      </div>
    </Modal>
  );
}
