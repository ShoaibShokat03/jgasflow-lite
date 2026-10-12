// End-to-end check of the API against a running server and a test database.
//   node scripts/e2e.mjs [http://localhost:5000/api]
// Creates throwaway shops with random phone numbers; needs a Super Admin made by
// `npm run admin:create` (reads storage/super-admin.txt).
import 'dotenv/config';
import { readFileSync } from 'fs';
import { randomBytes } from 'crypto';
import mysql from 'mysql2/promise';

const API = process.argv[2] || 'http://localhost:5000/api';
let passed = 0;
const fail = (msg) => {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
};
const ok = (cond, msg) => {
  if (!cond) fail(msg);
  passed++;
  console.log(`  ok  ${msg}`);
};

async function call(method, path, token, body) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data };
}
const must = async (method, path, token, body) => {
  const r = await call(method, path, token, body);
  if (r.status >= 300) fail(`${method} ${path} -> ${r.status} ${JSON.stringify(r.data)}`);
  return r.data;
};

const rnd = () => `03${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;
const uid = () => randomBytes(16).toString('hex');
const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

console.log('Signup and profile');
const ownerPhone = rnd();
const sign = await must('POST', '/auth/signup', null, { shop_name: 'Test Gas Agency', owner_name: 'Ali Raza', phone: ownerPhone, password: 'secret123' });
const T = sign.token;
ok(sign.subscription.plan === 'trial' && sign.subscription.status === 'active' && sign.subscription.days_left >= 13, 'new shop is on an active 14 day trial');
ok((await call('POST', '/auth/signup', null, { shop_name: 'Other', owner_name: 'Ali', phone: ownerPhone, password: 'secret123' })).status === 409, 'same phone cannot sign up twice');
ok((await call('POST', '/auth/signup', null, { shop_name: 'Shop', owner_name: 'Ali 2', phone: rnd(), password: 'secret123' })).status === 400, 'owner name with digits is rejected');
ok((await call('POST', '/auth/login', null, { login: ownerPhone, password: 'wrong' })).status === 401, 'wrong password is rejected');
const login = await must('POST', '/auth/login', null, { login: `+92${ownerPhone.slice(1)}`, password: 'secret123' });
ok(!!login.token && login.user.role === 'owner', 'login works with +92 form of the phone');

console.log('Stock and sale');
const types = await must('GET', '/types', T);
ok(types.length === 4 && types[0].uid.startsWith('seedtype'), 'four standard cylinder types are seeded');
const t11 = types.find((t) => t.name === '11.8 kg');
await must('POST', `/types/${t11.uid}/stock`, T, { full: 50, empty: 10, note: 'count' });
const cust = await must('POST', '/customers', T, { name: 'Bilal Hotel', phone: '0301-1234567', type: 'retail', opening_balance: 1000 });
const sale = await must('POST', '/sales', T, {
  customer_uid: cust.uid,
  lines: [{ type_uid: t11.uid, qty: 3, empty: 1, price: 3250 }],
  charge_deposit: true,
  discount: 50,
  paid: 5000,
  method: 'cash',
});
ok(sale.no === 'S-00001', 'first sale is S-00001');
const s1 = await must('GET', `/sales/${sale.uid}`, T);
ok(s1.subtotal === 9750 && s1.deposit === 10000 && s1.total === 19700, 'sale totals: 3 x 3250 + 2 deposits - 50 discount');
let ty = (await must('GET', '/types', T)).find((t) => t.uid === t11.uid);
ok(ty.full_qty === 47 && ty.empty_qty === 11 && ty.with_customers === 2, 'stock moved: 47 full, 11 empty, 2 with customer');
let c = await must('GET', `/customers/${cust.uid}`, T);
ok(c.balance === 1000 + 19700 - 5000 && c.held === 2, 'customer balance and held cylinders');
await must('POST', '/payments', T, { customer_uid: cust.uid, amount: 700, method: 'jazzcash' });
const led = await must('GET', `/customers/${cust.uid}/ledger`, T);
ok(led.entries.length === 4 && led.entries.at(-1).balance === 15000, 'ledger: opening, sale, 2 payments, balance 15000');
await must('POST', `/customers/${cust.uid}/returns`, T, { type_uid: t11.uid, qty: 1, refund: 5000 });
c = await must('GET', `/customers/${cust.uid}`, T);
ty = (await must('GET', '/types', T)).find((t) => t.uid === t11.uid);
ok(c.held === 1 && ty.empty_qty === 12, 'return: customer holds 1, empties 12');
const dash = await must('GET', '/dashboard', T);
ok(dash.today_sales === 19700 && dash.today_payments === 5700 && dash.last7.length === 7, 'dashboard numbers');

console.log('Phone sync');
const pull0 = await must('GET', '/sync/pull?since=0', T);
ok(pull0.changes.sales?.length === 1 && pull0.changes.held_moves?.length >= 2 && !pull0.more, 'full pull returns everything');
const v0 = pull0.version;
const phoneCust = uid();
const phoneSale = uid();
const t = Date.now();
const push = await must('POST', '/sync/push', T, {
  changes: {
    customers: [{ uid: phoneCust, name: 'Phone Customer', phone: '', address: '', type: 'retail', opening_balance: 0, note: null, active: 1, created_at: now(), updated_at: t }],
    sales: [{ uid: phoneSale, no: null, customer_uid: phoneCust, date: now(), subtotal: 3250, deposit: 0, discount: 0, total: 3250, paid: 0, note: '', created_at: now(), updated_at: t }],
    sale_items: [{ uid: uid(), sale_uid: phoneSale, type_uid: t11.uid, qty: 1, empty_qty: 1, price: 3250, deposit: 0, amount: 3250, updated_at: t }],
    stock_moves: [{ uid: uid(), type_uid: t11.uid, date: now(), full_delta: -1, empty_delta: 1, reason: 'sale', ref: '', updated_at: t }],
  },
});
ok(push.accepted === 4 && push.rejected.length === 0, 'phone push accepted');
const pull1 = await must('GET', `/sync/pull?since=${v0}`, T);
ok(pull1.changes.sales?.[0]?.no === 2, 'server gives the phone sale number S-00002');
ty = (await must('GET', '/types', T)).find((t) => t.uid === t11.uid);
ok(ty.full_qty === 46, 'phone sale counted in web stock');

// Last write wins
await must('PUT', `/customers/${cust.uid}`, T, { name: 'Bilal Hotel New', phone: '0301-1234567', type: 'retail', opening_balance: 1000 });
const stale = await must('POST', '/sync/push', T, { changes: { customers: [{ uid: cust.uid, name: 'Old Name', type: 'retail', opening_balance: 1000, active: 1, updated_at: t - 60000 }] } });
ok(stale.rejected.length === 1 && stale.rejected[0].row.name === 'Bilal Hotel New', 'older phone edit loses and gets the newer copy back');
const del = await must('POST', '/sync/push', T, { changes: { customers: [{ uid: phoneCust, deleted: 1, updated_at: Date.now() + 1000 }] } });
ok(del.accepted === 1, 'phone delete accepted');
const pull2 = await must('GET', `/sync/pull?since=${pull1.version}`, T);
ok(pull2.changes.customers?.some((r) => r.uid === phoneCust && r.deleted === 1), 'delete reaches other devices as a tombstone');

// Paging
const many = Array.from({ length: 120 }, (_, i) => ({ uid: uid(), name: `Bulk ${String.fromCharCode(65 + (i % 26))}`, type: 'retail', opening_balance: 0, active: 1, updated_at: Date.now() }));
await must('POST', '/sync/push', T, { changes: { customers: many } });
let since = pull2.version;
let got = 0;
let pages = 0;
for (;;) {
  const p = await must('GET', `/sync/pull?since=${since}&limit=50`, T);
  got += p.changes.customers?.length ?? 0;
  since = p.version;
  pages++;
  if (!p.more) break;
}
ok(got === 120 && pages === 3, 'paged pull returns all 120 rows in 3 pages');

console.log('Staff roles');
const sPhone = rnd();
await must('POST', '/team', T, { name: 'Salman', phone: sPhone, role: 'salesman', password: 'sales123' });
const S = (await must('POST', '/auth/login', null, { login: sPhone, password: 'sales123', client: 'mobile', device: 'Test phone' })).token;
ok((await call('GET', '/purchases', S)).status === 403, 'salesman cannot open purchases');
ok((await call('DELETE', `/sales/${sale.uid}`, S)).status === 403, 'salesman cannot delete a sale');
const sSale = await call('POST', '/sales', S, { lines: [{ type_uid: t11.uid, qty: 1, empty: 1, price: 3300 }], paid: 3300 });
ok(sSale.status === 201, 'salesman can sell');
const sPush = await must('POST', '/sync/push', S, { changes: { purchases: [{ uid: uid(), date: now(), total: 1, paid: 0, updated_at: Date.now() }], sales: [{ uid: sale.uid, deleted: 1, updated_at: Date.now() + 5000 }] } });
ok(sPush.accepted === 0 && sPush.rejected.length === 2 && sPush.rejected.every((r) => r.reason === 'forbidden'), 'salesman phone cannot push purchases or deletes');
ok((await call('GET', '/team', S)).status === 403, 'salesman cannot see team');

console.log('Export and import');
const exp = await must('GET', '/sync/export', T);
ok(exp.format === 'jgasflow-data' && exp.tables.sales.length === 3, 'export has all live sales');
const sign2 = await must('POST', '/auth/signup', null, { shop_name: 'Second Shop', owner_name: 'Zara Khan', phone: rnd(), password: 'secret123' });
const T2 = sign2.token;
const imp = await must('POST', '/sync/import', T2, { mode: 'replace', data: exp });
ok(imp.ok && imp.accepted > 100, 'import replace into a second shop');
const c2 = await must('GET', `/customers/${cust.uid}`, T2);
ok(c2.balance === 15000 && c2.held === 1, 'imported customer balance and held cylinders match');
const s2 = await must('GET', '/sales?q=1', T2);
ok(s2.some((x) => x.ref === 'S-00001'), 'imported sales keep their numbers');
const next = await must('POST', '/sales', T2, { lines: [{ type_uid: t11.uid, qty: 1, empty: 1, price: 3250 }], paid: 3250 });
ok(next.no === 'S-00004', 'numbering continues after the imported ones');
const shopB = await must('GET', '/shop', T2);
ok(shopB.name === 'Test Gas Agency', 'replace import also takes the shop profile');

console.log('Subscription and Super Admin');
const db = await mysql.createConnection({ host: process.env.DB_HOST || '127.0.0.1', user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', database: process.env.DB_NAME || 'jgasflow' });
await db.query('UPDATE tenants SET trial_ends_at = DATE_SUB(NOW(), INTERVAL 1 DAY) WHERE id = ?', [sign.shop.id]);
const expired = await call('POST', '/customers', T, { name: 'Late Customer' });
ok(expired.status === 402 && expired.data.code === 'SUBSCRIPTION_EXPIRED', 'expired plan blocks new records (402)');
ok((await call('GET', '/customers', T)).status === 200, 'expired plan can still view');
ok((await call('GET', '/sync/export', T)).status === 200, 'expired plan can still export');
ok((await call('POST', '/sync/push', T, { changes: {} })).status === 402, 'expired plan blocks phone uploads');
const req = await must('POST', '/billing/requests', T, { plan: 'basic', months: 3, method: 'jazzcash', txn_ref: 'TX12345678' });
ok(req.amount === 4500, 'payment request for Basic 3 months is Rs 4500');

const creds = readFileSync('storage/super-admin.txt', 'utf8');
const A = (
  await must('POST', '/auth/login', null, {
    login: creds.match(/Login: (.+)/)[1].trim(),
    password: creds.match(/Password: (.+)/)[1].trim(),
  })
).token;
ok((await call('GET', '/admin/overview', T)).status === 403, 'shop owner cannot open Super Admin');
const reqs = await must('GET', '/admin/requests', A);
const mine = reqs.find((r) => r.id === req.id);
ok(!!mine, 'Super Admin sees the pending payment');
await must('POST', `/admin/requests/${req.id}/approve`, A, { note: 'received' });
const me = await must('GET', '/auth/me', T);
ok(me.subscription.plan === 'basic' && me.subscription.status === 'active' && me.subscription.days_left >= 89, 'approval activates Basic for 3 months');
ok((await call('POST', '/customers', T, { name: 'Paid Customer' })).status === 201, 'writes work again after renewal');
await must('POST', `/admin/shops/${sign.shop.id}/status`, A, { status: 'suspended', note: 'test' });
ok((await call('GET', '/customers', T)).status === 403, 'suspended shop is locked');
await must('POST', `/admin/shops/${sign.shop.id}/status`, A, { status: 'active', note: '' });
const ov = await must('GET', '/admin/overview', A);
ok(ov.shops >= 2 && ov.revenue_total >= 4500, 'Super Admin overview counts shops and revenue');

await db.end();
console.log(`\nAll ${passed} checks passed.`);
