import { Cloud, CloudOff } from 'lucide-react';
import { t } from '@/lib/i18n';
import { cn } from './kit';

/** Offline (phone only) or Online (web and sync) label for a plan. */
export function PlanMode({ mode, className }) {
  if (mode !== 'offline' && mode !== 'online') return null;
  const off = mode === 'offline';
  const Icon = off ? CloudOff : Cloud;
  return (
    <span className={cn('inline-flex items-center gap-1 h-6 px-2 rounded-md text-[11px] font-bold whitespace-nowrap', off ? 'bg-[#eef0fb] text-primary' : 'bg-[#e7f6ee] text-good', className)}>
      <Icon className="size-3.5" /> {off ? t('plan_offline') : t('plan_online')}
    </span>
  );
}
