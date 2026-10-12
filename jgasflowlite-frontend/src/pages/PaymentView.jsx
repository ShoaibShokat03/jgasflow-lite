import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle2, ReceiptText, Trash2, User } from 'lucide-react';
import { api, useAct, useGet } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fDateTime, money } from '@/lib/format';
import { methodLabel, t } from '@/lib/i18n';
import { Async, Button, PageHeader } from '@/ui/kit';
import { toast, useConfirm } from '@/ui/overlay';
import { Dashed, Line, Paper, paymentText, ReceiptActions, ShopFoot, ShopHead } from '@/ui/receipt';

export default function PaymentView() {
  const { uid } = useParams();
  const [params] = useSearchParams();
  const q = useGet(`/payments/${uid}`);
  const auth = useAuth();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const del = useAct(() => api.delete(`/payments/${uid}`), {
    onSuccess: () => {
      toast(t('deleted'));
      navigate(-1);
    },
    onError: (e) => toast(e.message, 'error'),
  });
  return (
    <Async q={q}>
      {(p) => (
        <div>
          <PageHeader
            back
            title={`${t('payment')} ${p.ref}`}
            sub={fDateTime(p.date)}
            actions={
              auth.isManager &&
              !p.sale_uid && (
                <Button
                  variant="danger-outline"
                  icon={Trash2}
                  loading={del.isPending}
                  onClick={async () => {
                    if (await confirm({ title: t('delete_payment'), message: t('delete_payment_msg'), okLabel: t('delete'), danger: true })) del.mutate();
                  }}
                >
                  {t('delete')}
                </Button>
              )
            }
          />
          {params.get('saved') && (
            <div className="no-print max-w-[380px] mx-auto mb-3 flex items-center gap-2 rounded-[var(--radius-card)] bg-[#e8f5e9] text-good px-4 py-3 font-semibold text-[13.5px]">
              <CheckCircle2 className="size-5 shrink-0" /> {t('payment_saved')}
            </div>
          )}
          <Paper>
            <ShopHead title={t('payment_receipt')} />
            <div className="mt-3">
              <Line l={t('receipt_no')} r={p.ref} />
              <Line l={t('date')} r={fDateTime(p.date)} />
              <Line l={t('customer')} r={p.customer_name || t('walk_in')} />
              {p.sale_ref && <Line l={t('against_sale')} r={p.sale_ref} />}
            </div>
            <Dashed />
            <Line l={t('amount_received')} r={money(p.amount)} strong />
            <Line l={t('payment_method')} r={methodLabel(p.method)} />
            {p.note && <div className="text-[12px] text-muted mt-1">{p.note}</div>}
            {p.customer_balance != null && (
              <>
                <Dashed />
                <Line l={t('remaining_balance')} r={money(p.customer_balance)} strong tone={p.customer_balance > 0.009 ? 'red' : 'green'} />
              </>
            )}
            <Dashed />
            <ShopFoot />
          </Paper>
          <ReceiptActions text={paymentText(auth.shop, p)} phone={p.customer_phone}>
            {p.customer_uid && (
              <Button variant="outline" icon={User} to={`/app/customers/${p.customer_uid}`}>
                {t('customer')}
              </Button>
            )}
            {p.sale_uid && (
              <Button variant="outline" icon={ReceiptText} to={`/app/sales/${p.sale_uid}`}>
                {p.sale_ref}
              </Button>
            )}
          </ReceiptActions>
        </div>
      )}
    </Async>
  );
}
