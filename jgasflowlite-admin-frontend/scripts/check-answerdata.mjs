/**
 * What the overlay is allowed to take out of an answer.
 *
 * Run offline, against the real module. The rules it enforces are the ones
 * that make the difference between a readout and a fabrication: every figure
 * shown must appear verbatim in the answer, nothing is derived, no sentence
 * ever becomes a card, and the order the cards appear in is the order the
 * answer says them - which is what the voice is matched against.
 */
import { build } from 'esbuild';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath, pathToFileURL } from 'url';

// It pulls in the chart parser, which lives in a .jsx file that imports React,
// so it is bundled before it can be imported from node.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'node_modules', '.cache', 'jdent-answer-data.mjs');
await fs.mkdir(path.dirname(OUT), { recursive: true });
await build({
  entryPoints: [path.join(ROOT, 'src/components/saas/pages/AnswerData.js')],
  outfile: OUT,
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  loader: { '.jsx': 'jsx' },
  jsx: 'automatic',
  external: ['react', 'react/jsx-runtime'],
});
const { cardsFor, statsFor, gridsFor, norm, assignBerths, MAX_CARDS } = await import(pathToFileURL(OUT).href);

let pass = 0;
const fails = [];
const ok = (what, cond) => {
  if (cond) {
    pass++;
    console.log('PASS  ' + what);
  } else {
    fails.push(what);
    console.log('FAIL  ' + what);
  }
};

console.log('— stats are verbatim —');

const A = [
  'Here is what I found.',
  '',
  '**Clinics over quota:** 7',
  '- Storage used: 418 MB',
  '- Status: active',
  '- Owner: Dental Care',
  '',
  '| Clinic | Storage MB |',
  '| --- | --- |',
  '| Dental Care | 418 |',
  '| Smile Hub | 96 |',
  '',
  'That is the picture.',
].join('\n');

const sa = statsFor(A);
ok('a labelled figure is a stat', sa.some((s) => s.label === 'Clinics over quota' && s.shown === '7'));
ok('a bulleted figure is a stat', sa.some((s) => s.label === 'Storage used' && s.shown === '418 MB'));
ok('a non-numeric value is not a stat', !sa.some((s) => s.label === 'Status'));
ok('a name is not a stat', !sa.some((s) => s.label === 'Owner'));
ok('every stat value appears in the answer', sa.every((s) => A.includes(s.shown)));
// A unit is read only for a known unit. Everything else that merely STARTS
// with a number is not a figure: these are the cases the allowlist exists for.
ok(
  'a storage figure keeps its unit verbatim',
  statsFor('- Used: 1.5 GB').map((s) => s.shown)[0] === '1.5 GB',
);
for (const [what, line] of [
  ['a duration', '- Last seen: 4 months'],
  ['a street address', '- Clinic: 3rd Street Dental'],
  ['a version', '- Schema: 2.1 beta'],
]) {
  ok(what + ' is not a stat', statsFor(line).length === 0);
}
ok('a percentage is a stat', statsFor('- Quota used: 92%').length === 1);
ok('a thousands separator survives', statsFor('- Patients: 12,480').map((s) => s.shown)[0] === '12,480');

ok('a stat carries a position', sa.every((s) => typeof s.at === 'number' && s.at >= 0));

// A table row is "Dental Care | 418", which reads exactly like a stat line if
// the tables are not stripped first.
ok('table rows are not mined for stats', !sa.some((s) => norm(s.label) === 'dental care'));

console.log('');
console.log('— no prose becomes a card —');

const PROSE = 'Yes, three clinics went dormant last month and I would look at Smile Hub first.';
ok('a plain sentence yields nothing', cardsFor(PROSE, []).length === 0);
ok('a sentence with a number in it yields nothing', statsFor(PROSE).length === 0);
ok(
  'no card ever carries a sentence',
  cardsFor(A, ['list_companies']).every((c) => !('line' in c) && !('text' in c)),
);

console.log('');
console.log('— nothing is derived —');

const cards = cardsFor(A, ['list_companies']);
const shownNumbers = cards
  .filter((c) => c.kind === 'stat')
  .map((c) => c.stat.shown)
  .concat(cards.filter((c) => c.kind === 'chart').flatMap((c) => c.chart.rows.map((r) => r.shown)));
ok('every figure on a card is in the answer', shownNumbers.every((n) => A.includes(n)));
ok('there is no total card', !cards.some((c) => /total|sum|average|mean/i.test(c.label)));
// 418 + 96 = 514: if a total ever appears, this is how it shows up.
ok('a computed total is never shown', !shownNumbers.includes('514'));

console.log('');
console.log('— tables —');

const TEXTONLY = [
  'The dormant ones:',
  '',
  '| Clinic | Status | Last seen |',
  '| --- | --- | --- |',
  '| Smile Hub | dormant | 4 months |',
  '| City Dental | dormant | 7 months |',
].join('\n');
const g = gridsFor(TEXTONLY);
ok('a table with nothing to plot becomes a grid', g.length === 1);
ok('the grid keeps the answer’s own cells', g[0].rows[0].includes('Smile Hub'));
ok('a chartable table does NOT also become a grid', gridsFor(A).length === 0);
ok('a grid is capped at five rows', gridsFor(
  ['| A | B |', '| --- | --- |', ...Array.from({ length: 12 }, (_, i) => `| r${i} | x |`)].join('\n'),
)[0].rows.length === 5);

console.log('');
console.log('— linked data sits together —');

const LINKED = [
  '**Storage MB:** 418',
  '',
  '| Clinic | Storage MB |',
  '| --- | --- |',
  '| Dental Care | 418 |',
  '| Smile Hub | 96 |',
].join('\n');
const lc = cardsFor(LINKED, []);
const statIdx = lc.findIndex((c) => c.kind === 'stat');
const chartIdx = lc.findIndex((c) => c.kind === 'chart');
ok('the stat and its chart are both present', statIdx >= 0 && chartIdx >= 0);
ok('they are adjacent', Math.abs(statIdx - chartIdx) === 1);
ok('the link is recorded', lc[chartIdx].linkedTo === lc[statIdx].id);
// A wire between two berths on OPPOSITE sides would cross the orb, so the
// layout, not the drawing, is what has to keep a pair together.
const berths = assignBerths(lc);
ok(
  'a linked pair shares a side',
  berths.get(lc[statIdx].id)[0] === berths.get(lc[chartIdx].id)[0],
);
ok(
  'a linked card sits directly under its mate',
  berths.get(lc[statIdx].id).endsWith('t') && berths.get(lc[chartIdx].id).endsWith('b'),
);
// Two unrelated findings in one corner leaves half the screen empty.
const two = assignBerths([{ id: 'a' }, { id: 'b' }]);
ok('unlinked cards alternate sides', two.get('a')[0] !== two.get('b')[0]);
const four = assignBerths([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]);
ok('four cards fill all four berths', new Set(four.values()).size === 4);
ok(
  'a fifth card is dropped, not stacked',
  assignBerths([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }]).size === 4,
);
// Two stacked cards both reading "STORAGE MB" is what linking produces if
// the chart keeps the title that matched.
ok(
  'a linked chart is titled by its dimension, not the matched label',
  lc[chartIdx].label === 'BY CLINIC',
);
ok(
  'an unrelated chart keeps its own title',
  cardsFor(['| Clinic | Storage MB |','| --- | --- |','| A | 10 |','| B | 20 |'].join('\n'), [])
    .find((c) => c.kind === 'chart').label === 'STORAGE MB',
);

ok(
  'an unrelated chart is not claimed as linked',
  cardsFor(['**Clinics:** 4', '', '| Clinic | Storage MB |', '| --- | --- |', '| A | 10 |', '| B | 20 |'].join('\n'), [])
    .filter((c) => c.kind === 'chart')
    .every((c) => !c.linkedTo),
);

console.log('');
console.log('— the voice is what they are timed against —');

const ordered = cardsFor(A, ['list_companies']);
ok(
  'cards are ordered by where they are said',
  ordered.every((c, i) => i === 0 || ordered[i - 1].anchor <= c.anchor),
);
ok('every card has an anchor in range', ordered.every((c) => c.anchor >= 0 && c.anchor <= 1));
ok('the source card is last', ordered[ordered.length - 1].kind === 'src');
ok('the source card is anchored at the end', ordered[ordered.length - 1].anchor === 1);
ok(`no more than ${MAX_CARDS} cards`, ordered.length <= MAX_CARDS);

const MANY = Array.from({ length: 9 }, (_, i) => `- Metric ${i}: ${i + 1}`).join('\n');
ok('a long answer is still capped', cardsFor(MANY, ['x']).length === MAX_CARDS);
ok('the earliest data survives the cap', cardsFor(MANY, ['x'])[0].label === 'METRIC 0');

console.log('');
console.log('— it does not throw —');
for (const [what, input] of [
  ['empty', ''],
  ['null', null],
  ['undefined', undefined],
  ['only a table header', '| A | B |\n| --- | --- |'],
  ['a broken table', '| A | B |\n| --- |'],
  ['an unterminated bold', '**Clinics: 4'],
  ['urdu', 'مریض: 12'],
]) {
  let threw = null;
  try {
    cardsFor(input, []);
    statsFor(input);
    gridsFor(input);
  } catch (e) {
    threw = e.message;
  }
  ok(`${what} is survivable`, threw === null);
}
ok('urdu labels are read', statsFor('مریض: 12').length === 1);

console.log('');
if (fails.length) {
  console.log(`${fails.length} FAILED`);
  process.exit(1);
}
console.log(`all ${pass} checks passed`);
