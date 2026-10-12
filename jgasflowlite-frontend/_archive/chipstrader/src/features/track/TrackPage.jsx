import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Circle, Truck, Package, Mail, Phone, Globe } from 'lucide-react';
import { get, ASSET_URL } from '@/lib/api';
import { fmtDate, fmtDateTime, humanize } from '@/lib/format';
import { Spinner } from '@/components/ui/core';
import { Logo } from '@/components/layout/Logo';

/** Public order tracking, shared with customers, no sign-in, no prices. */
export default function TrackPage() {
  const { token } = useParams();
  const q = useQuery({ queryKey: ['track', token], queryFn: () => get(`/track/${token}`), retry: false, refetchInterval: 60_000 });

  if (q.isLoading) return <div className="min-h-dvh grid place-items-center"><Spinner /></div>;
  if (q.isError)
    return (
      <div className="min-h-dvh grid place-items-center p-6 text-center">
        <div><Logo className="justify-center mb-6" /><p className="font-semibold">This tracking link is not valid</p><p className="text-sm text-muted mt-1">Please check the link or contact your sales contact.</p></div>
      </div>
    );
  const t = q.data;
  const done = new Set(t.events.map((e) => e.milestone));
  const lastIdx = Math.max(-1, ...t.milestones.map((m, i) => (done.has(m) ? i : -1)));

  return (
    <div className="min-h-dvh bg-bg">
      <header className="bg-gradient-to-br from-brand-800 via-brand-700 to-cyan-800 text-white">
        <div className="max-w-3xl mx-auto px-5 pt-6 pb-16">
          <div className="flex items-center justify-between">
            {t.seller?.logo_path ? <img src={`${ASSET_URL}/${t.seller.logo_path}`} alt="" className="h-9 bg-white rounded-lg p-1" /> : <span className="font-semibold">{t.seller?.short_name || t.seller?.legal_name}</span>}
            <span className="text-xs text-indigo-100">Order tracking</span>
          </div>
          <p className="mt-8 text-indigo-100 text-sm">Order for {t.customer}</p>
          <h1 className="text-[28px] font-semibold tracking-tight mono">{t.so_no}</h1>
          <p className="text-sm text-indigo-100 mt-1">Ordered {fmtDate(t.order_date)}{t.customer_po_number ? ` · your PO ${t.customer_po_number}` : ''}</p>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-5 -mt-10 pb-10 space-y-4">
        <div className="card p-5">
          <p className="font-semibold mb-4">Progress</p>
          <ol className="relative">
            {t.milestones.map((m, i) => {
              const ev = t.events.filter((e) => e.milestone === m).at(-1);
              const reached = i <= lastIdx;
              return (
                <li key={m} className="relative flex gap-3 pb-5 last:pb-0">
                  {i < t.milestones.length - 1 && <span className={`absolute left-[11px] top-6 bottom-0 w-0.5 ${i < lastIdx ? 'bg-emerald-500' : 'bg-line'}`} />}
                  {reached ? <CheckCircle2 className="size-6 text-success shrink-0 bg-surface rounded-full" /> : <Circle className="size-6 text-faint shrink-0" />}
                  <div>
                    <p className={reached ? 'font-medium' : 'text-faint'}>{humanize(m)}</p>
                    {ev && <p className="text-xs text-muted">{fmtDateTime(ev.created_at)}{ev.note ? ` · ${ev.note}` : ''}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
        {t.shipments.length > 0 && (
          <div className="card p-5">
            <p className="font-semibold mb-3 flex items-center gap-2"><Truck className="size-4" />Shipments</p>
            <ul className="space-y-2">
              {t.shipments.map((s) => (
                <li key={s.shipment_no} className="flex items-center gap-3 p-3 rounded-lg bg-surface-2">
                  <Package className="size-5 text-link" />
                  <div className="flex-1"><p className="mono font-medium">{s.shipment_no}</p><p className="text-xs text-muted">{fmtDate(s.shipment_date)}{s.carrier ? ` · ${s.carrier}` : ''}</p></div>
                  {s.tracking_no && <span className="mono text-sm">{s.tracking_no}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="card p-5 text-sm">
          <p className="font-semibold mb-2">Questions about your order?</p>
          <div className="flex flex-wrap gap-4 text-muted">
            {t.seller?.general_email && <a href={`mailto:${t.seller.general_email}`} className="flex items-center gap-1.5 hover:text-link"><Mail className="size-4" />{t.seller.general_email}</a>}
            {t.seller?.general_phone && <a href={`tel:${t.seller.general_phone}`} className="flex items-center gap-1.5 hover:text-link"><Phone className="size-4" />{t.seller.general_phone}</a>}
            {t.seller?.website && <a href={t.seller.website} className="flex items-center gap-1.5 hover:text-link"><Globe className="size-4" />{t.seller.website}</a>}
          </div>
        </div>
        <p className="text-center text-xs text-faint pt-2">Powered by ChipsTrader</p>
      </main>
    </div>
  );
}
