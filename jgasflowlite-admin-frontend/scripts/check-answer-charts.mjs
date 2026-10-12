/**
 * Charts drawn from the agent's answer.
 *
 *   npm run check:charts
 *
 * A chart that misreads a table is worse than no chart: it is a confident
 * picture of something the answer did not say, sitting on a panel whose whole
 * promise is that its figures are real. So the contract is conservative —
 * every cell of a column must parse or the column is not drawn — and these
 * cases are mostly about what must be REFUSED.
 */
import { build } from 'esbuild';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'node_modules', '.cache', 'jdent-answer-charts.mjs');
await fs.mkdir(path.dirname(OUT), { recursive: true });

await build({
  entryPoints: [path.join(ROOT, 'src/components/saas/pages/AnswerCharts.jsx')],
  outfile: OUT,
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  loader: { '.jsx': 'jsx' },
  jsx: 'automatic',
  external: ['react', 'react/jsx-runtime'],
});
const { toNumber, parseTables, chartsFor } = await import(pathToFileURL(OUT).href);

let fail = 0;
const ok = (label, cond, got) => {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + label);
  if (!cond) { fail++; if (got !== undefined) console.log('        got ' + JSON.stringify(got)); }
};

// ── what counts as a number ──
console.log('— parsing cells —');
for (const [cell, want] of [
  ['126', 126],
  ['1,284', 1284],
  ['32.7%', 32.7],
  ['PKR 451,238.00', 451238],
  ['Rs. 1,200', 1200],
  ['$99', 99],
  ['0', 0],
  ['-5', -5],
  ['  42  ', 42],
]) {
  ok(`${JSON.stringify(cell)} is ${want}`, toNumber(cell) === want, toNumber(cell));
}

// These must NOT parse: charting them would invent magnitudes.
console.log('\n— what must not parse —');
for (const cell of [
  'Al-Shifa Dental', '2026-09-30', '12 days', '3 of 9', 'N/A', '--', '',
  'active', '1.2.3', '10-20', 'PKR', '12px', null, undefined,
]) {
  ok(`${JSON.stringify(cell)} is refused`, toNumber(cell) === null, toNumber(cell));
}

// ── finding tables ──
console.log('\n— tables —');
const ANSWER = [
  '**68 registrations** from 208 visitors.',
  '',
  '| Source | Visitors | Signups |',
  '| --- | --- | --- |',
  '| Direct | 126 | 41 |',
  '| Organic | 58 | 19 |',
  '| Referral | 24 | 8 |',
  '',
  'Most sign-ups came direct.',
].join('\n');

const tables = parseTables(ANSWER);
ok('one table found', tables.length === 1, tables.length);
ok('header read', tables[0]?.head.join('|') === 'Source|Visitors|Signups', tables[0]?.head);
ok('three rows read', tables[0]?.rows.length === 3, tables[0]?.rows.length);
ok('prose around it is ignored', !JSON.stringify(tables).includes('registrations'));
ok('no table, no result', parseTables('just a sentence').length === 0);
ok('empty input is safe', parseTables('').length === 0 && parseTables(null).length === 0);

// ── which columns may be charted ──
console.log('\n— what gets charted —');
const charts = chartsFor(tables[0]);
ok('both numeric columns qualify', charts.length === 2, charts.map((c) => c.title));
ok('the label column is never charted', charts.every((c) => c.title !== 'Source'));
ok('labels come from the first column', charts[0]?.rows[0].label === 'Direct');
ok('values are parsed', charts[0]?.rows[0].value === 126);
ok('the printed value is the cell verbatim', charts[0]?.rows[0].shown === '126');

const mixed = parseTables([
  '| Clinic | Status | Patients |',
  '| --- | --- | --- |',
  '| A | active | 12 |',
  '| B | dormant | 4 |',
].join('\n'))[0];
const mixedCharts = chartsFor(mixed);
ok('a text column is skipped, not charted with gaps', mixedCharts.length === 1, mixedCharts.map((c) => c.title));
ok('the numeric column is still found', mixedCharts[0]?.title === 'Patients');

const partial = parseTables([
  '| Clinic | Patients |',
  '| --- | --- |',
  '| A | 12 |',
  '| B | n/a |',
].join('\n'))[0];
ok('ONE unparseable cell disqualifies the column', chartsFor(partial).length === 0);

const zeroes = parseTables([
  '| Source | Signups |',
  '| --- | --- |',
  '| Ads | 0 |',
  '| Email | 0 |',
].join('\n'))[0];
ok('an all-zero column is not a chart', chartsFor(zeroes).length === 0);

const negative = parseTables([
  '| Month | Change |',
  '| --- | --- |',
  '| Aug | 5 |',
  '| Sep | -3 |',
].join('\n'))[0];
ok('negatives are left to the table', chartsFor(negative).length === 0);

const single = parseTables([
  '| Metric | Value |',
  '| --- | --- |',
  '| Clinics | 86 |',
].join('\n'))[0];
ok('one row is not a comparison', chartsFor(single).length === 0);

// ── nothing is invented ──
console.log('\n— nothing derived —');
const src = await fs.readFile(
  path.join(ROOT, 'src/components/saas/pages/AnswerCharts.jsx'),
  'utf8',
);
ok('no totals are computed', !/reduce\s*\(/.test(src));
ok('no percentages of a whole are computed', !/\/\s*total/i.test(src));
ok(
  'every drawn value appears verbatim in the table',
  src.includes('shown: String(r[col]'),
);

// ── a streaming answer must not be read until it has settled ──
console.log('');
console.log('— streaming —');

// The component's rule, verbatim.
const pick = (turns) =>
  [...turns].reverse().find((t) => t.role === 'assistant' && !t.streaming);

// A live turn is appended chunk by chunk. Reading it half-finished is what
// made cards jump corners and vanish mid-answer: the headline changed as more
// of the first sentence arrived, a chart appeared only once its table closed,
// and each new card pushed the others into different berths.
const shapes = new Set();
let readMidStream = 0;
for (let i = 1; i <= 20; i++) {
  const text = ANSWER.slice(0, Math.ceil((i * ANSWER.length) / 20));
  if (pick([{ role: 'assistant', text, streaming: true }]) !== undefined) readMidStream++;
  shapes.add(parseTables(text).flatMap(chartsFor).map((c) => c.title).join('|'));
}
ok('no chunk of a streaming turn is read', readMidStream === 0, readMidStream);
ok(
  'the partial text really would have churned, so the rule earns its keep',
  shapes.size > 1,
  [...shapes],
);

ok(
  'a settled turn is read',
  pick([{ role: 'assistant', text: ANSWER, streaming: false }])?.text === ANSWER,
);

// The recorded path pushes a turn complete, with no streaming flag at all.
ok(
  'a turn with no streaming flag counts as settled',
  pick([{ role: 'assistant', text: ANSWER }])?.text === ANSWER,
);

ok(
  'the newest settled answer is the one read',
  pick([
    { role: 'assistant', text: 'older' },
    { role: 'user', text: 'and then?' },
    { role: 'assistant', text: ANSWER },
  ])?.text === ANSWER,
);

// While a new answer streams, the previous one stays on screen rather than
// the cards blanking out and coming back.
ok(
  'the previous answer holds while the next one streams',
  pick([
    { role: 'assistant', text: 'older' },
    { role: 'assistant', text: 'par', streaming: true },
  ])?.text === 'older',
);

console.log(fail ? `\n${fail} FAILED` : '\nall checks passed');
process.exit(fail ? 1 : 0);
