import { useState } from 'react';
import { ChevronDown, Database, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatValue, hiddenKey, labelFor } from './dataformat';
import { DOC_REF, docHref } from './crew';
import { Link } from 'react-router-dom';

/**
 * Pop-up data windows for voice conversations. Whatever a lookup returned is
 * shown as the agent talks: a list becomes a table, a record becomes labelled
 * figures, nested sections become their own small tables. Every value is
 * formatted by its type (money, quantity, percent, days, date).
 */

const isRowList = (v) => Array.isArray(v) && v.length > 0 && v.every((x) => x && typeof x === 'object' && !Array.isArray(x));
/** Bookkeeping fields that are context, not data. */
const META = new Set(['note', 'next', 'main_currency', 'match', 'dataset', 'scope', 'truncated', 'rows_returned', 'type']);
const isScalar = (v) => v === null || ['string', 'number', 'boolean'].includes(typeof v);

/** Render text, turning document numbers into links. */
function Ref({ text, onNavigate }) {
  const s = String(text);
  const parts = [];
  let last = 0;
  for (const m of s.matchAll(DOC_REF)) {
    if (m.index > last) parts.push(s.slice(last, m.index));
    const href = docHref(m[0]);
    parts.push(href ? <Link key={m.index} to={href} onClick={onNavigate} className="cc-ref">{m[0]}</Link> : m[0]);
    last = m.index + m[0].length;
  }
  if (last < s.length) parts.push(s.slice(last));
  return <>{parts}</>;
}

function Table({ rows, ctx, limit = 8, onNavigate }) {
  const [all, setAll] = useState(false);
  const real = rows.filter((r) => !('__more' in r));
  const more = rows.find((r) => '__more' in r)?.__more ?? 0;
  const keys = [...new Set(real.flatMap((r) => Object.keys(r)))].filter((k) => !hiddenKey(k) && real.some((r) => isScalar(r[k]))).slice(0, 7);
  const shown = all ? real : real.slice(0, limit);
  const hiddenCount = real.length - shown.length + more;
  return (
    <div>
      <div className="cc-table-wrap cc-scroll !my-0">
        <table className="cc-table">
          <thead><tr>{keys.map((k) => <th key={k}>{labelFor(k)}</th>)}</tr></thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={i}>
                {keys.map((k) => {
                  const f = formatValue(k, r[k], r, ctx);
                  return <td key={k} className={cn(f.numeric && 'num', f.empty && 'cc-faint')}>{f.numeric ? f.text : <Ref text={f.text} onNavigate={onNavigate} />}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hiddenCount > 0 && (
        <button type="button" onClick={() => setAll(true)} className="cc-focus mt-1 cc-mono text-[11px] cc-faint hover:text-[var(--cc-ink)]" disabled={all && !more}>
          {all ? `${more} more not loaded` : `Show ${real.length - shown.length > 0 ? real.length - shown.length : ''} more`}
        </button>
      )}
    </div>
  );
}

function Facts({ obj, ctx, onNavigate }) {
  const entries = Object.entries(obj).filter(([k, v]) => !hiddenKey(k) && isScalar(v) && !META.has(k));
  if (!entries.length) return null;
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
      {entries.slice(0, 16).map(([k, v]) => {
        const f = formatValue(k, v, obj, ctx);
        return (
          <div key={k} className="min-w-0">
            <dt className="cc-label !text-[9.5px] truncate">{labelFor(k)}</dt>
            <dd className={cn('text-[13.5px] font-semibold truncate', f.numeric && 'tabular-nums', f.empty && 'cc-faint font-normal')} title={f.text}>
              {f.numeric ? f.text : <Ref text={f.text} onNavigate={onNavigate} />}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/** Any tool result, laid out by shape. */
export function DataView({ data, depth = 0, ctx: parent, onNavigate }) {
  if (data == null) return <p className="cc-faint text-[12.5px]">No data</p>;
  if (isScalar(data)) return <p className="text-[13px]">{String(data)}</p>;
  const ctx = {
    main: data.main_currency ?? parent?.main,
    currency: data.currency ?? parent?.currency,
  };
  if (isRowList(data)) return <Table rows={data} ctx={ctx} onNavigate={onNavigate} />;
  if (Array.isArray(data)) return <p className="text-[13px]">{data.filter(isScalar).join(', ')}</p>;
  if (data.error) return <p className="text-[13px]" style={{ color: 'var(--cc-bad)' }}>{data.error}</p>;
  if (data.restricted) return <p className="text-[13px] cc-faint">{data.restricted}</p>;

  // query_records: { rows, total_matching, ... }
  if (Array.isArray(data.rows)) {
    return (
      <div className="space-y-2">
        <p className="cc-mono text-[11px] cc-faint">
          {data.dataset ? `${labelFor(data.dataset)} · ` : ''}
          {data.total_matching != null ? `${formatValue('count', data.total_matching).text} found` : `${data.rows_returned} rows`}
        </p>
        {data.rows.length ? <Table rows={data.rows} ctx={ctx} onNavigate={onNavigate} /> : <p className="cc-faint text-[12.5px]">Nothing matched</p>}
      </div>
    );
  }

  const sections = Object.entries(data).filter(([k, v]) => !hiddenKey(k) && v && typeof v === 'object' && !(Array.isArray(v) && !v.length));
  return (
    <div className="space-y-3">
      {data.note && <p className="text-[12.5px] cc-muted">{data.note}</p>}
      <Facts obj={data} ctx={ctx} onNavigate={onNavigate} />
      {depth < 2 && sections.slice(0, 6).map(([k, v]) => (
        <section key={k} className="space-y-1.5">
          <p className="cc-label">{labelFor(k)}</p>
          <DataView data={v} depth={depth + 1} ctx={ctx} onNavigate={onNavigate} />
        </section>
      ))}
    </div>
  );
}

/** Stack of pop-up windows, newest on top; older ones collapse to their title bar. */
export function DataPopups({ items, crewMap, onDismiss, onClear, onNavigate }) {
  const [openId, setOpenId] = useState(null);
  if (!items.length) return null;
  const newest = items[0]?.id;
  return (
    <div className="absolute z-30 top-3 right-3 w-[min(440px,calc(100%-24px))] max-h-[calc(100%-320px)] min-h-[160px] flex flex-col gap-2 pointer-events-none">
      {items.length > 1 && (
        <button type="button" onClick={onClear} className="pointer-events-auto self-end cc-chip !h-6 !text-[11px]">Close all</button>
      )}
      {items.slice(0, 4).map((it) => {
        const a = crewMap[it.agent] ?? crewMap.nova;
        const expanded = openId ? openId === it.id : it.id === newest;
        const sub = Object.values(it.input ?? {}).filter((x) => isScalar(x) && x !== '').join(' · ');
        return (
          <article key={it.id} className={cn('cc-popup pointer-events-auto cc-panel cc-frame overflow-hidden flex flex-col', expanded ? 'min-h-0' : 'shrink-0')} style={{ '--a': a?.accent, '--cc-accent': a?.accent, background: 'var(--cc-panel-2)' }}>
            <header className="flex items-center gap-2 px-3 py-2 border-b cc-hair">
              <Database className="size-4 shrink-0" style={{ color: a?.accent }} />
              <button type="button" className="cc-focus flex-1 min-w-0 text-left" onClick={() => setOpenId(expanded ? '__none' : it.id)} aria-expanded={expanded}>
                <span className="block text-[13px] font-semibold truncate">{it.label}</span>
                {sub && <span className="block cc-mono text-[10.5px] cc-faint truncate">{sub}</span>}
              </button>
              <span className="cc-mono text-[10.5px] cc-faint shrink-0">{a?.name}</span>
              <ChevronDown className={cn('size-4 cc-faint shrink-0 transition-transform', expanded && 'rotate-180')} />
              <button type="button" className="cc-btn cc-btn-icon !h-6 !w-6 shrink-0" onClick={() => onDismiss(it.id)} aria-label="Close"><X className="size-3.5" /></button>
            </header>
            {expanded && (
              <div className="p-3 overflow-y-auto cc-scroll min-h-0">
                <DataView data={it.data} onNavigate={onNavigate} />
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
