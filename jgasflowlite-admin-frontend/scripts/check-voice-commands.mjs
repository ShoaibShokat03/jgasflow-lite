/**
 * Switching agent by voice: what counts as a handover, and what must not.
 *
 *   npm run check:voice
 *
 * The dangerous failure here is SILENT: a real question that happens to
 * contain a colleague's name gets swallowed as a switch command, the user
 * hears a greeting instead of an answer, and nothing logs an error.
 */
import { build } from 'esbuild';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'node_modules', '.cache', 'jdent-voice-check.mjs');
await fs.mkdir(path.dirname(OUT), { recursive: true });

await build({
  entryPoints: [path.join(ROOT, 'src/components/saas/pages/VoiceConversation.jsx')],
  bundle: true, format: 'esm', platform: 'node',
  external: ['react', 'react-dom', 'lucide-react', 'axios'],
  outfile: OUT, loader: { '.jsx': 'jsx' }, jsx: 'automatic', logLevel: 'silent',
});

const { matchPersonaCommand, residualQuestion } = await import(pathToFileURL(OUT).href);

const PERSONAS = [
  { key: 'chief', name: 'Omar', role: 'Chief of Staff', greeting: 'hi' },
  { key: 'ops', name: 'Ayesha', role: 'Clinic Health', greeting: 'hi' },
  { key: 'accounts', name: 'Bilal', role: 'Subscriptions & Billing', greeting: 'hi' },
  { key: 'growth', name: 'Sana', role: 'Traffic & Signups', greeting: 'hi' },
];

let fail = 0;
const ok = (label, cond) => {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + label);
  if (!cond) fail++;
};
const key = (t) => matchPersonaCommand(t, PERSONAS)?.key ?? null;

console.log('— these SHOULD switch —');
ok('a bare name', key('Bilal') === 'accounts');
ok('a name with punctuation', key('Ayesha.') === 'ops');
ok('case is irrelevant', key('sana') === 'growth');
ok('"go to X"', key("let's go to Bilal") === 'accounts');
ok('"switch to X"', key('switch to Ayesha') === 'ops');
ok('"talk to X"', key('talk to Sana') === 'growth');
ok('"over to X"', key('over to Omar') === 'chief');
ok('"bring in X"', key('bring in Bilal') === 'accounts');
ok('by role instead of name', key('go to clinic health') === 'ops');

console.log('\n— these must NOT switch (a real question) —');
// Superseded: "ask Bilal ..." now DOES switch, and carries the question
// with it. A question that merely mentions someone still must not.
ok('a question that merely mentions someone',
  key('the report bilal sent last week covered all of that') === null);
ok('a longer question with a name', key('what did Ayesha say about the dormant clinics') === null);
ok('a name deep in a sentence', key('show me every clinic Sana signed up in September') === null);
ok('an ordinary question', key('which clinics are over quota') === null);
ok('empty', key('') === null);
ok('whitespace', key('   ') === null);
ok('a name that is not on the roster', key('Fatima') === null);
ok('a handover phrase with no name', key("let's go to the next one") === null);

console.log('');
console.log('- mis-transcribed names (what speech recognition actually does) -');
// Straight from a real transcript: Google wrote "switch to billal".
ok('"switch to billal" (double L)', key('WAP switch to billal') === 'accounts');
ok('"go to bilaal"', key('go to bilaal') === 'accounts');
ok('bare "billal"', key('billal') === 'accounts');
ok('"umar" for Omar', key('umar') === 'chief');
ok('"aisha" for Ayesha', key('go to aisha') === 'ops');
ok('"sanaa" for Sana', key('sanaa') === 'growth');
ok('"ayehsa" transposed', key('switch to ayehsa') === 'ops');

console.log('');
console.log('- fuzziness must not become a free-for-all -');
ok('an unrelated short word does not match', key('banana') === null);
ok('a different name entirely', key('go to fatima') === null);
ok('a real question still wins over a near-name',
  key('what did the billing report say about last month') === null);

console.log('');
console.log('- how people actually ask for someone -');
// The phrasings that failed in real use and prompted this rewrite.
ok('"i want to talk sana" (no "to" after talk)', key('i want to talk sana') === 'growth');
ok('"i want to talk to sana"', key('i want to talk to sana') === 'growth');
ok('"hello sana"', key('hello sana') === 'growth');
ok('"hi bilal"', key('hi bilal') === 'accounts');
ok('"hello sana how are you" is still addressed to her',
  key('hello sana how are you') === 'growth');
ok('"can i speak with ayesha"', key('can i speak with ayesha') === 'ops');
ok('"connect me to bilal"', key('connect me to bilal') === 'accounts');
ok('"put me through to omar"', key('put me through to omar') === 'chief');
ok('"i need omar"', key('i need omar') === 'chief');
ok('"get me bilal please"', key('get me bilal please') === 'accounts');
ok('"let me speak to sana"', key('let me speak to sana') === 'growth');

console.log('');
console.log('- a question about someone is still a question -');
ok('"how much did bilal collect"', key('how much did bilal collect') === null);
ok('"what did ayesha find"', key('what did ayesha find') === null);
ok('"show me sana numbers"', key('show me sana numbers') === null);
ok('a long sentence naming someone',
  key('i was looking at the report that bilal mentioned earlier today') === null);

console.log('');
console.log('- a question travelling with the handover -');
const P = PERSONAS.find((p) => p.key === 'accounts');
ok('"ask bilal what is overdue" switches', key('ask bilal what is overdue') === 'accounts');
ok('...and carries the question',
  (residualQuestion('ask bilal what is overdue', P) || '').includes('overdue'));
ok('a bare name carries no question',
  residualQuestion('bilal', P) === null);
ok('a plain handover carries no question',
  residualQuestion('switch to bilal', P) === null);

console.log('');
console.log('- the regexes are alive (a dead \\b matches nothing) -');
ok('GREETING actually fires', key('hello omar') === 'chief');
ok('ASKING actually fires', key('how many clinics did bilal bill') === null);
ok('collapse() actually collapses', key('billal') === 'accounts');

console.log('\n— edge cases —');
ok('null text does not throw', key(null) === null);
ok('an empty roster does not throw', matchPersonaCommand('Bilal', []) === null);
ok('a long handover phrase is refused', key('I would really like you to go to Bilal now please') === null);

console.log(fail ? `\n${fail} FAILED` : '\nall checks passed');
process.exit(fail ? 1 : 0);
