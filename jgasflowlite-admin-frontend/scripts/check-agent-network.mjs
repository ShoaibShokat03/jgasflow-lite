/**
 * Four independent agents, and the figures they report.
 *
 *   npm run check:network
 *
 * The rule this screen now lives or dies by: the agents are INDEPENDENT.
 * They do not consult each other, delegate, or answer on one another's
 * behalf, and nothing on screen may suggest they do. The rest is about the
 * simulation being honest about being a simulation, and about one agent's
 * figures never being mixed with another's.
 */
import { build } from 'esbuild';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = (f) => path.join(ROOT, 'src/components/saas/pages', f);
const OUT = path.join(ROOT, 'node_modules', '.cache', 'jdent-agent-data.mjs');
await fs.mkdir(path.dirname(OUT), { recursive: true });

// One entry re-exporting the whole data layer, so these are the REAL modules
// under test rather than a copy of their rules.
const entry = path.join(ROOT, 'node_modules', '.cache', '_agent-data-entry.js');
const q = (f) => JSON.stringify(P(f).replace(/\\/g, '/'));
await fs.writeFile(
  entry,
  `export * from ${q('data/mockAgents.js')};
export * from ${q('data/agentSources.js')};
export * from ${q('data/mockActivity.js')};`,
  'utf8',
);
await build({
  entryPoints: [entry],
  outfile: OUT,
  bundle: true,
  format: 'esm',
  platform: 'node',
  plugins: [
    {
      // The API client pulls in axios and its node adapter. None of it is
      // called here - these checks are about the SHAPE of each loader and
      // the formatting rules, not about the network.
      name: 'stub-api',
      setup(b) {
        b.onResolve({ filter: /saasApi$/ }, (a) => ({ path: a.path, namespace: 'stub' }));
        b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
          contents: [
            'const no = async () => { throw new Error("network in a data check"); };',
            'const api = new Proxy({}, { get: () => no });',
            'export const analyticsApi = api;',
            'export const saasCompaniesApi = api;',
            'export const saasSubscriptionsApi = api;',
            'export const saasInvoicesApi = api;',
            'export default api;',
          ].join(String.fromCharCode(10)),
          loader: 'js',
        }));
      },
    },
  ],
});
const D = await import(pathToFileURL(OUT).href);

const read = (f) => fs.readFile(P(f), 'utf8');
const screen = await read('VoiceConversation.jsx');
const network = await read('AgentNetwork.jsx');
const feed = await read('ActivityFeed.jsx');
const dash = await read('AgentDashboard.jsx');
const overview = await read('SystemOverview.jsx');
const chart = await read('LiveChart.jsx');
const tile = await read('MetricCard.jsx');
const hook = await read('useLiveMetrics.js');
const sources = await read('data/agentSources.js');

let pass = 0;
const fails = [];
const ok = (what, cond) => {
  if (cond) { pass++; console.log('PASS  ' + what); }
  else { fails.push(what); console.log('FAIL  ' + what); }
};
/** Source with comments stripped, so prose about a rule cannot satisfy it. */
const code = (src) => src.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

console.log('— the agents are independent —');
const KEYS = D.AGENTS.map((a) => a.key);
/*
 * The roster grew to five when a growth-strategy agent was added. The count
 * is asserted as a floor plus uniqueness rather than an exact number, so
 * adding a colleague is a roster change and not a test change - but a
 * DUPLICATE key still fails, which is the mistake that actually happens.
 */
ok('every agent has a distinct key', new Set(KEYS).size === KEYS.length);
ok('they use the backend persona keys',
  ['chief', 'ops', 'accounts', 'growth', 'strategy'].every((k) => KEYS.includes(k)));
// The one who is asked what to DO, rather than what happened.
ok('there is a growth-strategy agent', KEYS.includes('strategy'));
ok('no agent knows about another', D.AGENTS.every((a) => !('talksTo' in a) && !('colleagues' in a)));
// An entry with two agents on it IS the agent-to-agent traffic this screen is
// specifically not about.
ok('an activity entry names one agent, never two', !code(feed).includes('e.to') && !code(feed).includes('e.from'));
for (const [what, src] of [['the network', network], ['the dashboard', dash], ['the feed', feed]]) {
  ok(`${what} draws no agent-to-agent link`, !/linkedTo|consult/i.test(code(src)));
}
ok('the removed consult tool is gone from the screen', !screen.includes('ask_colleague') && !screen.includes('AgentLinks'));

console.log('');
console.log('— every line runs to the core —');
ok('there is a seat at each compass point', ['top', 'bottom', 'left', 'right'].every((s) => D.AGENTS.some((a) => a.seat === s)));
/*
 * A seat is a DIRECTION now, not a compass word with a vertical/horizontal
 * flag. The flag could not express a diagonal, so a fifth agent could not be
 * seated without a special case in every piece of geometry.
 */
ok('seats are direction vectors', /const at = \(dx, dy\) =>/.test(network));
ok('every agent has a seat that exists', D.AGENTS.every((a) => network.includes(`${a.seat}: at(`)));
// Diagonals are normalised, or a corner node sits further out than the four
// on the compass points.
ok('diagonal seats are normalised', network.includes('at(0.707, -0.707)'));
// 50 is the centre of the network's own coordinate space, so a stream that
// starts anywhere else is not coming from the core.
ok('each stream starts at the core',
  network.includes('const x1 = 50 + seat.dx * 26;') && network.includes('const y1 = 50 + seat.dy * 26;'));
ok('and stops short of its node',
  network.includes('const x2 = 50 + seat.dx * 44;') && network.includes('const y2 = 50 + seat.dy * 44;'));
// Both axes animate, or a diagonal stream travels along one axis only and
// visibly leaves its own line.
ok('particles travel inward along the line',
  network.includes('values={`${x2};${x1}`}') && network.includes('values={`${y2};${y1}`}'));
ok('a quiet stream carries none', network.includes('{live && ('));
// The dial is an instrument face; four labels across it turned it into a
// diagram, which is what the nodes were moved off it for.
ok('nothing is drawn on the dial', !network.includes('viewBox="0 0 400 400"'));

console.log('');
console.log('— the figures are real —');
ok('nothing claims to be simulated', D.SIMULATED === false);
ok('the badge is gone from the dashboard', !dash.includes('SIMULATED'));
ok('and from the overview', !overview.includes('SIMULATED'));
ok('there is no generator left', !sources.includes('Math.random'));
ok('every agent has a real source', ['chief', 'ops', 'accounts', 'growth'].every((k) => typeof D.SOURCES[k] === 'function'));
// A figure that could not be read must show a dash, never a plausible
// stand-in: zero is a claim, null is "not available".
ok('a missing figure is a dash, not a zero', D.FORMATS.count(null) === '—' && D.FORMATS.money(null) === '—');
ok('a real figure still formats', D.FORMATS.count(12842) === '12,842');
ok('counts come from `total`, not from paging', sources.includes('limit: 1'));
// Sana's traffic failing must not affect Bilal's revenue.
ok('a failed source returns null rather than throwing', sources.includes('return null;'));
ok('one agent failing does not stop the others', hook.includes("setStates((s) => ({ ...s, [key]: \"error\" }))"));

console.log('');
console.log('— the feed reports what moved —');
// Written from the figure that actually changed, so the feed and the
// dashboard can never disagree.
const row = [
  { key: 'active', label: 'Active subscriptions', value: 1284, format: 'count', trend: 12 },
  { key: 'paid', label: 'Invoices paid', value: 400, format: 'count', trend: 1 },
];
const report = D.activityFor('accounts', row, ['active', 'paid']);
ok('an entry gets written', !!report);
ok('it names one agent', report.agent === 'accounts' && !('to' in report));
ok('it reports the biggest mover', report.detail.includes('Active subscriptions'));
ok('it carries a timestamp', typeof report.at === 'number' && report.at > 0);
ok('an unchanged agent reports nothing', D.activityFor('accounts', row, []) === null);
let list = [];
for (let i = 0; i < 60; i++) list = D.pushActivity(list, { id: `x${i}` });
ok('the feed is a window, not an archive', list.length === D.MAX_ACTIVITY);
ok('and keeps the newest', list[0].id === 'x59');
// Only a real change is news: a reload returning the same figures is not.
ok('an unchanged reload writes nothing', hook.includes('if (moved.length) {'));

console.log('');
console.log('— the screen reacts —');
ok('picking an agent is state', screen.includes('const [selectedAgent, setSelectedAgent] = useState(null)'));
ok('a dashboard replaces the core', screen.includes('{selectedAgent && ('));
ok('and the core comes back when cleared', screen.includes('onClose={() => setSelectedAgent(null)}'));
ok('asking about a domain opens it', screen.includes('agentForQuestion(lastAsked)'));
ok('the log carries the reports until there is a conversation', screen.includes('<ActivityFeed'));
// Guessing and opening the wrong dashboard is worse than opening none.
ok('an unmatched question opens nothing', D.agentForQuestion('what is the weather') === null);
for (const [question, want] of [
  ["show me today's traffic", 'growth'],
  ['which invoices are overdue', 'accounts'],
  ['how many appointments today', 'ops'],
  ['give me the executive summary', 'chief'],
]) {
  ok(`"${question}" opens ${want}`, D.agentForQuestion(question) === want);
}

console.log('');
console.log('— it does not waste the machine —');
// setInterval keeps firing in a background tab long after rAF is throttled.
ok('it does not poll a hidden tab', hook.includes('if (document.hidden) return;'));
ok('nor a closed screen', hook.includes('if (!running) return undefined;'));
ok('four count queries do not land together', hook.includes('STAGGER_MS'));
ok('its timers are cleared', hook.includes('clearInterval(id)'));
// rAF does not run in a hidden tab, so a value that changed there would be
// stuck mid-travel on return.
ok('a rolling number recovers from a hidden tab', tile.includes('visibilitychange'));
ok('no chart library was added', !chart.includes('recharts') && !chart.includes("from 'd3"));

/*
 * The bar chart drew nothing but day names.
 *
 * `items-end` on the row stopped its columns stretching, so each one
 * collapsed to the height of its own label - measured at 16px - and every
 * bar's slot resolved to zero height. The bars are already anchored to the
 * baseline inside their own column, so the row must stretch them.
 */
ok('bar columns stretch to full height', chart.includes('h-full flex items-stretch gap-1'));
ok('and each column fills it', chart.includes('className="h-full flex-1 flex flex-col items-center'));
ok('a bar is never invisible', chart.includes('Math.max((v / max) * 100, 3)'));

console.log('');
if (fails.length) { console.log(`${fails.length} FAILED`); process.exit(1); }
console.log(`all ${pass} checks passed`);
