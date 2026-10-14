import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Download, FileSpreadsheet, FileText, Filter, Layers } from 'lucide-react';
import { exportRows } from '@/lib/exporter';
import { t } from '@/lib/i18n';
import { toast } from './overlay';
import { Button, cn } from './kit';

/**
 * "Export" button with a small menu: download this list (with its search and
 * filters) or every record, as CSV or Excel.
 *
 *   title    file and sheet name, e.g. t('sales')
 *   columns  from features/exports.js (readable columns only)
 *   rows     the list on screen (undefined while loading)
 *   all      optional async () => every record; leave out when the list has no filters
 */
export function ExportMenu({ title, columns, rows, all, className, align = 'right' }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const run = async (which, format) => {
    if (busy) return;
    setBusy(`${which}-${format}`);
    try {
      const list = which === 'all' ? await all() : rows || [];
      if (!list.length) {
        toast(t('export_none'), 'info');
        return;
      }
      exportRows({ title, columns: typeof columns === 'function' ? columns() : columns, rows: list, format });
      toast(t('exported', { n: list.length }));
      setOpen(false);
    } catch (e) {
      toast(e?.message || String(e), 'error');
    } finally {
      setBusy('');
    }
  };

  const count = rows?.length ?? 0;
  const sections = all
    ? [
        { id: 'view', icon: Filter, title: t('export_view'), sub: t('export_view_sub', { n: count }) },
        { id: 'all', icon: Layers, title: t('export_all'), sub: t('export_all_sub') },
      ]
    : [{ id: 'view', icon: Layers, title: t('export_all'), sub: t('export_list_sub', { n: count }) }];

  return (
    <div ref={ref} className={cn('relative', className)}>
      <Button variant="outline" icon={Download} iconRight={ChevronDown} aria-haspopup="menu" aria-expanded={open} disabled={!rows} onClick={() => setOpen(!open)}>
        {t('export')}
      </Button>
      {open && (
        <div role="menu" className={cn('absolute z-40 mt-1.5 w-[300px] max-w-[calc(100vw-32px)] card p-2 shadow-[var(--shadow-pop)] animate-pop', align === 'right' ? 'right-0' : 'left-0')}>
          <div className="px-2 pt-1 pb-2 text-[12px] font-semibold text-muted">{t('export_title')}</div>
          {sections.map((s) => (
            <div key={s.id} className="rounded-[var(--radius-xs)] border border-line p-2.5 mb-2 last:mb-1">
              <div className="flex items-start gap-2.5 mb-2">
                <s.icon className="size-4 mt-0.5 shrink-0 text-primary" />
                <div className="min-w-0">
                  <div className="font-semibold text-[13.5px] leading-tight">{s.title}</div>
                  <div className="text-[11.5px] text-muted leading-snug">{s.sub}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <Button size="sm" variant="outline" icon={FileText} loading={busy === `${s.id}-csv`} disabled={!!busy || (s.id === 'view' && !count)} onClick={() => run(s.id, 'csv')}>
                  {t('export_csv')}
                </Button>
                <Button size="sm" variant="good" icon={FileSpreadsheet} loading={busy === `${s.id}-xlsx`} disabled={!!busy || (s.id === 'view' && !count)} onClick={() => run(s.id, 'xlsx')}>
                  {t('export_excel')}
                </Button>
              </div>
            </div>
          ))}
          <div className="px-2 pb-1 text-[11px] text-muted leading-snug">{t('export_help')}</div>
        </div>
      )}
    </div>
  );
}
