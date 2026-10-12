import { useNavigate } from 'react-router-dom';
import { Activity, AlertTriangle, BadgeCheck, BadgeDollarSign, Ban, Clock, Hourglass, Sparkles, Store, UsersRound } from 'lucide-react';
import { useGet } from '@/lib/api';
import { money, num0 } from '@/lib/format';
import { t } from '@/lib/i18n';
import { Async, Button, Card, PageHeader, SectionHeader, StatTile } from '@/ui/kit';
import { RequestsList } from './AdminPayments';

export default function AdminOverview() {
  const q = useGet('/admin/overview', null, { refetchInterval: 30000 });
  const navigate = useNavigate();
  return (
    <div>
      <PageHeader title={t('admin_overview')} sub={t('admin_overview_sub')} />
      <Async q={q}>
        {(o) => (
          <>
            {o.pending_requests > 0 && (
              <Card as="button" onClick={() => navigate('/admin/payments')} className="w-full text-left p-4 mb-4 flex items-center gap-3 !bg-[#fff8e6] !border-[#f3dca0]">
                <Clock className="size-6 text-warn" />
                <div className="flex-1">
                  <div className="font-bold">{t('admin_pending', { n: o.pending_requests })}</div>
                  <div className="text-[13px] text-muted">{money(o.pending_amount)}</div>
                </div>
                <Button size="sm" variant="accent">
                  {t('review')}
                </Button>
              </Card>
            )}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
              <StatTile label={t('admin_shops')} value={num0(o.shops)} icon={Store} color="#020033" to="/admin/shops" />
              <StatTile label={t('admin_paid_active')} value={num0(o.active_paid)} icon={BadgeCheck} color="#2E7D32" to="/admin/shops?status=active" />
              <StatTile label={t('admin_on_trial')} value={num0(o.on_trial)} icon={Sparkles} color="#1565C0" to="/admin/shops?status=trial" />
              <StatTile label={t('expired')} value={num0(o.expired)} icon={Hourglass} color="#C62828" to="/admin/shops?status=expired" />
              <StatTile label={t('admin_expiring')} value={num0(o.expiring_7d)} icon={AlertTriangle} color="#B77D00" />
              <StatTile label={t('suspended')} value={num0(o.suspended)} icon={Ban} color="#5F6279" to="/admin/shops?status=suspended" />
              <StatTile label={t('admin_signups')} value={num0(o.signups_30d)} icon={UsersRound} color="#6A3FB5" />
              <StatTile label={t('admin_active_7d')} value={num0(o.active_7d)} icon={Activity} color="#F26B1D" />
            </div>
            <div className="grid grid-cols-2 gap-2.5 mt-2.5">
              <StatTile label={t('admin_revenue_month')} value={money(o.revenue_month)} icon={BadgeDollarSign} color="#2E7D32" />
              <StatTile label={t('admin_revenue_total')} value={money(o.revenue_total)} icon={BadgeDollarSign} color="#020033" />
            </div>
            <SectionHeader title={t('admin_payments')} action={<Button variant="ghost" size="sm" to="/admin/payments">{t('view_all')}</Button>} />
            <RequestsList status="pending" compact />
          </>
        )}
      </Async>
    </div>
  );
}
