import { Banknote, Wallet } from 'lucide-react';
import { money } from '@/lib/format';
import { t } from '@/lib/i18n';
import { Card, cn } from './kit';

/** Worth of the full cylinders in stock, at purchase price and at sale price (active sizes only). */
export function stockValue(list = []) {
  const live = list.filter((x) => x.active !== false && x.active !== 0);
  const full = (x) => Math.max(0, Number(x.unit === 'kg' ? x.gas_kg : x.full_qty) || 0);
  return {
    cost: live.reduce((a, x) => a + full(x) * (Number(x.purchase_price) || 0), 0),
    sale: live.reduce((a, x) => a + full(x) * (Number(x.price) || 0), 0),
  };
}

function ValueTile({ label, value, icon: Icon, color }) {
  return (
    <Card className="p-3 min-w-0" title={t('stock_value_sub')}>
      <div className="flex items-center gap-1.5 text-[12px] font-semibold text-muted min-w-0">
        <Icon className="size-4 shrink-0" style={{ color }} />
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1 text-[clamp(15px,4.2vw,20px)] font-extrabold num whitespace-nowrap" style={{ color }}>
        {money(value)}
      </div>
    </Card>
  );
}

/** Two tiles: stock value at purchase price and at sale price. */
export function StockValueTiles({ list, className }) {
  const v = stockValue(list);
  return (
    <div className={cn('grid grid-cols-2 gap-2.5', className)}>
      <ValueTile label={t('stock_value_cost')} value={v.cost} icon={Wallet} color="#2E7D32" />
      <ValueTile label={t('stock_value_sale')} value={v.sale} icon={Banknote} color="#C2410C" />
    </div>
  );
}
