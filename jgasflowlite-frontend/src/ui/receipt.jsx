import { MessageCircle, Phone, Printer } from 'lucide-react';
import { printNow, SUPPORT } from '@/lib/print';
import { useAuth } from '@/lib/auth';
import { fDateTime, money, num0 } from '@/lib/format';
import { methodLabel, t } from '@/lib/i18n';
import { Button, cn, Logo } from './kit';

/** Receipt paper (prints on 80mm rolls; looks like a slip on screen). */
export function Paper({ children, className }) {
  return <div className={cn('print-area bg-white mx-auto w-full max-w-[380px] rounded-[var(--radius-card)] border border-line shadow-[var(--shadow-card)] px-5 py-5 text-[13px]', className)}>{children}</div>;
}

export function ShopHead({ title }) {
  const { shop } = useAuth();
  return (
    <div className="text-center">
      <div className="print-logo flex justify-center">
        <Logo size={34} />
      </div>
      <div className="font-black text-[16px] mt-1">{shop?.name}</div>
      {shop?.address && <div className="text-[12px] text-muted">{shop.address}</div>}
      {shop?.phone && <div className="text-[12px] text-muted">{shop.phone}</div>}
      <div className="mt-3 py-1.5 border-y border-dashed border-[#c7cad6] font-bold tracking-wide uppercase text-[12px]">{title}</div>
    </div>
  );
}

export function Line({ l, r, strong, tone }) {
  return (
    <div className={cn('flex justify-between gap-3 py-0.5', strong && 'font-extrabold text-[14.5px]')}>
      <span className={cn(!strong && 'text-muted')}>{l}</span>
      <span className={cn('num text-right', tone === 'red' && 'text-bad font-bold', tone === 'green' && 'text-good font-bold')}>{r}</span>
    </div>
  );
}

export function Dashed() {
  return <div className="my-2 border-t border-dashed border-[#c7cad6]" />;
}

export function ShopFoot() {
  const { shop } = useAuth();
  return (
    <div className="text-center mt-3">
      {shop?.receipt_note && <div className="text-[12px] text-muted whitespace-pre-line">{shop.receipt_note}</div>}
      <div className="font-bold mt-1">{t('thank_you')}</div>
      <PrintCredit />
    </div>
  );
}

/** Shown under every print: who made the software and how to reach them. */
export function PrintCredit({ className }) {
  return (
    <div className={cn('mt-3 pt-2 border-t border-dashed border-[#c7cad6] text-center text-[10.5px] italic text-muted leading-snug', className)}>
      Software developed by <b className="not-italic font-bold text-primary">{SUPPORT.company}</b>
      <span className="mx-1.5">|</span>
      <Phone className="inline size-3 -mt-0.5" /> {SUPPORT.phone}
    </div>
  );
}

/** Print and WhatsApp buttons. `text` is the plain receipt for sharing. */
export function ReceiptActions({ text, phone, children }) {
  const share = () => {
    const to = (phone || '').replace(/[^0-9]/g, '').replace(/^0/, '92');
    window.open(`https://wa.me/${to.length >= 11 ? to : ''}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };
  return (
    <div className="no-print flex flex-wrap justify-center gap-2 mt-4">
      <Button icon={Printer} onClick={() => printNow('receipt')}>
        {t('print')}
      </Button>
      <Button variant="good" icon={MessageCircle} onClick={share}>
        WhatsApp
      </Button>
      {children}
    </div>
  );
}

/** Plain-text sale receipt (WhatsApp / SMS), like the app's share text. */
export function saleText(shop, s) {
  const lines = [
    `*${shop?.name ?? ''}*`,
    shop?.phone ? shop.phone : null,
    `${t('sale_receipt')} ${s.ref}`,
    fDateTime(s.date),
    s.customer_name ? `${t('customer')}: ${s.customer_name}` : `${t('customer')}: ${t('walk_in')}`,
    '',
    ...s.items.filter((i) => i.qty > 0).map((i) => `${i.type_name}: ${i.qty} x ${num0(i.price)} = ${money(i.amount)}`),
    ...s.items.filter((i) => i.empty_qty > 0).map((i) => `${t('empty_received')} ${i.type_name}: ${i.empty_qty}`),
    '',
    s.deposit ? `${t('security_deposit')}: ${money(s.deposit)}` : null,
    s.discount ? `${t('discount')}: ${money(s.discount)}` : null,
    `*${t('total')}: ${money(s.total)}*`,
    `${t('paid')}: ${money(s.paid)}`,
    s.customer_uid && s.due > 0.009 ? `${t('due_this_bill')}: ${money(s.due)}` : null,
    s.customer_balance != null ? `${t('total_outstanding')}: ${money(s.customer_balance)}` : null,
    '',
    shop?.receipt_note || null,
    t('thank_you'),
  ];
  return lines.filter((x) => x !== null).join('\n');
}

export function paymentText(shop, p) {
  return [
    `*${shop?.name ?? ''}*`,
    `${t('payment_receipt')} ${p.ref}`,
    fDateTime(p.date),
    `${t('customer')}: ${p.customer_name ?? ''}`,
    `*${t('amount_received')}: ${money(p.amount)}*`,
    `${t('payment_method')}: ${methodLabel(p.method)}`,
    p.customer_balance != null ? `${t('remaining_balance')}: ${money(p.customer_balance)}` : null,
    '',
    t('thank_you'),
  ]
    .filter((x) => x !== null)
    .join('\n');
}
