/**
 * The subscription badge actually renders, in every state.
 *
 *   npm run check:badge
 *
 * Reading the source proves the strings are present; rendering proves the
 * component does not throw on the way to them. This project has shipped a
 * render-time crash before (see check:render) because esbuild does not
 * resolve identifiers and there is no working lint, so a file can compile
 * perfectly and fail the instant React calls it.
 *
 * It also pins the behaviour the source check cannot see: WHICH label and
 * WHICH colour each state produces. A chip that renders but calls an expired
 * subscription teal is worse than one that crashes - nobody investigates a
 * green badge.
 */
import { build } from 'esbuild';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath, pathToFileURL } from 'url';
import React from 'react';
import { renderToString } from 'react-dom/server';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'node_modules', '.cache', 'jdent-badge-check.mjs');
await fs.mkdir(path.dirname(OUT), { recursive: true });

await build({
  entryPoints: [path.join(ROOT, 'src/components/saas/pages/CompaniesPage.jsx')],
  outfile: OUT,
  bundle: true,
  format: 'esm',
  platform: 'node',
  jsx: 'automatic',
  // Resolve the ESM build of every dependency. The CJS one calls
  // require('react'), which an ESM bundle with react external cannot do.
  conditions: ['import', 'module'],
  mainFields: ['module', 'main'],
  external: ['react', 'react-dom', 'react-dom/server'],
  loader: { '.jsx': 'jsx', '.css': 'empty' },
  // Real packages resolve normally - a stub cannot satisfy named imports
  // like `Building2` without knowing them in advance. Only the app's own
  // browser-coupled modules are replaced, and the badge must not need them.
  plugins: [
    {
      name: 'stub-app-io',
      setup(b) {
        b.onResolve({ filter: /(api\/saasApi|config\/app|utils\/saasAuth)$/ }, (a) => ({
          path: a.path,
          namespace: 'stub',
        }));
        b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
          contents:
            'export const saasCompaniesApi = {};' +
            'export const saasPlansApi = {};' +
            'export const saasSubscriptionsApi = {};' +
            'export const saasInvoicesApi = {};' +
            'export const CLINIC_APP_URL = "";' +
            'export const assetUrl = (x) => x;' +
            'export const can = () => true;' +
            'export const getModules = () => [];' +
            'export const landingPath = () => "/";' +
            'export default {};',
          loader: 'js',
        }));
      },
    },
  ],
});

const M = await import(pathToFileURL(OUT).href);
const { SubscriptionBadge } = M;

let pass = 0;
const fails = [];
const ok = (what, cond) => {
  if (cond) { pass++; console.log('PASS  ' + what); }
  else { fails.push(what); console.log('FAIL  ' + what); }
};

const render = (subscription) =>
  renderToString(React.createElement(SubscriptionBadge, { subscription }));

/*
 * The text a person actually sees.
 *
 * Two things in the raw markup are not on screen and both produce false
 * readings: the `title` tooltip, which legitimately names the plan even when
 * the chip does not, and React's `<!-- -->` separators, which it writes
 * between adjacent text nodes - so a chip reading "3d" serialises as
 * "<!-- -->3<!-- -->d" and a naive includes() misses it.
 */
const visible = (html) =>
  html
    .replace(/<!--.*?-->/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const inDays = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString();
};

console.log('— it renders at all —');
ok('the badge is exported', typeof SubscriptionBadge === 'function');
let html = '';
try {
  html = render(null);
  ok('a clinic with no subscription renders', html.length > 0);
} catch (e) {
  ok('a clinic with no subscription renders: ' + e.message, false);
}

console.log('');
console.log('— each state says the right thing —');
const cases = [
  [null, 'No plan', 'border-dashed', 'never subscribed'],
  [{ plan_name: 'Monthly Standard', status: 'active', current_period_end: inDays(40) }, 'Monthly Standard', 'bg-teal-700', 'running'],
  [{ plan_name: 'Monthly Standard', status: 'active', current_period_end: inDays(3) }, 'Monthly Standard', 'bg-amber-600', 'nearly up'],
  [{ plan_name: 'Monthly Standard', status: 'expired', current_period_end: inDays(-5) }, 'Expired', 'bg-red-700', 'lapsed'],
  [{ plan_name: 'Monthly Standard', status: 'cancelled', current_period_end: inDays(-2) }, 'Cancelled', 'bg-red-700', 'cancelled'],
  [{ plan_name: 'Monthly Standard', status: 'past_due', current_period_end: inDays(-1) }, 'Past due', 'bg-red-700', 'past due'],
];
for (const [sub, label, tone, why] of cases) {
  let out = '';
  let threw = null;
  try { out = render(sub); } catch (e) { threw = e.message; }
  ok(`${why} renders`, threw === null);
  if (threw) continue;
  ok(`${why} reads "${label}"`, visible(out).includes(label));
  ok(`${why} is coloured ${tone.replace('bg-', '').replace('border-', '')}`, out.includes(tone));
}

console.log('');
console.log('— the edges —');
/*
 * An expired clinic's old plan name is not the useful fact; that it expired
 * is. A badge reading "Monthly Standard" on a dead subscription is the
 * failure this guards.
 */
const dead = render({ plan_name: 'Monthly Standard', status: 'expired', current_period_end: inDays(-5) });
ok('a dead plan does NOT show its plan name', !visible(dead).includes('Monthly Standard'));
// The tooltip still names it - that is context on hover, not the chip.
ok('though the tooltip still names it', dead.includes('Plan: Monthly Standard'));

// An active row with no end date must not be treated as expired - some
// subscriptions carry no period end.
const open = render({ plan_name: 'Custom', status: 'active', current_period_end: null });
ok('an active plan with no end date is still live', open.includes('bg-teal-700') && open.includes('Custom'));

// An active subscription whose period has already run out is NOT live, even
// though its status column says active - the nightly sweep may not have
// caught up with it yet.
const stale = render({ plan_name: 'Custom', status: 'active', current_period_end: inDays(-3) });
ok('an active row past its end date reads as expired', stale.includes('bg-red-700'));

// A plan row with no name must not render "undefined".
const noName = render({ plan_name: null, status: 'active', current_period_end: inDays(20) });
ok('a missing plan name does not print undefined', !noName.includes('undefined'));
ok('and falls back to something readable', noName.includes('Subscribed'));

// The day counter only appears when it is worth reading.
ok('the day count shows when it is nearly up', visible(render(cases[2][0])).includes('3d'));
ok('and not when it is months away', !/\d+d/.test(visible(render(cases[1][0]))));

console.log('');
if (fails.length) { console.log(`${fails.length} FAILED`); process.exit(1); }
console.log(`all ${pass} checks passed`);
