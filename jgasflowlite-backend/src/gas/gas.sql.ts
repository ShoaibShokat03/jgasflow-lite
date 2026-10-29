/** Shared SQL fragments. Outer aliases: c = customers, s = suppliers (in their own queries). */

export const CUST_BAL = `(c.opening_balance
  + IFNULL((SELECT SUM(x.total) FROM sales x WHERE x.tenant_id = c.tenant_id AND x.customer_uid = c.uid AND x.deleted = 0), 0)
  - IFNULL((SELECT SUM(p.amount) FROM payments p WHERE p.tenant_id = c.tenant_id AND p.customer_uid = c.uid AND p.deleted = 0), 0))`;

export const CUST_HELD = `IFNULL((SELECT SUM(h.qty_delta) FROM held_moves h WHERE h.tenant_id = c.tenant_id AND h.customer_uid = c.uid AND h.deleted = 0), 0)`;

export const SUP_BAL = `(s.opening_balance
  + IFNULL((SELECT SUM(p.total) FROM purchases p WHERE p.tenant_id = s.tenant_id AND p.supplier_uid = s.uid AND p.deleted = 0), 0)
  - IFNULL((SELECT SUM(x.amount) FROM supplier_payments x WHERE x.tenant_id = s.tenant_id AND x.supplier_uid = s.uid AND x.deleted = 0), 0))`;

export const SALE_ITEMS_TEXT = `(SELECT GROUP_CONCAT(CASE
      WHEN t.unit = 'kg' THEN CONCAT(TRIM(TRAILING '.' FROM TRIM(TRAILING '0' FROM si.kg)), ' kg ', t.name)
      WHEN si.mode = 'new' THEN CONCAT(si.qty, ' x ', t.name, ' + cylinder')
      WHEN si.mode = 'empty' THEN CONCAT(si.qty, ' x empty ', t.name)
      ELSE CONCAT(si.qty, ' x ', t.name) END ORDER BY t.sort SEPARATOR ', ')
  FROM sale_items si JOIN cylinder_types t ON t.tenant_id = si.tenant_id AND t.uid = si.type_uid
  WHERE si.tenant_id = s.tenant_id AND si.sale_uid = s.uid AND si.deleted = 0 AND (si.qty > 0 OR si.kg > 0))`;

export const PUR_ITEMS_TEXT = `(SELECT GROUP_CONCAT(IF(pi.mode = 'empty', CONCAT(pi.qty, ' x empty ', t.name), CONCAT(pi.qty, ' x ', t.name)) ORDER BY t.sort SEPARATOR ', ')
  FROM purchase_items pi JOIN cylinder_types t ON t.tenant_id = pi.tenant_id AND t.uid = pi.type_uid
  WHERE pi.tenant_id = p.tenant_id AND pi.purchase_uid = p.uid AND pi.deleted = 0 AND pi.qty > 0)`;

/** Live stock per type from the move ledger. Needs tenant id twice. */
export const STOCK_JOIN = `
  LEFT JOIN (SELECT type_uid, SUM(full_delta) AS f, SUM(empty_delta) AS e, SUM(kg_delta) AS k FROM stock_moves
             WHERE tenant_id = ? AND deleted = 0 GROUP BY type_uid) sm ON sm.type_uid = t.uid
  LEFT JOIN (SELECT type_uid, SUM(qty_delta) AS q, SUM(deposit_delta) AS d FROM held_moves
             WHERE tenant_id = ? AND deleted = 0 GROUP BY type_uid) hm ON hm.type_uid = t.uid`;

const HIDDEN = ['id', 'tenant_id', 'version', 'deleted', 'by_user'];

/** Drop internal columns before sending a row to the browser. */
export function out<T extends Record<string, any>>(row: T): T {
  if (!row) return row;
  const r: Record<string, any> = { ...row };
  for (const k of HIDDEN) delete r[k];
  if ('updated_at' in r) r.updated_at = Number(r.updated_at);
  return r as T;
}
