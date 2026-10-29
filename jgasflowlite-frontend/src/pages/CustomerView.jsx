import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Check, Cylinder, FileText, HandCoins, MapPin, Pencil, Phone, Plus, Settings2, Tag as TagIcon, Trash2, Undo2, X } from 'lucide-react';
import { api, useAct, useGet } from '@/lib/api';
import { ledgerColumns } from '@/features/exports';
import { ExportMenu } from '@/ui/ExportMenu';
import { useAuth } from '@/lib/auth';
import { fDate, MAX_UNIT_PRICE, money, num0, parseNum } from '@/lib/format';
import { methodLabel, t } from '@/lib/i18n';
import { Async, Balance, Button, Card, cn, Empty, IconBox, Initials, PageHeader, Tag } from '@/ui/kit';
import { Chips, MoneyInput } from '@/ui/form';
import { toast, useConfirm } from '@/ui/overlay';
import { PartyForm, ReceivePayment, ReturnEmpties, SetHeld } from './forms';
import { printNow } from '@/lib/print';
import { Statement } from '@/ui/statement';

export default function CustomerView() {
  const { uid } = useParams();
  const q = useGet(`/customers/${uid}`);
  return <Async q={q}>{(c) => <View c={c} />}</Async>;
}

function View({ c }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [tab, setTab] = useState('ledger');
  const [dlg, setDlg] = useState(null);
  const ledger = useGet(`/customers/${c.uid}/ledger`);
  /** Always answers: with no cylinders out, say so instead of a dead button. */
  const openReturn = () => (c.held_cylinders.length ? setDlg('return') : toast(t('no_cylinders_to_return'), 'info'));
  const del = useAct(() => api.delete(`/customers/${c.uid}`), {
    onSuccess: (r) => {
      toast(r.deleted ? t('deleted') : t('archived'));
      navigate('/app/customers', { replace: true });
    },
    onError: (e) => toast(e.message, 'error'),
  });

  return (
    <div>
      <PageHeader
        back="/app/customers"
        title={c.name}
        sub={t(c.type)}
        actions={
          <>
            <ExportMenu title={t('x_statement', { name: c.name })} columns={ledgerColumns} rows={ledger.data?.entries} />
            <Button variant="outline" icon={Pencil} onClick={() => setDlg('edit')}>
              {t('edit')}
            </Button>
            {auth.isManager && (
              <Button
                variant="danger-outline"
                icon={Trash2}
                onClick={async () => {
                  if (await confirm({ title: t('delete_customer'), message: t('delete_customer_msg'), okLabel: t('delete'), danger: true })) del.mutate();
                }}
              />
            )}
          </>
        }
      />

      <div className="grid lg:grid-cols-[340px_1fr] gap-5 items-start">
        <div className="space-y-3 no-print">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <Initials name={c.name} size={48} tone={c.type === 'wholesale' ? 'purple' : 'navy'} />
              <div className="min-w-0 flex-1">
                <div className="font-bold text-[16px] break-words [overflow-wrap:anywhere] line-clamp-2">{c.name}</div>
                <Tag tone={c.type === 'wholesale' ? 'purple' : 'navy'}>{t(c.type)}</Tag>
              </div>
            </div>
            <div className="mt-3 space-y-1.5 text-[13.5px] min-w-0">
              {c.phone && (
                <a href={`tel:${c.phone}`} className="flex items-center gap-2 text-primary font-semibold hover:underline">
                  <Phone className="size-4" /> {c.phone}
                </a>
              )}
              {c.address && (
                <div className="flex items-start gap-2 text-muted">
                  <MapPin className="size-4 shrink-0 mt-0.5" /> <span className="min-w-0 [overflow-wrap:anywhere]">{c.address}</span>
                </div>
              )}
              {c.note && <div className="text-muted text-[12.5px] [overflow-wrap:anywhere] whitespace-pre-line">{c.note}</div>}
            </div>
            <div className="mt-4 rounded-[var(--radius-card)] bg-bg p-3 grid grid-cols-2 gap-2">
              <div>
                <div className="text-[12px] text-muted font-medium">{c.balance < -0.009 ? t('advance') : t('udhaar')}</div>
                <Balance value={c.balance} label={false} className="text-[20px]" />
              </div>
              <div>
                <div className="text-[12px] text-muted font-medium">{t('cylinders')}</div>
                <div className="text-[20px] font-bold num text-purple">{c.held}</div>
              </div>
            </div>
          </Card>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="accent" icon={Plus} to={`/app/sales/new?customer=${c.uid}`}>
              {t('new_sale')}
            </Button>
            <Button variant="good" icon={HandCoins} onClick={() => setDlg('pay')}>
              {t('receive_payment')}
            </Button>
            <Button variant="outline" icon={Undo2} onClick={openReturn}>
              {t('return_cylinders')}
            </Button>
            <Button data-shortcut="print" variant="outline" icon={FileText} onClick={() => printNow('doc')}>
              {t('statement')}
            </Button>
          </div>
        </div>

        <div className="min-w-0">
          <Chips
            className="mb-3 no-print"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'ledger', label: t('ledger') },
              { value: 'cyl', label: t('cylinders'), count: c.held },
              ...(auth.isManager ? [{ value: 'prices', label: t('special_price') }] : []),
            ]}
          />
          {tab === 'ledger' && <Ledger c={c} />}
          {tab === 'cyl' && <Held c={c} onSet={() => setDlg('held')} onReturn={openReturn} canSet={auth.isManager} />}
          {tab === 'prices' && <SpecialPrices c={c} />}
        </div>
      </div>

      <CustomerStatement c={c} />
      <PartyForm open={dlg === 'edit'} onClose={() => setDlg(null)} initial={c} />
      <ReceivePayment open={dlg === 'pay'} onClose={() => setDlg(null)} customer={c} />
      <ReturnEmpties open={dlg === 'return'} onClose={() => setDlg(null)} customer={c} />
      <SetHeld open={dlg === 'held'} onClose={() => setDlg(null)} customer={c} />
    </div>
  );
}

function Ledger({ c }) {
  const q = useGet(`/customers/${c.uid}/ledger`);
  const navigate = useNavigate();
  return (
    <Async q={q}>
      {({ entries }) => (
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
                    <th className="text-right font-semibold px-2">{t('debit_sale')}</th>
                    <th className="text-right font-semibold px-2">{t('credit_paid')}</th>
                    <th className="text-right font-semibold px-4">{t('balance')}</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e, i) => (
                    <tr
                      key={i}
                      className={cn('border-t border-line', e.uid && 'hover:bg-soft/50 cursor-pointer')}
                      onClick={() => e.uid && navigate(e.kind === 'sale' ? `/app/sales/${e.uid}` : `/app/payments/${e.uid}`)}
                    >
                      <td className="px-4 py-2.5 whitespace-nowrap text-muted">{e.kind === 'opening' ? '' : fDate(e.date)}</td>
                      <td className="px-2 py-2.5 min-w-[180px]">
                        <div className="font-semibold">{e.kind === 'opening' ? t('opening_balance') : e.kind === 'sale' ? `${t('sale')} ${e.ref}` : `${t('payment_received')} ${e.ref}`}</div>
                        <div className="text-[12px] text-muted">{e.kind === 'payment' ? `${methodLabel(e.method)}${e.detail.includes('S-') ? ` · ${e.detail.split(' · ').pop()}` : ''}` : e.detail}</div>
                      </td>
                      <td className="px-2 text-right num">{e.debit ? num0(e.debit) : ''}</td>
                      <td className="px-2 text-right num text-good">{e.credit ? num0(e.credit) : ''}</td>
                      <td className={cn('px-4 text-right num font-bold', e.balance > 0.009 ? 'text-bad' : e.balance < -0.009 ? 'text-good' : '')}>{money(e.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </Async>
  );
}

/** What prints when Statement is pressed: header, account, summary and the full ledger. */
function CustomerStatement({ c }) {
  const q = useGet(`/customers/${c.uid}/ledger`);
  const entries = q.data?.entries ?? [];
  const sum = (k) => entries.filter((e) => e.kind !== 'opening').reduce((a, e) => a + (Number(e[k]) || 0), 0);
  const opening = entries.find((e) => e.kind === 'opening');
  return (
    <Statement
      title={t('customer_statement')}
      party={{ kindLabel: t(c.type), name: c.name, phone: c.phone, address: c.address }}
      entries={entries}
      cols={{ debit: t('debit_sale'), credit: t('credit_paid') }}
      summary={[
        { label: t('opening_balance'), value: money((opening?.debit || 0) - (opening?.credit || 0)) },
        { label: t('total_sales'), value: money(sum('debit')) },
        { label: t('total_received'), value: money(sum('credit')) },
        { label: c.balance < -0.009 ? t('advance') : t('balance_due'), value: money(Math.abs(c.balance)), tone: c.balance > 0.009 ? 'red' : c.balance < -0.009 ? 'green' : undefined },
        { label: t('cylinders_with_customer'), value: String(c.held) },
      ]}
      describe={(e) =>
        e.kind === 'opening'
          ? t('opening_balance')
          : e.kind === 'sale'
            ? `${t('sale')} ${e.ref}${e.detail ? `, ${e.detail}` : ''}`
            : `${t('payment_received')} ${e.ref}, ${methodLabel(e.method)}`
      }
    />
  );
}

function Held({ c, onSet, onReturn, canSet }) {
  return (
    <Card className="overflow-hidden">
      {c.held_cylinders.length === 0 ? (
        <Empty icon={Cylinder} title={t('no_cylinders_held')} />
      ) : (
        <div className="divide-rows">
          {c.held_cylinders.map((h) => (
            <div key={h.type_uid} className="flex items-center gap-3 px-4 py-3">
              <IconBox icon={Cylinder} color="#6A3FB5" />
              <div className="flex-1 min-w-0">
                <div className="font-semibold">{h.type_name}</div>
                <div className="text-[12px] text-muted">
                  {t('security_held')}: {money(h.deposit)}
                </div>
              </div>
              <div className="text-[20px] font-extrabold num">{h.qty}</div>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2 px-4 py-3 bg-bg/60">
        <Button size="sm" variant="outline" icon={Undo2} onClick={onReturn}>
          {t('return_cylinders')}
        </Button>
        {canSet && (
          <Button size="sm" variant="ghost" icon={Settings2} onClick={onSet}>
            {t('set_cylinders_held')}
          </Button>
        )}
      </div>
    </Card>
  );
}

function SpecialPrices({ c }) {
  const types = useGet('/types');
  const [edit, setEdit] = useState(null);
  const [val, setVal] = useState('');
  const save = useAct((body) => api.put(`/customers/${c.uid}/prices`, body), {
    onSuccess: () => {
      toast(t('price_updated'));
      setEdit(null);
    },
    onError: (e) => toast(e.message, 'error'),
  });
  return (
    <Async q={types}>
      {(list) => (
        <Card className="overflow-hidden">
          <div className="px-4 py-3 text-[12.5px] text-muted bg-bg/60">{t('customer_price_help')}</div>
          <div className="divide-rows">
            {list.map((ty) => {
              const def = c.type === 'wholesale' && ty.wholesale_price > 0 ? ty.wholesale_price : ty.price;
              const sp = c.prices[ty.uid];
              const editing = edit === ty.uid;
              return (
                <div key={ty.uid} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <IconBox icon={TagIcon} color={sp != null ? '#F26B1D' : '#5F6279'} />
                  <div className="flex-1 min-w-[120px]">
                    <div className="font-semibold">{ty.name}</div>
                    <div className="text-[12px] text-muted">
                      {t('default')}: {money(def)}
                    </div>
                  </div>
                  {editing ? (
                    <div className="flex items-center gap-1.5">
                      <MoneyInput value={val} onChange={setVal} autoFocus className="w-36" />
                      <Button size="md" icon={Check} loading={save.isPending} onClick={() => (parseNum(val) > MAX_UNIT_PRICE ? toast(t('price_too_big', { max: money(MAX_UNIT_PRICE) }), 'error') : save.mutate({ type_uid: ty.uid, price: parseNum(val) > 0 ? parseNum(val) : null }))} aria-label={t('save')} />
                      <Button size="md" variant="outline" icon={X} onClick={() => setEdit(null)} aria-label={t('cancel')} />
                    </div>
                  ) : (
                    <>
                      {sp != null ? <Tag tone="orange">{money(sp)}</Tag> : <span className="text-[12.5px] text-muted">{t('no_special')}</span>}
                      <Button size="sm" variant="soft" icon={Pencil} onClick={() => (setEdit(ty.uid), setVal(sp != null ? String(sp) : ''))}>
                        {sp != null ? t('edit') : t('set')}
                      </Button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <div className="px-4 py-2 text-[12px] text-muted">{t('clear_price_help')}</div>
        </Card>
      )}
    </Async>
  );
}

