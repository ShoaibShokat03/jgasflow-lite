/**
 * The synced gas tables. This one spec drives the MySQL DDL, sync push/pull,
 * snapshot import/export and the mobile app's mapping (column names match the
 * app's SQLite tables; foreign keys travel as `<x>_uid` instead of local ids).
 *
 * Every synced row also has: tenant_id, uid, version (per-shop change counter),
 * updated_at (ms, last-write-wins) and deleted (tombstone).
 *
 * Counters are NOT synced. Stock (full/empty) is the sum of stock_moves and what
 * customers hold is the sum of held_moves, so edits from several phones and the
 * web add up instead of overwriting each other.
 */
export type ColKind = 'str' | 'text' | 'int' | 'money' | 'num' | 'date' | 'bool' | 'uid';

export interface Col {
  name: string;
  kind: ColKind;
  len?: number;
  /** For uid columns: the table it points to. */
  ref?: string;
  nullable?: boolean;
}

export interface TableSpec {
  name: string;
  cols: Col[];
  index?: string[][];
  /** Document number prefix; the table gets a `no` column the server fills. */
  doc?: 'S' | 'P' | 'R';
}

const s = (name: string, len = 120): Col => ({ name, kind: 'str', len });
const txt = (name: string): Col => ({ name, kind: 'text' });
const i = (name: string): Col => ({ name, kind: 'int' });
const m = (name: string): Col => ({ name, kind: 'money' });
const n = (name: string): Col => ({ name, kind: 'num' });
const d = (name: string, nullable = false): Col => ({ name, kind: 'date', nullable });
const b = (name: string): Col => ({ name, kind: 'bool' });
const u = (name: string, ref: string, nullable = false): Col => ({ name, kind: 'uid', ref, nullable });

export const TABLES: TableSpec[] = [
  {
    name: 'cylinder_types',
    // unit: '' = gas cylinder, 'kg' = loose gas sold by weight (prices per kg), 'pcs' = other item (stove, regulator...)
    // category: group of an other item; color: cylinder colour (#hex); cyl_price: price of the cylinder itself (sold empty or with gas)
    cols: [s('name', 60), n('kg'), m('price'), m('wholesale_price'), m('purchase_price'), m('deposit'), i('low_level'), i('sort'), b('active'), s('unit', 10), s('category', 60), s('color', 20), m('cyl_price')],
  },
  {
    name: 'customers',
    cols: [s('name'), s('phone', 30), s('address', 255), s('type', 20), m('opening_balance'), txt('note'), b('active'), d('created_at', true)],
    index: [['tenant_id', 'name']],
  },
  {
    name: 'suppliers',
    cols: [s('name'), s('phone', 30), s('address', 255), m('opening_balance'), txt('note'), b('active'), d('created_at', true)],
  },
  {
    name: 'price_history',
    cols: [u('type_uid', 'cylinder_types'), s('kind', 20), m('old_price'), m('price'), d('date'), s('note', 255)],
    index: [['tenant_id', 'type_uid']],
  },
  {
    name: 'customer_prices',
    cols: [u('customer_uid', 'customers'), u('type_uid', 'cylinder_types'), m('price')],
    index: [['tenant_id', 'customer_uid']],
  },
  {
    name: 'sales',
    doc: 'S',
    cols: [u('customer_uid', 'customers', true), d('date'), m('subtotal'), m('deposit'), m('discount'), m('total'), m('paid'), txt('note'), d('created_at', true)],
    index: [['tenant_id', 'date'], ['tenant_id', 'customer_uid']],
  },
  {
    name: 'sale_items',
    // kg: weight sold for loose gas lines (qty is 0 then)
    // mode: '' = refill (full out, empties back), 'new' = gas with the cylinder (customer keeps it), 'empty' = cylinder without gas
    cols: [u('sale_uid', 'sales'), u('type_uid', 'cylinder_types'), i('qty'), i('empty_qty'), m('price'), m('deposit'), m('amount'), n('kg'), s('mode', 10)],
    index: [['tenant_id', 'sale_uid']],
  },
  {
    name: 'payments',
    doc: 'R',
    cols: [u('customer_uid', 'customers', true), u('sale_uid', 'sales', true), d('date'), m('amount'), s('method', 20), txt('note'), d('created_at', true)],
    index: [['tenant_id', 'customer_uid'], ['tenant_id', 'date'], ['tenant_id', 'sale_uid']],
  },
  {
    name: 'cylinder_returns',
    cols: [u('customer_uid', 'customers'), u('type_uid', 'cylinder_types'), i('qty'), m('deposit_refund'), d('date'), txt('note')],
    index: [['tenant_id', 'customer_uid']],
  },
  {
    name: 'purchases',
    doc: 'P',
    cols: [u('supplier_uid', 'suppliers', true), d('date'), m('total'), m('paid'), txt('note'), d('created_at', true)],
    index: [['tenant_id', 'date'], ['tenant_id', 'supplier_uid']],
  },
  {
    name: 'purchase_items',
    // mode: '' = gas (full in, empties out) or other items, 'empty' = new empty cylinders bought
    cols: [u('purchase_uid', 'purchases'), u('type_uid', 'cylinder_types'), i('qty'), i('empty_sent'), m('price'), m('amount'), s('mode', 10)],
    index: [['tenant_id', 'purchase_uid']],
  },
  {
    name: 'supplier_payments',
    cols: [u('supplier_uid', 'suppliers', true), u('purchase_uid', 'purchases', true), d('date'), m('amount'), s('method', 20), txt('note'), d('created_at', true)],
    index: [['tenant_id', 'supplier_uid']],
  },
  {
    name: 'stock_moves',
    // kg_delta: loose gas in or out (kg)
    cols: [u('type_uid', 'cylinder_types'), d('date'), i('full_delta'), i('empty_delta'), s('reason', 20), s('ref', 60), n('kg_delta')],
    index: [['tenant_id', 'type_uid']],
  },
  {
    name: 'held_moves',
    cols: [u('customer_uid', 'customers'), u('type_uid', 'cylinder_types'), i('qty_delta'), m('deposit_delta'), s('reason', 20), d('date'), s('ref', 60)],
    index: [['tenant_id', 'customer_uid'], ['tenant_id', 'type_uid']],
  },
];

export const TABLE = Object.fromEntries(TABLES.map((t) => [t.name, t])) as Record<string, TableSpec>;
export const TABLE_NAMES = TABLES.map((t) => t.name);

/** Columns of a table including `no` for document tables. */
export function dataCols(t: TableSpec): Col[] {
  return t.doc ? [{ name: 'no', kind: 'int', nullable: true }, ...t.cols] : t.cols;
}

/** The four standard cylinder sizes. Fixed uids so phone and web copies merge, not duplicate. */
export const SEED_TYPES = [
  { uid: 'seedtype000000000000000000000001', name: '5 kg', kg: 5, price: 1450, wholesale_price: 1400, purchase_price: 1300, deposit: 2500, sort: 1 },
  { uid: 'seedtype000000000000000000000002', name: '11.8 kg', kg: 11.8, price: 3250, wholesale_price: 3150, purchase_price: 2950, deposit: 5000, sort: 2 },
  { uid: 'seedtype000000000000000000000003', name: '15 kg', kg: 15, price: 4100, wholesale_price: 4000, purchase_price: 3750, deposit: 6000, sort: 3 },
  { uid: 'seedtype000000000000000000000004', name: '45.4 kg', kg: 45.4, price: 12300, wholesale_price: 12000, purchase_price: 11300, deposit: 15000, sort: 4 },
];

/**
 * What a salesman may change. They sell, take payments and look after
 * customers; stock corrections, purchases, prices and deletes are not theirs.
 */
export const SALESMAN_TABLES = new Set(['customers', 'sales', 'sale_items', 'payments', 'cylinder_returns', 'stock_moves', 'held_moves']);
export const SALESMAN_MOVE_REASONS = new Set(['sale', 'return']);
