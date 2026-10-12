/**
 * Voice mode: it cannot hang, it says what it is doing, and it reads on a
 * light surface.
 *
 *   npm run check:voice-surface
 *
 * Offline. Three things this guards, each of which looked fine in review:
 *
 * 1. THERE WAS NO TIMEOUT ANYWHERE on the ask path. One question can run
 *    several tool calls with a model round trip between each, and a dead
 *    socket was indistinguishable from a slow answer: the screen said
 *    "Looking it up" and stayed there, with no way out but reloading.
 * 2. The label never changed while it worked, so every long answer read as
 *    a crash.
 * 3. The surface was built for near-black - white text, white hairlines,
 *    panels made of white at 3% opacity. On a light background each of
 *    those is invisible, and invisible is not something a build catches.
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFile(path.join(ROOT, p), 'utf8');

let pass = 0;
const fails = [];
const ok = (what, cond) => {
  if (cond) { pass++; console.log('PASS  ' + what); }
  else { fails.push(what); console.log('FAIL  ' + what); }
};

const vc = await read('src/components/saas/pages/VoiceConversation.jsx');
const css = await read('src/index.css');
const sources = await read('src/components/saas/pages/data/agentSources.js');
const agents = await read('src/components/saas/pages/data/mockAgents.js');
const overlay = await read('src/components/saas/pages/AnswerOverlay.jsx');
const overview = await read('src/components/saas/pages/SystemOverview.jsx');
const network = await read('src/components/saas/pages/AgentNetwork.jsx');
const feed = await read('src/components/saas/pages/ActivityFeed.jsx');

console.log('— waiting always ends —');
ok('there is a hard limit', /const WAIT_LIMIT_MS = \d+;/.test(vc));
ok('and a lower one for reassuring', /const WAIT_SLOW_MS = \d+;/.test(vc));
// Reassure long before giving up, or the only feedback is the failure.
const slow = Number(vc.match(/WAIT_SLOW_MS = (\d+)/)?.[1] ?? 0);
const limit = Number(vc.match(/WAIT_LIMIT_MS = (\d+)/)?.[1] ?? 0);
ok(`it speaks up (${slow / 1000}s) long before it gives up (${limit / 1000}s)`, slow > 0 && slow * 4 <= limit);
ok('the watchdog recovers to a usable state', /setPhaseBoth\("error"\)/.test(vc) && vc.includes('That took too long'));
/*
 * Keyed on the phase so it starts and stops itself. Leaving `thinking` for
 * ANY reason - an answer, an error, a close, a persona switch - clears it,
 * and no call site has to remember to.
 */
ok('the timer is tied to the phase, not to a call site', /\}, \[phase\]\);/.test(vc));
ok('it clears itself when work ends', /clearInterval\(waitTimerRef\.current\)/.test(vc));
// Firing the watchdog on a surface that is already closing would show an
// error over a screen on its way out.
ok('a closing screen is left alone', /if \(closingRef\.current\) return;[\s\S]{0,120}setError\("That took too long/.test(vc));

console.log('');
console.log('— waiting says what it is doing —');
ok('tool keys are turned into words', vc.includes('const TOOL_WORK = {'));
// A raw key is a column name, not an answer.
ok('no raw tool key reaches the screen', vc.includes('TOOL_WORK[toolNow]'));
ok('the running tool is named', vc.includes('clinic_activity: "Checking how much they use it"'));
ok('a long wait is acknowledged', vc.includes('Still working on it'));
ok('the clock only appears once the wait is worth doubting', /thinking && slow &&/.test(vc));
ok('and it does not jitter', vc.includes('tabular-nums'));

console.log('');
console.log('— the light surface —');
ok('the root is marked light', vc.includes('vc-light'));
ok('the base layer is a token, not a hex', vc.includes('vc-surface') && !vc.includes('bg-[#01040e]'));
// A near-black vignette on a light screen reads as a smudge.
ok('the vignette falls away to light', vc.includes('rgba(248,250,252,0.92)'));
for (const [what, re] of [
  ['white text becomes ink', /\.vc-light \[class\*="text-white"\]/],
  ['white hairlines become visible', /\.vc-light \[class\*="border-white"\]/],
  ['white panels become a shade', /\.vc-light \[class\*="bg-white\/"\]/],
]) ok(what, re.test(css));

/*
 * THE GREY RAMP RUNS THE OTHER WAY ON LIGHT, and getting this wrong is
 * silent: on black, gray-100 is the BRIGHTEST thing on the page, so leaving
 * it alone makes the conversation text the faintest thing on a white panel
 * while the labels that should recede come forward. The opener text was
 * genuinely unreadable until every step was mapped.
 */
for (const step of [100, 200, 300, 400, 500, 600]) {
  ok(`gray-${step} is remapped for light`, new RegExp(`\.vc-light \.text-gray-${step} \{`).test(css));
}
// Only the steps this surface uses. The darker ones belong to the ordinary
// admin pages, which are not inside `.vc-light` and must not be touched.
ok('the darker steps are left alone', !/\.vc-light \.text-gray-[789]00/.test(css));

/*
 * Two panels were arbitrary dark hex values rather than a white-at-low-
 * opacity utility, so no override could reach them: the brain portrait's
 * frame rendered as a grey slab on the light screen, and the answer cards
 * would have rendered black.
 */
ok('no dark hex panel survives', !/bg-\[#0[0-9a-f]{5}\]/.test(vc) && !/bg-\[#0[0-9a-f]{5}\]/.test(overlay));
ok('the portrait frame is a light panel', vc.includes('vc-panel'));
ok('and the answer cards are too', overlay.includes('vc-panel-solid'));

/*
 * Colour that is drawn as TEXT needs the dark hue, not the accent. The
 * billing figure shipped as pale yellow on white and could not be read.
 */
ok('every agent carries a dark ink', (agents.match(/^    ink: "/gm) ?? []).length === 5);
ok('the overview figures use it', overview.includes('color: `rgb(${agent.ink})`'));
ok('so do the agent node glyphs', network.includes('color: `rgb(${ink})`'));
// The nodes were a near-black disc, which read as a dead grey button for
// every agent that was not selected.
ok('an unselected node is light, not near-black', network.includes('rgba(255,255,255,0.92)'));
ok('and no near-black fill remains', !network.includes('rgba(4,10,22,0.85)'));
// Zara's glyph was missing from the feed's icon map, so her reports fell
// back to a generic sparkle and she was the one agent you could not
// recognise in the log.
ok('every agent icon is mapped in the feed', feed.includes('target: Target'));
// The accent steps are picked for a dark screen and fail contrast on light.
for (const a of ['teal', 'sky', 'amber', 'rose', 'violet']) {
  ok(`the ${a} accent is darkened for light`, new RegExp(`\\.vc-light \\.text-${a}-300`).test(css));
}
/*
 * The canvas paints its own colours and no stylesheet can reach them, so a
 * pastel rim chosen to glow out of black simply vanishes on white.
 */
ok('every persona has a dark ink for the canvas', (vc.match(/^    ink: "/gm) ?? []).length === 5);
ok('and the brain is drawn with it', vc.includes('rim={theme.ink}'));

console.log('');
console.log('— the growth-strategy agent —');
ok('she is on the roster', agents.includes('key: "strategy"'));
ok('seated where a fifth agent can go', agents.includes('seat: "topRight"'));
ok('she has a headline figure to show', sources.includes('async function strategy()'));
ok('and is wired into the loaders', /SOURCES = \{[^}]*strategy[^}]*\}/.test(sources));
/*
 * Intent beats subject. "How do we sell more subscriptions" contains
 * Bilal's noun but is Zara's question, so her pattern is checked FIRST.
 */
const stratAt = agents.indexOf('strategy:');
const accountsAt = agents.indexOf('accounts:');
ok('what-should-we-do routes to her before the nouns do',
  stratAt > 0 && (accountsAt < 0 || stratAt < accountsAt));
ok('her figures are opportunities, not a report',
  sources.includes('"Never activated"') && sources.includes('"Gone quiet"'));
// A figure that cannot be loaded must show a dash, never a plausible zero.
ok('a figure that cannot load stays null', sources.includes('conversion = null;'));
// Charts must use a kind the renderer actually has.
const chart = await read('src/components/saas/pages/LiveChart.jsx');
const kinds = [...chart.matchAll(/case "(\w+)":/g)].map((m) => m[1]);
const used = [...sources.matchAll(/kind: "(\w+)"/g)].map((m) => m[1]);
ok(`every chart kind used is one the renderer has (${[...new Set(used)].join(', ')})`,
  used.every((k) => kinds.includes(k)));

console.log('');
if (fails.length) { console.log(`${fails.length} FAILED`); process.exit(1); }
console.log(`all ${pass} checks passed`);
