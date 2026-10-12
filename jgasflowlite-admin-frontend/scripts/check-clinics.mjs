/**
 * The clinics screen: its URL, and the subscription badge on each row.
 *
 *   npm run check:clinics
 *
 * Offline. Two unrelated-looking changes share one file because they share
 * one risk: both touch the thing that decides whether an admin can see this
 * screen at all.
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = path.resolve(ROOT, '../jdent-software-backend');

let pass = 0;
const fails = [];
const ok = (what, cond) => {
  if (cond) { pass++; console.log('PASS  ' + what); }
  else { fails.push(what); console.log('FAIL  ' + what); }
};

const read = (p) => fs.readFile(path.join(ROOT, p), 'utf8');
const readApi = (p) => fs.readFile(path.join(API, p), 'utf8');

const modules = await read('src/constants/saasModules.js');
const app = await read('src/App.jsx');
const page = await read('src/components/saas/pages/CompaniesPage.jsx');
const dash = await read('src/components/saas/pages/DashboardPage.jsx');
const catalog = await readApi('src/modules/saas/saas-admin/modules.catalog.ts');
const service = await readApi('src/modules/saas/saas-companies/saas-companies.service.ts');

console.log('— the screen moved to /clinics —');
ok('the catalog points at the new path', modules.includes('path: "/clinics"'));
ok('nothing in the UI still links to the old one',
  !/to="\/companies"|navigate\("\/companies"\)|path: "\/companies"/.test(modules + app + page + dash));
ok('the route is clinics', app.includes('["clinics", <CompaniesPage />, "companies"]'));
// A bookmark, an old email, a support note.
ok('the old URL still lands on it',
  app.includes('<Route path="companies" element={<Navigate to="/clinics" replace />} />'));
ok('the dashboard tile follows', dash.includes('to="/clinics"'));

console.log('');
console.log('— THE KEY DID NOT MOVE WITH IT —');
/*
 * The one that would be silent.
 *
 * The module key IS the permission: granted rows in `saas_admins.modules`
 * hold `companies.view`, `companies.edit`, and the backend enforces those
 * exact strings. `sanitizePermissions()` DROPS a key it does not recognise -
 * it does not throw - so renaming the key to match the URL would delete
 * every admin's access to this screen with nothing at all to show for it.
 */
ok('the frontend key is still companies', modules.includes('key: "companies",'));
ok('and there is no "clinics" key', !/key: "clinics"/.test(modules));
ok('the backend catalog still says companies', /key: 'companies'/.test(catalog));
// The route gate must name the permission, not the URL.
ok('the route is gated on the permission, not the path',
  app.includes('<CompaniesPage />, "companies"'));
ok('the page still calls the companies API', page.includes('saasCompaniesApi.list'));

console.log('');
console.log('— the badge says what the clinic is paying for —');
ok('the row renders it', page.includes('<SubscriptionBadge subscription={c.subscription} />'));
ok('the list carries it', service.includes('subscription: subs.get(Number(c.id)) ?? null,'));
ok('batched, so it does not grow with the page', service.includes('async subscriptionFor(ids: number[])'));
ok('in one query', (service.match(/subscriptionRepository\.find\(/g) ?? []).length >= 1);
/*
 * WHICH subscription. A clinic accumulates them - renewals, a trial it
 * started on, one an admin cancelled - so it has to be chosen, not assumed.
 */
ok('the active one wins', service.includes('s.status === SubscriptionStatus.ACTIVE'));
ok('ordered newest-first so "most recent" means something', service.includes("order: { created_at: 'DESC' }"));

// Four states, and the empty one is a state: never having subscribed is not
// the same as having lapsed, and a blank cell reads as a loading row.
ok('no subscription says so', page.includes('No plan'));
ok('expired says so', page.includes('"Expired"'));
ok('cancelled says so', page.includes('"Cancelled"'));
ok('past due says so', page.includes('"Past due"'));
// An expired clinic's old plan name is not the useful fact.
ok('a dead plan shows its state, not its name', page.includes('const label = live'));

console.log('');
console.log('— it is a different fact from the Status column —');
/*
 * The Status column is the CLINIC's status, which an admin sets by hand. A
 * clinic can sit Active there with an expired subscription, and that
 * combination is the one worth seeing from the list.
 */
ok('the clinic status dropdown is still its own thing', page.includes('statusM.mutate({ id: c.id, status:'));
ok('the badge reads the subscription, not the company', page.includes('const { plan_name, status, current_period_end } = subscription;'));

console.log('');
console.log('— the two screens agree about how many days are left —');
/*
 * The admin badge and the clinic portal's own expiry warning describe the
 * same subscription to two different people. An admin reading "2 days" while
 * the clinic is told "1 day" turns a renewal into an argument.
 */
const clinicHelper = await fs.readFile(
  path.resolve(ROOT, '../jdent-saas-frontend/src/utils/subscriptionExpiry.js'),
  'utf8',
);
ok('the clinic counts midnight to midnight', clinicHelper.includes('startOfDay(end).getTime()') || /startOfDay\(now\)[\s\S]{0,120}startOfDay\(end\)/.test(clinicHelper));
ok('so does the admin badge', /startOfDay\(end\)\.getTime\(\) - startOfDay\(now\)\.getTime\(\)/.test(page));
ok('both over the same divisor', page.includes('86_400_000') && clinicHelper.includes('86_400_000'));
// Same window the portal starts warning in.
ok('"soon" is the same seven days', page.includes('days <= 7'));

/*
 * The rule itself, not just that the code looks alike. Plain subtraction
 * calls a subscription ending tomorrow morning "0 days left" for most of
 * today, which is the bug this exists to prevent.
 */
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const daysUntil = (end, now) => Math.round((startOfDay(end).getTime() - startOfDay(now).getTime()) / 86_400_000);
const now = new Date('2026-10-04T18:30:00');
for (const [end, want, why] of [
  ['2026-10-05T06:00:00', 1, 'ending tomorrow morning is 1 day, not 0'],
  ['2026-10-04T23:00:00', 0, 'later today is 0'],
  ['2026-10-03T23:00:00', -1, 'yesterday is already negative'],
  ['2026-10-11T09:00:00', 7, 'a week out is 7'],
]) {
  ok(`${why}`, daysUntil(new Date(end), now) === want);
}
// What plain subtraction would have said, for contrast.
const naive = Math.floor((new Date('2026-10-05T06:00:00') - now) / 86_400_000);
ok('plain subtraction would have said 0', naive === 0);

console.log('');
if (fails.length) { console.log(`${fails.length} FAILED`); process.exit(1); }
console.log(`all ${pass} checks passed`);
