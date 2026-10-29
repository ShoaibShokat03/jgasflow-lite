import { Cable, Flame, Gauge, Package, Wrench, Zap } from 'lucide-react';
import { t } from '@/lib/i18n';
import { cn } from './kit';

/** Cylinder colours to choose from (stored on the cylinder type as #hex). */
export const CYL_COLORS = [
  { value: '#1565C0', key: 'col_blue' },
  { value: '#C62828', key: 'col_red' },
  { value: '#2E7D32', key: 'col_green' },
  { value: '#F26B1D', key: 'col_orange' },
  { value: '#F9A825', key: 'col_yellow' },
  { value: '#6A3FB5', key: 'col_purple' },
  { value: '#00897B', key: 'col_teal' },
  { value: '#78909C', key: 'col_grey' },
  { value: '#020033', key: 'col_navy' },
  { value: '#8D6E63', key: 'col_brown' },
];
export const DEFAULT_CYL = '#1565C0';

/** Suggested groups for other items; shops can type their own. */
export const ITEM_CATEGORIES = ['Chulha (stove)', 'Regulator', 'Pipe', 'Burner', 'Lighter', 'Accessories'];

/** A gas cylinder drawn in its colour; `empty` draws it faded (no gas). */
export function CylinderArt({ color, size = 44, empty = false, className, title }) {
  const c = color || DEFAULT_CYL;
  return (
    <svg viewBox="0 0 40 56" width={size * (40 / 56)} height={size} className={cn('shrink-0', className)} role="img" aria-label={title || t('cylinder')}>
      {/* valve and guard */}
      <rect x="17" y="1.5" width="6" height="5" rx="1.2" fill="#5F6279" />
      <path d="M12 9.5c0-3 3.6-4.5 8-4.5s8 1.5 8 4.5v1.5H12z" fill="#8a8ea5" />
      {/* shoulder and body */}
      <path d="M6 20c0-6.5 6.2-10 14-10s14 3.5 14 10v27a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4z" fill={c} opacity={empty ? 0.35 : 1} />
      {empty && <path d="M6 20c0-6.5 6.2-10 14-10s14 3.5 14 10v27a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4z" fill="none" stroke={c} strokeWidth="1.4" strokeDasharray="3 2.2" />}
      {/* shine */}
      <rect x="10" y="17" width="3.2" height="28" rx="1.6" fill="#fff" opacity="0.28" />
      {/* label band */}
      <rect x="6" y="27" width="28" height="9" fill="#fff" opacity={empty ? 0.5 : 0.85} />
      <path d="M14 31.5h12" stroke={c} strokeWidth="1.6" strokeLinecap="round" opacity="0.8" />
      {/* foot ring */}
      <rect x="8" y="50.5" width="24" height="4" rx="1.5" fill="#5F6279" />
    </svg>
  );
}

const itemIcon = (cat) => {
  const s = String(cat || '').toLowerCase();
  if (/chul|stove|cook|choolha/.test(s)) return Flame;
  if (/burn/.test(s)) return Flame;
  if (/regul|valve|gauge/.test(s)) return Gauge;
  if (/pipe|hose|tube/.test(s)) return Cable;
  if (/light|spark/.test(s)) return Zap;
  if (/tool|spare|part|access/.test(s)) return Wrench;
  return Package;
};
const tones = ['#6A3FB5', '#00897B', '#B77D00', '#1565C0', '#C62828', '#2E7D32'];
const toneOf = (cat) => tones[[...String(cat || 'x')].reduce((a, ch) => a + ch.charCodeAt(0), 0) % tones.length];

/** A tile with an icon for an other item, coloured by its category. */
export function ItemArt({ category, size = 44, className }) {
  const Icon = itemIcon(category);
  const col = toneOf(category);
  return (
    <span className={cn('grid place-items-center shrink-0 rounded-[var(--radius-ctl)]', className)} style={{ width: size, height: size, background: `${col}1a`, color: col }}>
      <Icon style={{ width: size * 0.5, height: size * 0.5 }} />
    </span>
  );
}

/** The picture of any stock item: a coloured cylinder, loose gas, or an item tile. */
export function StockArt({ type, size = 44, empty = false, className }) {
  if (type?.unit === 'pcs') return <ItemArt category={type.category} size={size} className={className} />;
  if (type?.unit === 'kg')
    return (
      <span className={cn('grid place-items-center shrink-0 rounded-[var(--radius-ctl)] bg-[#fff0e6] text-accent', className)} style={{ width: size, height: size }}>
        <Flame style={{ width: size * 0.5, height: size * 0.5 }} />
      </span>
    );
  return <CylinderArt color={type?.color} size={size} empty={empty} className={className} title={type?.name} />;
}

/** Group of a stock item for filters: 'cyl', 'gas' or the item's category. */
export const groupOf = (ty) => (ty.unit === 'kg' ? 'gas' : ty.unit === 'pcs' ? `item:${ty.category || ''}` : 'cyl');

/** Filter chips for a list of stock items: All, Cylinders, Loose gas, then each item group. */
export function groupOptions(list) {
  const groups = new Map();
  for (const ty of list) {
    const g = groupOf(ty);
    groups.set(g, (groups.get(g) ?? 0) + 1);
  }
  const label = (g) => (g === 'cyl' ? t('cat_cylinders') : g === 'gas' ? t('cat_loose_gas') : g.slice(5) || t('cat_other_items'));
  const order = (g) => (g === 'cyl' ? 0 : g === 'gas' ? 1 : 2);
  return [
    { value: '', label: t('all'), count: list.length },
    ...[...groups.entries()].sort((a, b) => order(a[0]) - order(b[0]) || a[0].localeCompare(b[0])).map(([g, n]) => ({ value: g, label: label(g), count: n })),
  ];
}
