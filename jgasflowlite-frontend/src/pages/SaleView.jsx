import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Plus, Trash2, User } from 'lucide-react';
import { api, useAct, useGet } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fDateTime, money, num0 } from '@/lib/format';
import { methodLabel, t } from '@/lib/i18n';
import { Async, Button, PageHeader } from '@/ui/kit';
import { toast, useConfirm } from '@/ui/overlay';
import { Dashed, Line, Paper, ReceiptActions, saleText, ShopFoot, ShopHead } from '@/ui/receipt';

export default function SaleView() {
  const { uid } = useParams();
  const [params] = useSearchParams();
  const q = useGet(`/sales/${uid}`);
  const auth = useAuth();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const del = useAct(() => api.delete(`/sales/${uid}`), {
    onSuccess: () => {
      toast(t('deleted'));
      navigate('/app/sales', { replace: true });
    },
    onError: (e) => toast(e.message, 'error'),
  });

  return (
    <Async q={q}>
      {(s) => (
        <div>
          <PageHeader
            back
            title={`${t('sale')} ${s.ref}`}
            sub={fDateTime(s.date)}
            actions={
              auth.isManager && (
                <Button
                  variant="danger-outline"
                  icon={Trash2}
                  loading={del.isPending}
                  onClick={async () => {
                    if (await confirm({ title: t('delete_sale'), message: t('delete_sale_msg'), okLabel: t('delete'), danger: true })) del.mutate();
                  }}
                >
                  {t('delete')}
                </Button>
              )
            }
          />
          {params.get('saved') && (
            <div className="no-print max-w-[380px] mx-auto mb-3 flex items-center gap-2 rounded-[var(--radius-card)] bg-[#e8f5e9] text-good px-4 py-3 font-semibold text-[13.5px]">
              <CheckCircle2 className="size-5 shrink-0" /> {t('sale_saved_share')}
            </div>
          )}
          <Paper>
            <ShopHead title={t('sale_receipt')} />
            <div className="mt-3">
              <Line l={t('receipt_no')} r={s.ref} />
              <Line l={t('date')} r={fDateTime(s.date)} />
              <Line l={t('customer')} r={s.customer_name || t('walk_in')} />
              {s.customer_phone && <Line l={t('phone')} r={s.customer_phone} />}
            </div>
            <Dashed />
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-muted">
                  <th className="text-left font-semibold py-1">{t('item')}</th>
                  <th className="text-right font-semibold">{t('qty')}</th>
                  <th className="text-right font-semibold">{t('rate')}</th>
                  <th className="text-right font-semibold">{t('amount')}</th>
                </tr>
              </thead>
              <tbody>
                {s.items
                  .filter((i) => i.qty > 0)
                  .map((i) => (
                    <tr key={i.uid}>
                      <td className="py-1 font-semibold">{i.type_name}</td>
                      <td className="text-right num">{i.qty}</td>
                      <td className="text-right num">{num0(i.price)}</td>
                      <td className="text-right num font-semibold">{num0(i.amount)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {s.items.some((i) => i.empty_qty > 0) && (
              <div className="mt-1 text-[12px] text-muted">
                {t('empty_received')}: {s.items.filter((i) => i.empty_qty > 0).map((i) => `${i.type_name} x ${i.empty_qty}`).join(', ')}
              </div>
            )}
            <Dashed />
            <Line l={t('subtotal')} r={money(s.subtotal)} />
            {s.deposit > 0 && <Line l={t('security_deposit')} r={money(s.deposit)} />}
            {s.discount > 0 && <Line l={t('discount')} r={`- ${money(s.discount)}`} />}
            <Line l={t('total')} r={money(s.total)} strong />
            <Line l={`${t('paid')}${s.paid > 0 ? ` (${methodLabel(s.method || 'cash')})` : ''}`} r={money(s.paid)} />
            {s.customer_uid && s.due > 0.009 && <Line l={t('due_this_bill')} r={money(s.due)} tone="red" />}
            {s.customer_balance != null && (
              <>
                <Dashed />
                <Line l={t('total_outstanding')} r={money(s.customer_balance)} strong tone={s.customer_balance > 0.009 ? 'red' : undefined} />
              </>
            )}
            {s.note && <div className="mt-2 text-[12px] text-muted">{s.note}</div>}
            <Dashed />
            <ShopFoot />
          </Paper>
          <ReceiptActions text={saleText(auth.shop, s)} phone={s.customer_phone}>
            {s.customer_uid && (
              <Button variant="outline" icon={User} to={`/app/customers/${s.customer_uid}`}>
                {t('customer')}
              </Button>
            )}
            <Button variant="accent" icon={Plus} to="/app/sales/new">
              {t('new_sale')}
            </Button>
          </ReceiptActions>
        </div>
      )}
    </Async>
  );
}
