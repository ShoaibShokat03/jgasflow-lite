import { StockArt } from '@/ui/StockArt';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowRight,
  Check,
  Cloud,
  Cylinder,
  HandCoins,
  PackagePlus,
  Plus,
  ReceiptText,
  ShoppingCart,
  Tag as TagIcon,
  UserPlus,
  UsersRound,
  Wallet,
} from 'lucide-react';
import { useGet } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fDateShort, fDay, fTime, money, num0 } from '@/lib/format';
import { nBills, t } from '@/lib/i18n';
import { Async, Bars, Button, Card, cn, Empty, IconBox, Initials, SectionHeader, StatTile, Tag } from '@/ui/kit';

export default function Dashboard() {
  const q = useGet('/dashboard', null, { refetchInterval: 30000 });
  return <Async q={q}>{(d) => <Body d={d} />}</Async>;
}

function Body({ d }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const low = d.types.filter((x) => x.is_low);
  const steps = [
    { done: d.full_total > 0 || d.purchase_count > 0, title: t('gs_stock'), sub: t('gs_stock_sub'), icon: PackagePlus, go: auth.isManager ? '/app/purchases/new' : null },
    { done: d.customer_count > 0, title: t('gs_customer'), sub: t('gs_customer_sub'), icon: UserPlus, go: '/app/customers?new=1' },
    { done: d.sale_count > 0, title: t('gs_sale'), sub: t('gs_sale_sub'), icon: ShoppingCart, go: '/app/sales/new' },
  ];
  const isNew = steps.some((s) => !s.done);
  const week = d.last7.map((x, i) => ({ value: x.total, label: i === 6 ? t('today') : fDateShort(x.day).slice(0, 6), highlight: i === 6 }));
  const weekTotal = d.last7.reduce((a, x) => a + x.total, 0);
  const stockLink = auth.isManager ? '/app/stock' : undefined;
  const maxFull = Math.max(1, ...d.types.filter((x) => x.unit !== 'kg').map((x) => x.full_qty));
  // Cylinders first, then loose gas, then other items.
  d = { ...d, types: [...d.types].sort((a, b) => (a.unit === 'pcs') - (b.unit === 'pcs') || (a.unit === 'kg') - (b.unit === 'kg')) };

  const actions = [
    { icon: Plus, label: t('new_sale'), color: '#F26B1D', to: '/app/sales/new' },
    { icon: HandCoins, label: t('receive_payment'), color: '#2E7D32', to: '/app/udhaar?receive=1' },
    auth.isManager && { icon: PackagePlus, label: t('new_purchase'), color: '#1565C0', to: '/app/purchases/new' },
    { icon: UserPlus, label: t('add_customer'), color: '#6A3FB5', to: '/app/customers?new=1' },
    auth.isManager ? { icon: TagIcon, label: t('prices'), color: '#B77D00', to: '/app/prices' } : { icon: ReceiptText, label: t('sales'), color: '#B77D00', to: '/app/sales' },
  ].filter(Boolean);

  return (
    <div className="space-y-5">
      {/* hero: today's money */}
      <div className="rounded-[var(--radius-card)] bg-gradient-to-br from-primary to-primary-2 text-white p-5 lg:p-6 shadow-[var(--shadow-card)]">
        <div className="grid lg:grid-cols-[1fr_1.25fr] gap-5 lg:gap-8 items-center">
          <div className="min-w-0">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-[16px] font-bold truncate">
                  {t('greeting')}
                  {auth.user?.name ? `, ${auth.user.name}` : ''}
                </div>
                <div className="text-[12.5px] text-white/60">{fDay(new Date())}</div>
              </div>
              <span className="lg:hidden inline-flex items-center gap-1 h-7 px-2.5 rounded-[var(--radius-ctl)] bg-white/10 text-[11.5px] font-bold text-[#5BE49B] whitespace-nowrap">
                <Cloud className="size-3.5" /> {t('online')}
              </span>
            </div>
            <div className="mt-5 text-[12.5px] font-semibold text-white/70">{t('today_sales')}</div>
            <button type="button" onClick={() => navigate('/app/sales')} className="flex items-end gap-2 flex-wrap text-left">
              <span className="text-[34px] lg:text-[40px] font-black tracking-tight num leading-tight">{money(d.today_sales)}</span>
              <span className="mb-2 text-[12.5px] font-semibold text-white/60 whitespace-nowrap">
                {nBills(d.today_sales_count)} · {d.today_qty} {t('cyl')}
              </span>
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <HeroStat icon={ArrowDownLeft} color="#5BE49B" label={t('today_payments')} value={money(d.today_payments)} sub={t('cash_received')} onClick={() => navigate('/app/udhaar?tab=history')} />
            <HeroStat icon={Wallet} color="#FFA36B" label={t('total_outstanding')} value={money(d.outstanding)} sub={`${d.udhaar_customers} ${t('customers')}`} onClick={() => navigate('/app/udhaar')} />
          </div>
        </div>
      </div>

      {isNew && <GettingStarted steps={steps} />}

      {/* quick actions */}
      <div className={cn('grid gap-3', actions.length === 5 ? 'grid-cols-3 sm:grid-cols-5' : 'grid-cols-2 sm:grid-cols-4')}>
        {actions.map((a) => (
          <Card key={a.label} as="button" onClick={() => navigate(a.to)} className="p-3 flex flex-col sm:flex-row items-center gap-2.5 text-center sm:text-left hover:border-[#cfd2e6] transition min-w-0">
            <IconBox icon={a.icon} color={a.color} size={40} />
            <span className="text-[13px] font-semibold leading-tight truncate max-w-full">{a.label}</span>
          </Card>
        ))}
      </div>

      {/* counters */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label={t('full_cylinders')} value={num0(d.full_total)} icon={Cylinder} color="#020033" to={stockLink} />
        <StatTile label={t('empty_cylinders')} value={num0(d.empty_total)} icon={Cylinder} color="#B77D00" to={stockLink} />
        <StatTile label={t('with_customers')} value={num0(d.with_customers)} icon={UsersRound} color="#6A3FB5" sub={`${t('security_held')} ${money(d.deposit_held)}`} to={stockLink} />
        <StatTile label={t('customers')} value={num0(d.customer_count)} icon={UsersRound} color="#2E7D32" sub={`${d.udhaar_customers} ${t('udhaar')}`} to="/app/customers" />
      </div>

      {low.length > 0 && (
        <Card
          as={auth.isManager ? 'button' : 'div'}
          onClick={auth.isManager ? () => navigate('/app/purchases/new') : undefined}
          className="p-3.5 w-full text-left flex items-center gap-3 !bg-[#fff6f5] !border-[#f6cfcb]"
        >
          <IconBox icon={AlertTriangle} color="#C62828" size={38} />
          <div className="min-w-0 flex-1">
            <div className="font-extrabold text-bad">{t('low_stock')}</div>
            <div className="text-[13px] mt-0.5">{low.map((x) => `${x.name}: ${x.full_qty} ${t('full')}`).join('  ·  ')}</div>
          </div>
          {auth.isManager && (
            <span className="hidden sm:inline-flex items-center gap-1 text-[13px] font-extrabold text-primary whitespace-nowrap">
              {t('new_purchase')} <ArrowRight className="size-4" />
            </span>
          )}
        </Card>
      )}

      {/* week chart + stock by type */}
      <div className="grid xl:grid-cols-[1.4fr_1fr] gap-5 items-stretch">
        <Card className="p-4 lg:p-5 flex flex-col">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <div className="font-bold text-[15px]">{t('last_7_days')}</div>
              <div className="text-[12.5px] text-muted">{t('sales')}</div>
            </div>
            <div className="text-right">
              <div className="text-[18px] font-extrabold num">{money(weekTotal)}</div>
              <div className="text-[12px] text-muted">{t('total')}</div>
            </div>
          </div>
          <div className="flex-1 flex items-end">
            {weekTotal ? <div className="w-full"><Bars data={week} height={190} /></div> : <div className="w-full text-center text-muted py-12 text-[13px]">{t('no_sales_week')}</div>}
          </div>
        </Card>

        <Card className="overflow-hidden flex flex-col">
          <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-2">
            <div className="font-bold text-[15px]">{t('stock_by_type')}</div>
            {auth.isManager && (
              <Button variant="ghost" size="sm" to="/app/stock">
                {t('view_all')}
              </Button>
            )}
          </div>
          <div className="divide-rows flex-1">
            {d.types.map((x) => (
              <div key={x.uid} className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <StockArt type={x} size={34} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold truncate">{x.name}</span>
                      {x.is_low && <Tag tone="red">{t('low')}</Tag>}
                    </div>
                    <div className="text-[12px] text-muted truncate">
                      {x.unit === 'kg'
                        ? `${money(x.price)}/${t('kg')}`
                        : x.unit === 'pcs'
                          ? `${x.category || t('cat_other_items')} · ${money(x.price)}`
                          : `${num0(x.empty_qty)} ${t('empty')} · ${num0(x.with_customers)} ${t('with_customers').toLowerCase()} · ${money(x.price)}`}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[18px] font-extrabold num leading-tight whitespace-nowrap">{num0(x.unit === 'kg' ? x.gas_kg : x.full_qty)}</div>
                    <div className="text-[11px] text-muted">{x.unit === 'kg' ? t('kg') : x.unit === 'pcs' ? t('in_stock') : t('full')}</div>
                  </div>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-soft overflow-hidden">
                  <div className={cn('h-full rounded-full', x.is_low ? 'bg-bad' : 'bg-primary-3')} style={{ width: `${x.unit === 'kg' ? (x.is_low ? 8 : 100) : Math.max(2, (x.full_qty / maxFull) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* recent sales */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-2">
          <div className="font-bold text-[15px]">{t('recent_sales')}</div>
          <Button variant="ghost" size="sm" to="/app/sales">
            {t('view_all')}
          </Button>
        </div>
        {d.recent.length === 0 ? (
          <Empty icon={ReceiptText} title={t('no_sales_yet_web')} action={<Button variant="accent" icon={Plus} to="/app/sales/new">{t('new_sale')}</Button>} />
        ) : (
          <div className="grid lg:grid-cols-2 lg:gap-x-0 divide-rows lg:[&>*+*]:border-t-0 lg:[&>*:nth-child(n+3)]:border-t lg:[&>*:nth-child(even)]:border-l border-line">
            {d.recent.map((s) => (
              <SaleRow key={s.uid} s={s} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

export function SaleRow({ s, showDate = false }) {
  const navigate = useNavigate();
  return (
    <button type="button" className="row-link w-full text-left" onClick={() => navigate(`/app/sales/${s.uid}`)}>
      <Initials name={s.customer_name || t('walk_in')} tone={s.customer_uid ? 'navy' : 'orange'} />
      <div className="min-w-0 flex-1">
        <div className="font-semibold truncate">{s.customer_name || t('walk_in')}</div>
        <div className="text-[12px] text-muted truncate">
          {s.ref} · {showDate ? `${fDateShort(s.date)}, ` : ''}
          {fTime(s.date)}
          {s.items_text ? ` · ${s.items_text}` : ''}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="font-bold num">{money(s.total)}</div>
        {s.due > 0.009 ? <Tag tone="red">{t('due_short')} {money(s.due)}</Tag> : <Tag tone="green">{t('paid')}</Tag>}
      </div>
    </button>
  );
}

function HeroStat({ icon: Icon, color, label, value, sub, onClick }) {
  return (
    <button type="button" onClick={onClick} className="rounded-[var(--radius-card)] bg-white/9 hover:bg-white/14 transition p-3 flex items-center gap-2.5 text-left min-w-0">
      <div className="grid place-items-center size-9 rounded-[var(--radius-xs)] shrink-0" style={{ background: `${color}2e`, color }}>
        <Icon className="size-[18px]" />
      </div>
      <div className="min-w-0">
        <div className="text-[11.5px] font-semibold text-white/70 truncate">{label}</div>
        <div className="text-[16px] font-extrabold num truncate">{value}</div>
        <div className="text-[10.5px] text-white/55 truncate">{sub}</div>
      </div>
    </button>
  );
}

function GettingStarted({ steps }) {
  const navigate = useNavigate();
  const done = steps.filter((s) => s.done).length;
  return (
    <Card className="mt-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="font-bold text-[15px]">{t('getting_started')}</div>
        <span className="text-[12.5px] font-bold text-muted whitespace-nowrap">
          {done}/{steps.length} {t('gs_done')}
        </span>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-soft overflow-hidden">
        <div className="h-full bg-good rounded-full transition-all" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <div className="mt-3 divide-rows">
        {steps.map((s) => (
          <div key={s.title} className="flex items-center gap-3 py-2.5">
            <div className={cn('grid place-items-center size-9 rounded-full shrink-0', s.done ? 'bg-good text-white' : 'bg-soft text-primary')}>{s.done ? <Check className="size-5" /> : <s.icon className="size-[18px]" />}</div>
            <div className="min-w-0 flex-1">
              <div className={cn('font-semibold', s.done && 'line-through text-muted')}>{s.title}</div>
              <div className="text-[12.5px] text-muted truncate">{s.sub}</div>
            </div>
            {!s.done && s.go && (
              <Button size="sm" variant="soft" iconRight={ArrowRight} onClick={() => navigate(s.go)}>
                {t('start')}
              </Button>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
