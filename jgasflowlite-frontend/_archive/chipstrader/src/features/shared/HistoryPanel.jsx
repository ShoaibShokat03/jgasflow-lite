import { Ban, RotateCcw, ArrowRightCircle, Send, Wallet, Undo2, FilePlus2, CircleDot } from 'lucide-react';
import { fmtDateTime, humanize } from '@/lib/format';
import { useUsers } from '@/lib/hooks';
import { Card, CardHeader } from '@/components/ui/core';
import { cn } from '@/lib/utils';

const META = {
  cancelled: { icon: Ban, tone: 'bg-rose-100 text-danger dark:bg-rose-500/15' },
  line_cancelled: { icon: Ban, tone: 'bg-rose-100 text-danger dark:bg-rose-500/15' },
  voided: { icon: Ban, tone: 'bg-rose-100 text-danger dark:bg-rose-500/15' },
  uncancelled: { icon: RotateCcw, tone: 'bg-emerald-100 text-success dark:bg-emerald-500/15' },
  converted: { icon: ArrowRightCircle, tone: 'bg-violet-100 text-violet-700 dark:text-violet-300 dark:bg-violet-500/15' },
  issued: { icon: Send, tone: 'bg-brand-100 text-brand-700 dark:text-brand-300 dark:bg-brand-500/15' },
  payment: { icon: Wallet, tone: 'bg-emerald-100 text-success dark:bg-emerald-500/15' },
  payment_reversed: { icon: Undo2, tone: 'bg-amber-100 text-warning dark:bg-amber-500/15' },
  status: { icon: CircleDot, tone: 'bg-cyan-100 text-info dark:bg-cyan-500/15' },
};

/** Timeline of every cancel, restore, conversion, status change and payment. */
export function HistoryPanel({ events = [], createdAt }) {
  const { data: users } = useUsers();
  const who = (id) => {
    const u = users?.find((x) => x.id === id);
    return u ? u.full_name || u.username : id ? `User #${id}` : 'System';
  };
  const rows = [...events, ...(createdAt ? [{ id: 'created', event_type: 'created', created_at: createdAt }] : [])];
  return (
    <Card>
      <CardHeader title="History" />
      <ol className="relative px-5 pb-5">
        {rows.map((e, i) => {
          const m = META[e.event_type] ?? { icon: FilePlus2, tone: 'bg-surface-3 text-muted' };
          return (
            <li key={e.id} className="relative flex gap-3 pb-5 last:pb-0">
              {i < rows.length - 1 && <span className="absolute left-[15px] top-8 bottom-0 w-px bg-line" />}
              <span className={cn('grid place-items-center size-8 rounded-full shrink-0', m.tone)}><m.icon className="size-4" /></span>
              <div className="pt-1 min-w-0">
                <p className="text-[13.5px]">
                  <span className="font-medium">{e.event_type === 'created' ? 'Created' : humanize(e.event_type)}</span>
                  {e.created_by !== undefined && <span className="text-muted"> · {who(e.created_by)}</span>}
                </p>
                {e.reason && <p className="text-[13px] text-muted mt-0.5 break-words">{e.reason}</p>}
                <p className="text-xs text-faint mt-0.5">{fmtDateTime(e.created_at)}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
