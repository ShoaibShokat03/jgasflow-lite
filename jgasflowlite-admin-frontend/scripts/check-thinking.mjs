/**
 * The chain that makes the screen look busy while the agent works.
 *
 *   npm run check:thinking
 *
 * WHY THIS IS A CHECK. The processing animation shipped and never once ran.
 * Nothing was broken: the traces were correct, the keyframes were correct,
 * the condition was correct. The phase they key off, `thinking`, was only
 * ever set on the recorded fallback path and by "Brief me", and the live
 * path — the default, and the one everybody uses — had no line of code that
 * could reach it. A feature that is wired to a signal nobody sends fails in
 * total silence, so the wiring is what gets asserted here, link by link:
 *
 *   bridge sends {type:'working'}  →  liveSession forwards it
 *     →  the overlay turns it into the thinking phase
 *       →  the trace and the firing mesh render on that phase
 *
 * Source-level on purpose. Driving the real transport would mean standing up
 * a WebSocket, an AudioContext and a microphone, and would still not prove
 * the link that actually broke, which is that one file never calls another.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const overlay = read('src/components/saas/pages/VoiceConversation.jsx');
const session = read('src/components/saas/pages/liveSession.js');
const bridge = fs.readFileSync(
  path.join(
    ROOT,
    '..',
    'jdent-software-backend',
    'src/modules/ai-agent/live/live-bridge.service.ts',
  ),
  'utf8',
);

let fail = 0;
const ok = (label, cond) => {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + label);
  if (!cond) fail++;
};

// ── link 1: the bridge announces both edges ──
console.log('— the bridge —');
ok(
  "announces work starting, with the tool names",
  /this\.send\(client, \{ type: 'working', tools: realWork \}\)/.test(bridge),
);
ok(
  'announces work finishing',
  /this\.send\(client, \{ type: 'working', tools: \[\] \}\)/.test(bridge),
);
ok(
  'the finish is sent after the responses go back, not inside the happy path',
  bridge.indexOf("toolResponse: { functionResponses: responses }") <
    bridge.lastIndexOf("type: 'working', tools: [] }"),
);
ok(
  'a handover is not announced as work',
  /!== SWITCH_TOOL && name !== CLOSE_TOOL/.test(bridge),
);

// ── link 2: the transport forwards it ──
console.log('\n— the transport —');
ok("handles a 'working' message", /case "working":/.test(session));
ok('calls the handler', /handlers\.working\?\.\(/.test(session));
ok('defaults to an empty list rather than undefined', /msg\.tools \?\? \[\]/.test(session));

// ── link 3: the overlay turns it into a phase ──
console.log('\n— the overlay —');
ok(
  'passes a working handler to the session',
  /working: \(tools\) =>/.test(overlay),
);
ok(
  'a named tool means thinking, an empty list means listening',
  overlay.includes('setRunningTools(tools)') &&
    overlay.includes('tools.length ? "thinking" : "listening"'),
);
ok(
  'the end of an utterance also enters thinking, with no tool involved',
  /if \(phaseRef\.current === "listening"\) setPhaseBoth\("thinking"\)/.test(overlay),
);
ok(
  'a handover does not fall through into the thinking branch',
  /restartAs\(target, residualQuestion\(utterance, target\)\);\s*\n\s*return;/.test(overlay),
);

// ── link 4: the animation keys off that phase ──
console.log('');
console.log('— the animation —');
ok(
  'thinking covers both the composing and the transcribing states',
  /const thinking = phase === "thinking" \|\| phase === "transcribing"/.test(overlay),
);
ok('the signal is rendered as two halves', (overlay.match(/<SignalHalf/g) || []).length === 2);
ok(
  'the status label sits BETWEEN them',
  (() => {
    const first = overlay.indexOf('<SignalHalf');
    const last = overlay.lastIndexOf('<SignalHalf');
    const label = overlay.indexOf('{switchingTo ?');
    return first < label && label < last;
  })(),
);

// ── findings arrive as overlays, never as a panel ──
console.log('');
console.log('— findings —');
const ov = read('src/components/saas/pages/AnswerOverlay.jsx');
// There is no readout reserved on this screen waiting to be filled.
ok('no DISPLAY panel anywhere', !overlay.includes('label="DISPLAY"'));
ok('no TASK panel anywhere', !overlay.includes('label="TASK"'));
ok('findings are mounted as an overlay', overlay.includes('<AnswerOverlay'));
ok(
  'the overlay is fed the answer, the tools and the phase',
  /turn={latest}/.test(overlay) &&
    /tools={runningTools}/.test(overlay) &&
    /thinking={thinking}/.test(overlay),
);

// It must not take part in the layout, or it is a panel again.
ok('the layer is fixed', ov.includes('fixed inset-0 z-30 pointer-events-none'));
ok('only the cards take a click', ov.includes('pointer-events-auto'));
ok('cards come forward in 3d', ov.includes('hud-pop') && ov.includes('--pop-ry'));

// Berths are anchored to the centre, where the orb is. A percentage berth
// has no idea where the orb is: at 1366x768 `right: 25%` put a card
// straight through the ring, and the same percentage is a different gap at
// every width.
// The clearance must track the RING, which is fluid. A fixed 185px put
// the cards inside it at 1920x1080, where the ring is 420 across.
ok(
  'the clearance is measured from the ring, not guessed',
  ov.includes('const CLEAR = `calc(50% + ${RING} / 2 + 44px)`'),
);
// `right` is measured from the container's EDGE. Without the `50% +` the
// card sits that far in from the side of the screen instead of out from
// the middle: measured, a 306px gap where 44 was intended.
ok(
  'the berth is anchored to the centre, not to the viewport edge',
  ov.includes('const CLEAR = `calc(50% +'),
);
// The cap is stricter than it was: as well as never exceeding CARD_MAX_H, a
// top card is now limited to the room between the brain portrait and the
// centre line, because it is anchored above the centre and grows upward.
ok(
  'card height is capped so a card cannot grow into the ring or the portrait',
  ov.includes('Math.min(CARD_MAX_H, h / 2 - 14 - clear)') &&
    ov.includes('Math.min(CARD_MAX_H, band)'),
);

// The readout card rendered the WHOLE answer, so it repeated the log word
// for word and overflowed its box on both axes. The log is the record.
ok('no card repeats the whole answer', !ov.includes('<MarkdownMessage')); 
ok('and the renderer is not imported for one', !ov.includes('from "./MarkdownMessage"'));
// The connectors are provenance, not decoration, and there is one per card.
// They are measured now rather than expressed as offsets - see the flows
// section below for why both earlier versions were wrong.
ok('there is one ribbon per card', ov.includes('anchors.map((a, i) => {'));
ok('a source card names the tools that were run', ov.includes('card.kind === "src"'));

// As a flex sibling the row pushed the ring up by half its own height and
// the orb sat 70px above the middle of the screen. Absolute, it cannot move
// the thing it is measured from.
ok(
  'the status row hangs off the ring rather than sharing a column with it',
  overlay.includes('absolute top-full left-1/2 -translate-x-1/2 mt-[clamp(32px,8vh,100px)]'),
);
ok(
  'the ring is sized from the smaller viewport axis',
  overlay.includes('w-[clamp(220px,46vmin,420px)]'),
);
ok(
  'the orb is a share of the ring, not its own fixed size',
  overlay.includes('w-[42%] h-[42%]'),
);
// A ring sized from width alone is half the height of a short window,
// which is how the status row ended up in the footer at 1366x645.
ok(
  'the layer centres one thing, so that one thing is the orb',
  overlay.includes('fixed inset-0 z-10 grid place-items-center'),
);

// Cards are derived from the answer's text, and a half-finished turn used to
// rebuild them on every chunk: they jumped berths and vanished mid-answer. The
// fix was to exclude streaming turns, which also meant nothing could appear
// until the answer was over - no use at all on the live path, where the text
// arrives as it is spoken. The overlay accumulates now, so streaming turns are
// back in and the flicker is prevented where it was actually caused.
ok(
  'streaming turns are read, and accumulated rather than rebuilt',
  overlay.includes('.find((t) => t.role === "assistant");') &&
    read('src/components/saas/pages/AnswerOverlay.jsx').includes('seenRef'),
);
ok(
  'a live turn is marked settled when the turn completes',
  overlay.includes('{ ...t, streaming: false }'),
);

// ── the log ──
console.log('');
console.log('— the log —');
ok('the log lives in the rail', (() => {
  const rail = overlay.indexOf('SAY A NAME TO SWITCH');
  const log = overlay.indexOf('label="LOG"');
  return log > rail;
})());
ok('it takes the height the rail has left', overlay.includes('className="flex-1 min-h-0 flex flex-col"'));
ok('the scrolling body is what holds the ref', overlay.includes('bodyRef={transcriptRef}'));
// A live transcript that yanks itself down cannot be read.
ok('it follows only while already at the bottom', overlay.includes('followingRef.current'));
ok(
  'the check runs before the new turn is painted',
  overlay.includes('useLayoutEffect(() => {'),
);
// ── the agent working the screen ──
console.log('');
console.log('— screen control —');
const sess = read('src/components/saas/pages/liveSession.js');
ok("the transport forwards a 'screen' message", sess.includes('case "screen":'));
ok('the overlay carries the handler', overlay.includes('screen: ({ action, language: lang })'));
for (const [what, needle] of [
  ['clearing the log', 'if (action === "clear_log") setTurns([])'],
  ['hiding the cards', 'setCardsHidden(true)'],
  ['changing the language', 'chooseLanguage(lang)'],
]) {
  ok('it can act on ' + what, overlay.includes(needle));
}
// Hiding is for the answer on screen, not for every answer after it.
ok('a new answer brings the cards back', overlay.includes('setCardsHidden(false)'));
ok(
  'the overlay honours it',
  read('src/components/saas/pages/AnswerOverlay.jsx').includes('const live = hidden'),
);
// ── opening and closing ──
console.log('');
console.log('— open / close —');
const css3 = read('src/index.css');
ok('@keyframes vcOpen exists', css3.includes('@keyframes vcOpen'));
ok('@keyframes vcClose exists', css3.includes('@keyframes vcClose'));
ok(
  'the screen grows from the button that opened it',
  overlay.includes('transformOrigin: `${(origin.fx * 100)'),
);
// Fullscreen resizes the viewport in the same moment the animation plays, so
// a pixel captured beforehand points somewhere else afterwards.
ok(
  'the origin is captured as a fraction of the viewport',
  read('src/components/saas/pages/AssistantPage.jsx').includes('fx: (b.x + b.width / 2) / window.innerWidth'),
);

// React unmounts on the frame the parent's state flips, so without this
// there is nothing left to animate on the way out.
ok('the close is deferred until the animation has run', overlay.includes('setTimeout(onClose, EXIT_MS)'));
ok(
  'a second close cannot stack another',
  overlay.includes('if (already) return already;'),
);
for (const [what, needle] of [
  ['the close button', 'onClick={requestClose}'],
  ['Escape', 'e.key === "Escape" && requestClose()'],
  ["the agent's own close", 'closeRequested: () => requestClose()'],
]) {
  ok(what + ' goes through the animation', overlay.includes(needle));
}

// Fullscreen is the PARENT's: asked for inside the click, where the gesture
// makes it grantable and the resize starts before the animation rather than
// during it.
const host = read('src/components/saas/pages/AssistantPage.jsx');
ok('it asks for fullscreen on open', host.includes('requestFullscreen?.()'));
ok(
  'fullscreen is requested inside the click, not from an effect',
  !overlay.includes('requestFullscreen'),
);
// Only release fullscreen if we took it: someone already fullscreen before
// opening this should still be fullscreen after closing it.
ok(
  'it only releases fullscreen it took itself',
  host.includes('if (tookFullscreenRef.current && document.fullscreenElement)'),
);
ok(
  'a refused fullscreen request is survivable',
  host.includes('.catch(() => {})'),
);

// ── the transform has to be cheap ──
// A backdrop blur inside a scaling ancestor is recomputed every frame, because
// the region it samples moves with the scale. Five of them plus a canvas is
// what made the open look stuck.
ok('there is a quiet phase for the transform', css3.includes('.vc-busy *'));
for (const [what, needle] of [
  ['backdrop blur', 'backdrop-filter: none !important'],
  ['child animations', 'animation-play-state: paused !important'],
]) {
  ok(what + ' is off while the screen moves', css3.includes(needle));
}
ok('it gets its own compositor layer', css3.includes('will-change: transform, opacity'));
ok('the root carries the quiet class', overlay.includes('${busy ? "vc-busy" : ""}'));
ok('the canvas is not mounted while it moves', overlay.includes('{!busy && ('));
ok('the shrink is quiet too', overlay.includes('// Costly layers off for the shrink'));

// getUserMedia blocks the main thread; doing it mid-animation freezes the
// canvas and every React update, which reads as a crash.
ok('the mic and socket start after the entrance', overlay.includes('}, OPEN_MS);'));
ok(
  'the deferred start is cancelled if it closes first',
  overlay.includes('clearTimeout(begin);'),
);

// The JS timers and the CSS durations are two statements of one number, and
// they drift the moment someone tunes the animation without reading the JS.
const cssMs = (name) => {
  const m = css3.match(new RegExp('\\.' + name + '\\s*\\{[^}]*?(\\d+)ms'));
  return m ? Number(m[1]) : null;
};
const jsMs = (name) => {
  const m = overlay.match(new RegExp('const ' + name + ' = (\\d+);'));
  return m ? Number(m[1]) : null;
};
ok(
  `the open duration agrees: css ${cssMs('vc-open')}ms, js ${jsMs('OPEN_MS')}ms`,
  cssMs('vc-open') !== null && cssMs('vc-open') === jsMs('OPEN_MS'),
);
ok(
  `the close duration agrees: css ${cssMs('vc-close')}ms, js ${jsMs('EXIT_MS')}ms`,
  cssMs('vc-close') !== null && cssMs('vc-close') === jsMs('EXIT_MS'),
);
// Long enough to read as motion, short enough not to be waited on.
ok(
  `the open is under 320ms (${jsMs('OPEN_MS')}ms)`,
  jsMs('OPEN_MS') > 120 && jsMs('OPEN_MS') <= 320,
);

// A stream that arrives after the screen closed leaves the mic on.
ok(
  'a microphone granted after closing is stopped',
  overlay.includes('if (closingRef.current) {') &&
    overlay.includes('stream.getTracks().forEach((t) => t.stop());'),
);

/*
 * The one that actually shipped broken.
 *
 * Writing `-webkit-backdrop-filter` beside the standard property made the
 * build collapse the pair and emit ONLY the prefixed one. That alias is
 * Safari's; Chrome reads the unprefixed property, so the rule compiled to
 * something that did nothing on the browser this panel is used in, and the
 * blur stayed up through the entire transform. Source looked right. Only the
 * compiled stylesheet showed it.
 */
ok(
  'the -webkit- alias is not written by hand beside it',
  !css3.includes('-webkit-backdrop-filter: none'),
);
const built = (() => {
  const dir = 'dist/assets';
  if (!fs.existsSync(dir)) return null;
  const sheet = fs.readdirSync(dir).find((f) => f.endsWith('.css'));
  return sheet ? fs.readFileSync(`${dir}/${sheet}`, 'utf8') : null;
})();
if (built === null) {
  console.log('SKIP  compiled stylesheet (no build in dist/)');
} else {
  const rule = built.match(/\.vc-busy \*\{[^}]*\}/)?.[0] ?? '';
  ok(
    'the compiled rule keeps the unprefixed property',
    /(^|;|\{)backdrop-filter:none!important/.test(rule),
  );
  ok('the compiled rule keeps the Safari alias', rule.includes('-webkit-backdrop-filter:none!important'));
}

// ── what the overlay shows ──
console.log('');
console.log('— data, not the conversation —');
const cards = read('src/components/saas/pages/AnswerOverlay.jsx');

// The log in the left rail already has what was said. A popup repeating it is
// the screen saying the same thing twice, where the figures should be.
ok('there is no headline card', !cards.includes('kind: "head"') && !cards.includes("'head'"));
ok('no card renders a sentence', !cards.includes('headline(') && !cards.includes('card.line'));
ok('the card kinds are data', ['"stat"', '"chart"', '"grid"', '"src"'].every((k) => cards.includes(k)));

// The cards are timed to the voice, which only works if the clock is real.
ok('the overlay takes a progress clock', cards.includes('progress'));
ok('the clock comes from the audio element', overlay.includes('audio.ontimeupdate = ()'));
ok(
  'an unresolvable duration does not freeze the cards',
  overlay.includes('if (!Number.isFinite(d) || d <= 0) return;'),
);
ok('the clock is released at the end', overlay.includes('audio.ontimeupdate = null;'));
ok('a finished answer shows everything', overlay.includes('setSpeech(1);'));
ok('the overlay is given the clock', overlay.includes('progress={speech}'));
// A card derived from streaming text flickered in and out; it accumulates now.
ok('cards accumulate rather than rebuild', cards.includes('seenRef'));
ok('a new answer resets the stack', cards.includes('text.startsWith(prev.text)'));
ok('streaming turns reach the overlay', overlay.includes('.find((t) => t.role === "assistant");'));

// Measured at 373px wide, the side berths put cards at left: -144.
ok('the layout measures the viewport', cards.includes('useViewport'));
ok('there is a layout for when there is no room beside the ring', cards.includes('beside: false'));
// The stubs had to be switched off in the corner layout because they
// pointed at empty space. A measured ribbon reaches the card wherever it is,
// so both layouts keep their connectors.
ok('both layouts keep their connectors', !cards.includes('{layout.beside && ('));

// ── the brain portrait ──
console.log('');
console.log('— the brain —');
const field = read('src/components/saas/pages/NeuronField.jsx');

// It used to fill the screen, drifting behind every panel and figure on it.
ok('the field is not the background any more', !field.includes('absolute inset-0 w-full h-full'));
ok('it fills the box it is given', field.includes('block w-full h-full'));
ok('it is mounted top right', overlay.includes('right: BRAIN_MARGIN'));
ok('it hangs below the top rail', overlay.includes('top: `calc(2.25rem + ${BRAIN_MARGIN}px)`'));

// A silhouette is what makes it a brain rather than a box of dots.
ok('there is a silhouette', field.includes('BRAIN_PATH'));
ok('and folds, which is what names the shape', field.includes('BRAIN_FOLDS'));
ok('cells spawn inside it', field.includes('const seed = inside();'));
ok('cells bounce off the inside of it', field.includes('if (within(nx, ny)) {'));

/*
 * The one that could only be caught by running it.
 *
 * `isPointInPath` transforms the PATH by the current matrix and tests the
 * point in DEVICE pixels; the point is NOT put through the transform. The
 * context is scaled by the dpr for retina, so a CSS-pixel test point checks
 * a position at half the intent - on a 2x screen every cell would be packed
 * into the top-left quarter of the brain. Indistinguishable at dpr 1, which
 * is where this was written.
 */
ok('containment is in device pixels', field.includes('ctx.isPointInPath(shape, x * dpr, y * dpr)'));
// Keeping the cell bodies in is not enough: a dendrite is a third of the box
// long and an axon bows outward, so filaments hung outside the outline.
ok('nothing is drawn outside the skull', field.includes('ctx.clip(outline);'));
ok('and the clip is released', field.includes('if (outline) ctx.restore();'));

// 190px was tuned for a whole screen; in a 200px box it connects every cell
// to every other one, which is a blob rather than a network.
ok('the link distance is proportional to the box', field.includes('linkDistFor'));
ok('no fixed link distance survives', !field.includes('LINK_DIST'));

// The portrait takes the top right corner, so a card cannot have it.
ok('the corner layout reserves the corner', cards.includes("open: { l: [\"lt\", \"lb\"], r: [\"rb\"] }"));
ok('berths can be withheld', read('src/components/saas/pages/AnswerData.js').includes('export function assignBerths(cards, open)'));
ok(
  'the cards and the box agree on where it is',
  cards.includes('brainBoxSize') && overlay.includes('brainBoxSize'),
);
// Two copies of this hook would be two answers to "how much room is there".
ok('there is one viewport hook', cards.includes('from "./useViewport"') && overlay.includes('from "./useViewport"'));

// ── the flows ──
console.log('');
console.log('— data connected to the orb —');

// Two earlier attempts: an SVG in percentage coordinates that could not know
// where a card was, so it crossed the orb and missed at both ends; then a
// 36px stub that left the ring and stopped, which connected nothing and had
// to be switched off in the corner layout because it pointed at empty space.
ok('the stubs to nowhere are gone', !cards.includes('WIRE_FROM') && !cards.includes('WIRE_LEN'));
ok('the cards are measured', cards.includes('el.getBoundingClientRect()'));
ok('a ribbon is drawn to each one', cards.includes('function ribbonFor('));
// Both tangents horizontal is what makes a set of them read as flow
// converging on a hub rather than as spokes on a wheel.
ok('it leaves and arrives sideways', cards.includes('C${c1.toFixed(1)} ${cy.toFixed(1)}'));

/*
 * Card ids are built from the answer's own words, so they contain spaces:
 * `stat-clinics over quota`. getElementById finds that happily, which is why
 * it survived a first look, but `url(#flow-stat-clinics over quota)` is not a
 * parseable reference - the paint server is never found and the path is
 * stroked with nothing. Two of three ribbons were invisible.
 */
ok('svg ids are sanitised', cards.includes('replace(/[^A-Za-z0-9_-]+/g, "-")'));
ok('and the reference uses the same function', cards.includes('stroke={`url(#${svgId(a.id)})`}'));

// Running the gradient from the centre of the orb spends its opaque end
// inside the orb, where there is no ribbon, so a card near the ring gets only
// the faint tail: measured, two of three bands were nearly invisible.
ok('the gradient runs along the ribbon', cards.includes('const { sx, sy } = ribbonFor('));

// Setting state from a layout effect re-runs the layout effect.
ok('re-measuring bails out when nothing moved', cards.includes('return same ? prev : next;'));
// A ribbon drawn to where a card was at 0ms points under it when it lands.
ok('it measures again once the cards have settled', cards.includes('setTimeout(measure, 760)'));

// The mesh is the subject of the portrait now, so it has to look joined up.
ok('the mesh is denser than the backdrop was', field.includes('const MIN_NODES = 44;'));
ok('and its links carry more light', field.includes('const linkBase = 0.3 + 0.42 * heat;'));

// ── hooks ──
console.log('');
console.log('— every hook runs every render —');

/*
 * This took the whole admin panel down to its error boundary.
 *
 * React matches hooks by call ORDER, so a hook placed after
 * `if (!open) return null` is simply not called while the screen is closed -
 * and the render where it opens then calls MORE hooks than the one before
 * it, which is a hard crash rather than a warning. Two effects were added
 * below that line and the first press of the mic button killed the page.
 *
 * Nothing in the build catches it: vite does not lint, and the file compiles
 * perfectly. So it is counted here instead.
 */
const HOOK = /^\s*(?:const [^=]+= )?(useState|useRef|useEffect|useLayoutEffect|useCallback|useMemo|useReducer|useViewport)\(/;
const lines = overlay.split('\n');
const guard = lines.findIndex((l) => l.includes('if (!open) return null;'));
ok('the early return is where it was', guard > 0);
const after = lines
  .slice(guard + 1)
  .map((l, i) => [guard + 2 + i, l])
  .filter(([, l]) => HOOK.test(l));
ok(
  after.length
    ? `no hook is called after the early return (found ${after.length} at line ${after[0][0]})`
    : 'no hook is called after the early return',
  after.length === 0,
);

// ── sound ──
console.log('');
console.log('— sound —');
ok('opening and closing are marked', overlay.includes('cue("boot")') && overlay.includes('cue("shutdown")'));
ok('a tool starting is marked', overlay.includes('cue("tool")'));
ok('an answer landing is marked', overlay.includes('cue("answer")'));
ok('a handover is marked', overlay.includes('cue("handover")'));
ok('a fault is marked', overlay.includes('cue("fault")'));
ok('there is a mute control', overlay.includes('aria-pressed={!muted}'));
ok('the device is released on close', overlay.includes('releaseSound'));
// ── an idle screen is empty ──
console.log('');
console.log('— idle —');
// Nothing stands on this screen waiting to be useful. With no question
// asked there is the orb and its status, and no panel under it.
ok('the starters are gone', !overlay.includes('TRY ASKING'));
// Brief me in the rail is the same affordance without a panel on screen.
ok('Brief me still offers it', overlay.includes('Brief me'));
// ── the ring and the status row ──
console.log('');
console.log('— ring geometry —');
ok('the survey grid is gone', !overlay.includes('backgroundSize: "36px 36px"'));
// Sized to the orb, the ring overflowed its own box: the band clipped its
// top and the row below needed a hand-tuned margin to miss its bottom.
ok(
  'the ring reserves its own space',
  overlay.includes('w-[clamp(220px,46vmin,420px)]') &&
    overlay.includes('className="absolute inset-0 w-full h-full pointer-events-none"'),
);
console.log(fail ? `\n${fail} FAILED` : '\nall checks passed');
process.exit(fail ? 1 : 0);
