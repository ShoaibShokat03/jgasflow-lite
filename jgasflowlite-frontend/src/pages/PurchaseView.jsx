import { useNavigate, useParams } from 'react-router-dom';
import { Printer, Trash2, Truck } from 'lucide-react';
import { api, useAct, useGet } from '@/lib/api';
import { fDateTime, money, num0 } from '@/lib/format';
import { t } from '@/lib/i18n';
import { Async, Button, PageHeader } from '@/ui/kit';
import { toast, useConfirm } from '@/ui/overlay';
import { Dashed, Line, Paper, PrintCredit, ShopHead } from '@/ui/receipt';
import { printNow } from '@/lib/print';

export default function PurchaseView() {
  const { uid } = useParams();
  const q = useGet(`/purchases/${uid}`);
  const navigate = useNavigate();
  const confirm = useConfirm();
  const del = useAct(() => api.delete(`/purchases/${uid}`), {
    onSuccess: () => {
      toast(t('deleted'));
      navigate('/app/purchases', { replace: true });
    },
    onError: (e) => toast(e.message, 'error'),
  });
  return (
    <Async q={q}>
      {(p) => (
        <div>
          <PageHeader
            back
            title={`${t('purchase')} ${p.ref}`}
            sub={fDateTime(p.date)}
            actions={
              <Button
                variant="danger-outline"
                icon={Trash2}
                loading={del.isPending}
                onClick={async () => {
                  if (await confirm({ title: t('delete_purchase'), message: t('delete_purchase_msg'), okLabel: t('delete'), danger: true })) del.mutate();
                }}
              >
                {t('delete')}
              </Button>
            }
          />
          <Paper>
            <ShopHead title={t('purchase')} />
            <div className="mt-3">
              <Line l={t('receipt_no')} r={p.ref} />
              <Line l={t('date')} r={fDateTime(p.date)} />
              <Line l={t('supplier')} r={p.supplier_name || t('no_supplier')} />
            </div>
            <Dashed />
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-muted">
                  <th className="text-left font-semibold py-1">{t('item')}</th>
                  <th className="text-right font-semibold">{t('full_recv')}</th>
                  <th className="text-right font-semibold">{t('empty_sent')}</th>
                  <th className="text-right font-semibold">{t('amount')}</th>
                </tr>
              </thead>
              <tbody>
                {p.items.map((i) => (
                  <tr key={i.uid}>
                    <td className="py-1 font-semibold">
                      {i.type_name}
                      <div className="text-[11px] text-muted font-normal">
                        {i.mode === 'empty' ? `${t('empty_cyl_line')} · ` : ''}@ {num0(i.price)}
                      </div>
                    </td>
                    <td className="text-right num">{i.qty}</td>
                    <td className="text-right num">{i.empty_sent}</td>
                    <td className="text-right num font-semibold">{num0(i.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Dashed />
            <Line l={t('total')} r={money(p.total)} strong />
            <Line l={`${t('paid')}${p.paid > 0 && p.money_name ? ` (${p.money_name})` : ''}`} r={money(p.paid)} />
            {p.due > 0.009 && <Line l={t('payable')} r={money(p.due)} tone="red" />}
            {p.note && <div className="mt-2 text-[12px] text-muted">{p.note}</div>}
            <PrintCredit />
          </Paper>
          <div className="no-print flex justify-center gap-2 mt-4">
            <Button icon={Printer} onClick={() => printNow('receipt')}>
              {t('print')}
            </Button>
            {p.supplier_uid && (
              <Button variant="outline" icon={Truck} to={`/app/suppliers/${p.supplier_uid}`}>
                {t('supplier')}
              </Button>
            )}
          </div>
        </div>
      )}
    </Async>
  );
}
