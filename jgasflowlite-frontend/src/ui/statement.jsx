import { useAuth } from '@/lib/auth';
import { fDate, money, num0 } from '@/lib/format';
import { t } from '@/lib/i18n';
import { PrintCredit, PrintLogo, useShopLogo } from './receipt';

/**
 * A printed account statement (customer or supplier), for A4 / A5 / Letter.
 * Hidden on screen; only this block prints. Always readable, even with no
 * transactions: the header, the account and a zero summary still show.
 *
 * entries: [{ date, kind, ref, detail, debit, credit, balance }]
 * cols: { debit, credit } column titles; summary: [{ label, value, tone? }]
 */
export function Statement({ title, party, entries, cols, summary, describe }) {
  const { shop } = useAuth();
  const logo = useShopLogo();
  const today = new Date().toISOString().slice(0, 10);
  const rows = entries.filter((e) => e.kind !== 'opening' || e.debit || e.credit);
  const cell = 'border border-[#c9ccd8] px-2 py-1.5';
  return (
    <div className="print-area hidden print:block text-[#111] bg-white">
      {/* shop and document title */}
      <div className="flex items-start justify-between gap-4 pb-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="print-logo flex">
            <PrintLogo src={logo} />
          </span>
          <div className="min-w-0">
            <div className="font-black text-[18px] leading-tight">{shop?.name}</div>
            {shop?.address && <div className="text-[11.5px]">{shop.address}</div>}
            {shop?.phone && <div className="text-[11.5px]">{shop.phone}</div>}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-black text-[16px] uppercase tracking-wide text-[#020033]">{title}</div>
          <div className="text-[11.5px]">
            {t('printed_on')}: {fDate(today)}
          </div>
        </div>
      </div>

      <div className="h-[3px] rounded-full bg-[#020033]" />

      {/* the account */}
      <div className="mt-3 grid grid-cols-2 gap-4 text-[12px]">
        <div className="border border-[#c9ccd8] rounded-[6px] p-2.5 min-w-0">
          <div className="text-[10.5px] uppercase tracking-wide text-[#555]">{party.kindLabel}</div>
          <div className="font-bold text-[14px] break-words">{party.name}</div>
          {party.phone && <div>{party.phone}</div>}
          {party.address && <div className="break-words">{party.address}</div>}
        </div>
        <div className="border border-[#c9ccd8] rounded-[6px] p-2.5 grid grid-cols-2 gap-x-3 gap-y-1">
          {summary.map((s) => (
            <div key={s.label} className="min-w-0">
              <div className="text-[10.5px] uppercase tracking-wide text-[#555] truncate">{s.label}</div>
              <div className={`font-bold num ${s.tone === 'red' ? 'text-[#C62828]' : s.tone === 'green' ? 'text-[#2E7D32]' : ''}`}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* the ledger */}
      <table className="w-full mt-3 border-collapse text-[11.5px]">
        <thead>
          <tr className="bg-[#eef0f7]">
            <th className={`${cell} text-left w-[78px]`}>{t('date')}</th>
            <th className={`${cell} text-left`}>{t('detail')}</th>
            <th className={`${cell} text-right w-[90px]`}>{cols.debit}</th>
            <th className={`${cell} text-right w-[90px]`}>{cols.credit}</th>
            <th className={`${cell} text-right w-[100px]`}>{t('balance')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className={`${cell} text-center py-6 text-[#555]`} colSpan={5}>
                {t('no_transactions')}
              </td>
            </tr>
          ) : (
            rows.map((e, i) => (
              <tr key={i} className={i % 2 ? 'bg-[#fafbfd]' : ''}>
                <td className={`${cell} whitespace-nowrap`}>{e.kind === 'opening' ? '' : fDate(e.date)}</td>
                <td className={cell}>{describe(e)}</td>
                <td className={`${cell} text-right num`}>{e.debit ? num0(e.debit) : ''}</td>
                <td className={`${cell} text-right num`}>{e.credit ? num0(e.credit) : ''}</td>
                <td className={`${cell} text-right num font-bold`}>{money(e.balance)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <PrintCredit className="mt-5" />
    </div>
  );
}
