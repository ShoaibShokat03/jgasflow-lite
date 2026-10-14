// src/components/saas/pages/VoiceConversation.jsx
// Full-screen voice conversation: speak, it answers, it listens again.
//
// A LOOP, NOT A BUTTON. Push-to-talk means holding something while you think.
// Here the turn ends when you stop talking: an analyser watches the live
// signal and closes the recording after a beat of silence, which is what makes
// it feel like talking to someone rather than operating a dictaphone.
//
// THE ANIMATION IS THE REAL SIGNAL. Every bar height and the orb's pulse come
// from an AnalyserNode reading actual audio — the microphone while you speak,
// the answer while it plays. Random bars would have been easier and would have
// lied: you could not tell a dead microphone from a quiet one, which is the
// single most useful thing this screen can tell you.
//
// It writes bar heights straight to the DOM in the rAF loop instead of through
// state. Sixty renders a second of a component this size would drop frames for
// no benefit, and nothing else on screen depends on those numbers.
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Mic, X, Loader2, Volume2, VolumeX, AlertTriangle, RotateCcw, Sparkles,
  Compass, Activity, Receipt, TrendingUp,
} from "lucide-react";
import { saasAiApi } from "../../../api/saasApi";
import MarkdownMessage from "./MarkdownMessage";
import NeuronField, { brainBoxSize, BRAIN_MARGIN } from "./NeuronField";
import useViewport from "./useViewport";
import AgentNetwork from "./AgentNetwork";
import AgentDashboard from "./AgentDashboard";
import SystemOverview from "./SystemOverview";
import ActivityFeed from "./ActivityFeed";
import useLiveMetrics from "./useLiveMetrics";
import { AGENTS, AGENT_BY_KEY, AGENT_STATE, agentForQuestion } from "./data/mockAgents";
import { headline } from "./data/agentSources";
import HudReveal from "./HudReveal";
import AnswerOverlay from "./AnswerOverlay";
import { cue, isMuted, setMuted, releaseSound } from "./hudSound";
import { openLiveSession } from "./liveSession";
import { API_BASE_URL } from "../../../config/app";

/** Many thin bars, not a few fat ones — that is what reads as a waveform. */
const BARS = 44;

/** The full-width bands framing the screen need more, being much wider. */
const EDGE_BARS = 72;

/**
 * The sphere's wireframe, generated once at module load.
 *
 * Hand-drawn ellipses looked like a diagram of an atom. A real mesh needs
 * irregularity, so points go down on a golden-angle spiral (even coverage, no
 * visible rows) and each one links to its nearest neighbours. Deterministic,
 * so the sphere is the same on every render and in every browser.
 */
const MESH = (() => {
  const R = 92;
  const N = 34;
  const GOLDEN = Math.PI * (3 - Math.sqrt(5));
  const pts = [];
  for (let i = 0; i < N; i++) {
    // sqrt keeps the density even instead of clustering at the centre.
    const r = R * Math.sqrt((i + 0.5) / N);
    const a = i * GOLDEN;
    pts.push([100 + r * Math.cos(a), 100 + r * Math.sin(a)]);
  }

  const edges = [];
  const seen = new Set();
  pts.forEach(([x1, y1], i) => {
    const near = pts
      .map(([x2, y2], j) => ({ j, d: Math.hypot(x2 - x1, y2 - y1) }))
      .filter((n) => n.j !== i)
      .sort((a, b) => a.d - b.d)
      .slice(0, 3);
    near.forEach(({ j }) => {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (seen.has(key)) return;
      seen.add(key);
      edges.push([pts[i], pts[j]]);
    });
  });

  return { pts, edges };
})();

/**
 * An EEG-style trace, drawn once at module load.
 *
 * Deterministic on purpose: a fresh random path on every render would jitter
 * between frames instead of holding still under a moving highlight. Three
 * gaussian bursts along a noisy baseline is what makes it read as a readout
 * rather than as a scribble.
 */
const TRACE = (() => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const at = (t, mid, width) => Math.exp(-((t - mid) ** 2) / width);

  const steps = [];
  for (let x = 0; x <= 200; x += 3.5) {
    const t = x / 200;
    const burst = at(t, 0.2, 0.004) + at(t, 0.5, 0.0025) + at(t, 0.79, 0.005);
    const n = rnd() - 0.5;
    const y = 56 - (n * 7 + burst * n * 46);
    steps.push(`${steps.length ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return steps.join(' ');
})();

/**
 * The languages a conversation can be pinned to.
 *
 * Deliberately two. This is not a locale picker for the panel's own chrome;
 * it is the language the agent speaks and writes, and every entry has to be
 * one the model and the recogniser both handle well.
 */
/**
 * The instrument ring around the orb.
 *
 * Built once, in polar coordinates, because this is the thing that makes the
 * screen read as an instrument rather than as a dark page with a circle on
 * it: a bare orb is a logo, an orb inside a graduated scale is a readout.
 *
 * Everything here is ABSTRACT on purpose. The scale has no units and the
 * gauge no value, because the panel it sits on shows real platform figures
 * and a dial that looks like it is measuring something would be read as
 * measuring something.
 */
const DIAL = (() => {
  const C = 200;
  const polar = (r, deg) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return [C + r * Math.cos(a), C + r * Math.sin(a)];
  };

  // A graduated scale: 72 marks, every sixth one long.
  const ticks = [];
  for (let i = 0; i < 72; i++) {
    const deg = i * 5;
    const long = i % 6 === 0;
    const [x1, y1] = polar(long ? 118 : 124, deg);
    const [x2, y2] = polar(130, deg);
    ticks.push({ x1, y1, x2, y2, long });
  }

  // A segmented gauge further out. Lit segments are fixed, not a value.
  const segs = [];
  for (let i = 0; i < 36; i++) {
    const deg = i * 10;
    const [x1, y1] = polar(140, deg);
    const [x2, y2] = polar(148, deg);
    segs.push({ x1, y1, x2, y2, lit: i % 7 === 0 || i % 11 === 0 });
  }

  /** An arc path from `from` to `to` degrees at radius `r`. */
  const arc = (r, from, to) => {
    const [x1, y1] = polar(r, from);
    const [x2, y2] = polar(r, to);
    const large = to - from > 180 ? 1 : 0;
    return `M${x1.toFixed(1)} ${y1.toFixed(1)} A${r} ${r} 0 ${large} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  };

  return {
    ticks,
    segs,
    // Two counter-rotating sweeps, and four corner brackets that frame the
    // whole cluster the way the rest of the screen is framed.
    sweepA: [arc(160, 8, 72), arc(160, 188, 252)],
    sweepB: [arc(172, 110, 150), arc(172, 290, 330)],
    brackets: [arc(186, 32, 58), arc(186, 122, 148), arc(186, 212, 238), arc(186, 302, 328)],
    crosshairs: [0, 90, 180, 270].map((deg) => {
      const [x1, y1] = polar(100, deg);
      const [x2, y2] = polar(110, deg);
      return { x1, y1, x2, y2 };
    }),
  };
})();

/** Must match .vc-open / .vc-close in index.css. */
const OPEN_MS = 240;
const EXIT_MS = 150;

/*
 * Waiting.
 *
 * REASSURE at eight seconds: one ask can run several tool calls with a model
 * round trip between each, and twenty seconds of a single unchanging label
 * is indistinguishable from a crash.
 *
 * GIVE UP at ninety. The request itself is capped at two minutes further
 * down the stack, which is far longer than anyone will sit in front of a
 * silent screen, and a socket that dies quietly is capped by nothing at all.
 */
const WAIT_SLOW_MS = 8000;
const WAIT_LIMIT_MS = 90000;

const LANGUAGES = [
  { code: "ur", label: "اردو", title: "Urdu" },
  { code: "en", label: "EN", title: "English" },
];

/** Tuned by talking at it: sensitive enough for a quiet voice, deaf to hum. */
const VAD = {
  /** Above this counts as speech. */
  speak: 0.055,
  /** Below this, for `hangMs`, ends the turn. */
  silence: 0.035,
  hangMs: 1100,
  /** Give up waiting if nobody says anything. */
  patienceMs: 9000,
  /** A turn has to end sometime. */
  maxMs: 25000,
  /** Too short to be a question — usually a cough or a door. */
  minBytes: 1600,
};

/**
 * One accent per persona, and it drives the WHOLE screen — orb, halo, cards,
 * headline, waveform. Switching agent should be felt before it is read, and a
 * chip changing colour in the corner is not felt.
 *
 * Hex rather than Tailwind classes for the parts that end up inside a
 * gradient: a class name cannot be interpolated into `radial-gradient(...)`.
 */
const THEME = {
  teal: {
    badge: "bg-teal-500",
    // Drawn ON the light surface: the canvas paints its own colours,
    // so the pastel rim that glows on black simply vanishes here.
    ink: "13,118,110",
    name: "text-teal-300",
    ring: "ring-teal-400/50",
    card: "from-teal-500/20",
    glow: "45,212,191",
    rim: "94,234,212",
    coreA: "#1d5f7a",
    coreB: "#0a2438",
    bar: "from-teal-600/70 via-cyan-300 to-teal-600/70",
  },
  sky: {
    badge: "bg-sky-500",
    // Drawn ON the light surface: the canvas paints its own colours,
    // so the pastel rim that glows on black simply vanishes here.
    ink: "2,105,161",
    name: "text-sky-300",
    ring: "ring-sky-400/50",
    card: "from-sky-500/20",
    glow: "56,189,248",
    rim: "125,211,252",
    coreA: "#1e4f86",
    coreB: "#081d3a",
    bar: "from-sky-600/70 via-sky-200 to-sky-600/70",
  },
  amber: {
    badge: "bg-amber-500",
    // Drawn ON the light surface: the canvas paints its own colours,
    // so the pastel rim that glows on black simply vanishes here.
    ink: "161,98,7",
    name: "text-amber-300",
    ring: "ring-amber-400/50",
    card: "from-amber-500/20",
    glow: "251,191,36",
    rim: "253,224,71",
    coreA: "#7a5320",
    coreB: "#2a1a08",
    bar: "from-amber-600/70 via-amber-200 to-amber-600/70",
  },
  rose: {
    badge: "bg-rose-500",
    // Drawn ON the light surface: the canvas paints its own colours,
    // so the pastel rim that glows on black simply vanishes here.
    ink: "190,18,60",
    name: "text-rose-300",
    ring: "ring-rose-400/50",
    card: "from-rose-500/20",
    glow: "251,113,133",
    rim: "253,164,175",
    coreA: "#7a2440",
    coreB: "#2d0b18",
    bar: "from-rose-600/70 via-rose-200 to-rose-600/70",
  },
  violet: {
    badge: "bg-violet-500",
    // Drawn ON the light surface: the canvas paints its own colours,
    // so the pastel rim that glows on black simply vanishes here.
    ink: "109,40,217",
    name: "text-violet-300",
    ring: "ring-violet-400/50",
    card: "from-violet-500/20",
    glow: "167,139,250",
    rim: "196,181,253",
    coreA: "#4c3a8f",
    coreB: "#1a1038",
    bar: "from-violet-600/70 via-fuchsia-200 to-violet-600/70",
  },
};

const themeFor = (accent) => THEME[accent] ?? THEME.teal;

/** A glyph beats a letter badge, which reads as a contact rather than a role. */
const ICONS = {
  compass: Compass,
  activity: Activity,
  receipt: Receipt,
  "trending-up": TrendingUp,
};

/**
 * Switching agent by voice, decided in CODE rather than by the model.
 *
 * "Let's go to Bilal" is not a question anyone wants answered — it is a
 * command, and routing it through Gemini would cost a round trip, a few
 * thousand tokens and a second of latency to settle something a regular
 * expression settles instantly.
 *
 * WHAT CHANGED: the first version matched a short fixed list of phrases, and
 * "I want to talk Sana" fell straight through it — no "talk TO", so no match,
 * and the assistant replied with advice about saying the name instead of just
 * switching. Nobody phrases a handover the same way twice, so this reads
 * INTENT: does the utterance ask for a person, or ask for data?
 */
const HANDOVER = new RegExp(
  [
    "go to", "switch( to)?", "talk( to| with)?", "speak( to| with)?",
    "connect( me)?", "put me (through|on)", "hand (me )?over", "pass me",
    "bring in", "next up", "let'?s hear from", "over to", "get me",
    "i (want|need)", "can i", "let me", "ask",
  ].join("|"),
  "i",
);

/**
 * A greeting plus a name is someone addressing that person.
 *
 * Regex LITERALS, not RegExp built from strings: in a string "\b" is a
 * backspace character, not a word boundary, and the pattern then matches
 * nothing at all while looking perfectly correct.
 */
const GREETING = /^(hello|hi|hey|yo|salaam|assalam|as-?salamu)\b/i;

/**
 * Words that make an utterance a QUESTION rather than a handover. "How much
 * did Bilal collect" names Bilal but wants an answer, not Bilal.
 */
const ASKING =
  /\b(what|which|how|why|when|where|who|show|list|give|tell|report|total|many|much)\b/i;

/** Long enough for a natural request, short enough not to swallow a question. */
const MAX_COMMAND_WORDS = 9;

/**
 * Levenshtein distance, capped — we only care whether two words are CLOSE.
 */
function editDistance(a, b) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 2) return 99;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        prev[j] + 1,
        row[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = row;
  }
  return prev[b.length];
}

/** "billal" and "bilaal" both collapse to "bilal". */
const collapse = (w) => w.replace(/(.)\1+/g, "$1");

/**
 * Does this utterance name a persona?
 *
 * An exact substring match is not enough, and the transcript is why: speech
 * recognition wrote "switch to billal" with two Ls, so a literal check for
 * "bilal" found nothing and the handover silently did not happen. Names are
 * exactly the words a recogniser gets approximately right.
 *
 * So each word is compared against each name three ways: exactly, with
 * doubled letters collapsed, and within a small edit distance — one for short
 * names, two for longer ones, because a single edit on a four-letter name is
 * most of the word.
 */
function namedPersona(said, words, personas) {
  return (
    personas.find((p) => {
      const name = p.name.toLowerCase();
      if (said.includes(name)) return true;
      if (said.includes(p.role.toLowerCase())) return true;

      const slack = name.length <= 4 ? 1 : 2;
      const squashed = collapse(name);
      return words.some(
        (w) =>
          collapse(w) === squashed ||
          editDistance(w, name) <= slack ||
          editDistance(collapse(w), squashed) <= slack,
      );
    }) ?? null
  );
}

export function matchPersonaCommand(text, personas) {
  const said = (text || "").trim().toLowerCase().replace(/[.,!?]/g, "");
  if (!said) return null;
  const words = said.split(/\s+/);

  const hit = namedPersona(said, words, personas);
  if (!hit) return null;

  // A name on its own is unambiguous.
  if (words.length <= 2) return hit;
  if (words.length > MAX_COMMAND_WORDS) return null;

  const asking = ASKING.test(said);

  // "Hello Sana, how are you" is addressed TO Sana even though it asks
  // something, so a greeting with the name near the front wins outright.
  if (GREETING.test(said) && words.slice(0, 4).some((w) => nearName(w, hit))) {
    return hit;
  }

  // Otherwise it has to read as a request for a PERSON rather than for data.
  // "Ask Bilal what is overdue" still switches, because the question travels
  // with it — see residualQuestion.
  if (!HANDOVER.test(said)) return null;
  return !asking || /\bask\b/.test(said) ? hit : null;
}

/** Is this word that persona's name, give or take how it was heard? */
function nearName(word, persona) {
  const name = persona.name.toLowerCase();
  const slack = name.length <= 4 ? 1 : 2;
  return (
    word === name ||
    collapse(word) === collapse(name) ||
    editDistance(word, name) <= slack
  );
}

/**
 * What was asked ALONGSIDE the handover, if anything.
 *
 * "Ask Bilal what is overdue" is two things: a handover and a question.
 * Dropping the question would make the user say it again to the new agent, so
 * it is stripped of the routing words and carried across — the difference
 * between a switchboard and an assistant.
 */
export function residualQuestion(text, persona) {
  const said = (text || "").trim().toLowerCase().replace(/[.,!?]/g, "");
  if (!said) return null;

  const rest = said
    .split(/\s+/)
    .filter((w) => !nearName(w, persona))
    .join(" ")
    .replace(HANDOVER, " ")
    .replace(GREETING, " ")
    .replace(/\b(to|with|me|please|and|the|a|is|it)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Anything shorter is leftover filler, not a question worth forwarding.
  return rest.split(" ").filter(Boolean).length >= 2 ? rest : null;
}

/**
 * What each tool is doing, in words an admin would use.
 *
 * The raw keys are database-shaped - `shop_activity`, `revenue_report` -
 * and putting one on screen tells the reader nothing except that something
 * technical is happening. Naming the work is most of what makes a long wait
 * tolerable.
 */
const TOOL_WORK = {
  platform_summary: "Reading the platform figures",
  find_shops: "Going through the shops",
  get_shop: "Opening the shop record",
  shop_activity: "Checking how much they use it",
  expiring_shops: "Finding plans that end soon",
  list_payments: "Going through payments",
  revenue_report: "Adding up the income",
  platform_sales: "Adding up gas sales",
  list_plans: "Reading the plans",
  recent_events: "Reading the activity log",
};

const STATUS = {
  idle: { label: "Tap to start", tone: "text-gray-300" },
  listening: { label: "Listening…", tone: "text-primary-300" },
  transcribing: { label: "Writing that down…", tone: "text-gray-300" },
  thinking: { label: "Looking it up…", tone: "text-amber-300" },
  speaking: { label: "Speaking…", tone: "text-primary-300" },
  error: { label: "Something went wrong", tone: "text-red-300" },
};

/**
 * Keeps only the horizontal band of a ring, so it shows as two arcs either
 * side of the orb rather than a full circle crossing the UI above and below.
 */
const ARC_MASK =
  "linear-gradient(to bottom, transparent 30%, #000 42%, #000 58%, transparent 70%)";

const VoiceConversation = ({ open, onClose, origin, ask, personas = [], live = false }) => {
  const [phase, setPhase] = useState("idle");
  const [error, setError] = useState("");
  /** The whole exchange, not just the last line — this is the right panel. */
  const [turns, setTurns] = useState([]);
  /**
   * The same turns, readable from a callback.
   *
   * `restartAs` is built once and must not be rebuilt on every turn - it is
   * held in a ref and called from the live socket - so it cannot close over
   * `turns`. Without this the recap handed to a colleague is whatever the
   * conversation looked like when the screen opened, which is nothing.
   */
  const turnsRef = useRef([]);
  turnsRef.current = turns;

  /**
   * The conversation language.
   *
   * Urdu by default because that is what this panel is spoken to in, and
   * because the failure it prevents is asymmetric: an Urdu speaker heard as
   * Hindi cannot fix it by speaking more Urdu, whereas an English speaker who
   * gets Urdu just switches this once.
   *
   * Remembered per browser, because it is a property of who is using the
   * panel rather than of any one conversation.
   */
  const [language, setLanguage] = useState(() => {
    try {
      const saved = localStorage.getItem("saas_ai_language");
      return LANGUAGES.some((l) => l.code === saved) ? saved : "ur";
    } catch {
      // Private mode, or storage disabled. A default is still a default.
      return "ur";
    }
  });
  // Read by the live session, which is set up outside React's render.
  const languageRef = useRef(language);
  languageRef.current = language;
  const [persona, setPersona] = useState(personas[0]?.key ?? "chief");
  /** Set while a handover is reconnecting, so the screen can say so. */
  const [switchingTo, setSwitchingTo] = useState(null);

  /**
   * The tools running right now.
   *
   * Named rather than counted: "reading clinic activity" is the assistant
   * showing its work, and a spinner is the assistant hiding it.
   */
  const [runningTools, setRunningTools] = useState([]);
  /** Set when the cards are dismissed as a group; a new answer clears it. */
  const [cardsHidden, setCardsHidden] = useState(false);

  /**
   * The screen is leaving.
   *
   * React unmounts on the frame the parent's state flips, so a close
   * animation needs the overlay to outlive the click that asked for it: this
   * plays the shrink, then tells the parent.
   */
  const [exiting, setExiting] = useState(false);
  /**
   * The whole screen is mid-transform.
   *
   * Everything costly is switched off while this is true, see `.vc-busy`.
   * It starts true because the entrance begins on the first frame, and the
   * first frame is the one most worth protecting.
   */
  const [busy, setBusy] = useState(true);
  /**
   * How far through speaking the answer we are, 0..1, or null when there is
   * nothing to measure.
   *
   * This is what the data cards are timed against, so it has to be the real
   * position of the audio rather than a stagger that merely looks like one.
   * Null on the live path: there the text arrives as it is spoken, so a card
   * appearing when its data does needs no clock.
   */
  const [speech, setSpeech] = useState(null);
  /** The screen's own size, which the brain portrait is scaled against. */
  const vp = useViewport();

  /**
   * Which agent's dashboard is open, if any.
   *
   * Null is the core: the orb, the four nodes around it, and a strip of one
   * headline figure each. Picking an agent REPLACES that rather than crowding
   * in beside it - the middle of this screen is not big enough for both, and
   * choosing an agent is a request to look at that agent's domain.
   */
  const [selectedAgent, setSelectedAgent] = useState(null);

  /*
   * HOW LONG THE SCREEN HAS BEEN WAITING, and the watchdog that ends it.
   *
   * There was no timeout anywhere on this path. One ask can legitimately run
   * twenty seconds - several tool calls with a model round trip between each
   * - and during that the screen said "Looking it up" and nothing else. A
   * slow answer and a dead socket were indistinguishable, so every long
   * question read as a crash, and a genuinely hung request stayed on screen
   * for ever with no way back except reloading the page.
   *
   * Two separate jobs, which is why there are two numbers: SAY something at
   * eight seconds so waiting feels like progress, and GIVE UP at ninety so
   * waiting always ends.
   */
  const [waitedMs, setWaitedMs] = useState(0);
  const waitTimerRef = useRef(0);
  const deadlineRef = useRef(0);

  /**
   * The figures, the charts and the feed.
   *
   * Paused while the screen is closed or still opening: a simulation ticking
   * behind a closed overlay is pure waste, and running one through the
   * entrance animation is the sort of main-thread work that made the open
   * stutter in the first place.
   */
  const sim = useLiveMetrics(open && !busy);
  const [muted, setMutedState] = useState(() => isMuted());
  // The loop reads the persona from a ref: `listen` closes over its value at
  // the moment it was created, and a switch mid-turn must take effect now.
  const personaRef = useRef(persona);

  // Everything below is machinery the render does not depend on, so it lives
  // in refs — re-rendering on an audio frame would be 60 renders a second.
  const streamRef = useRef(null);
  const ctxRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);
  const rafRef = useRef(0);
  const recorderRef = useRef(null);
  const audioRef = useRef(null);
  const audioSourceRef = useRef(null);
  // Four strips: two beside the orb, two framing the screen.
  const barsRef = useRef({ left: [], right: [], top: [], bottom: [] });
  const orbRef = useRef(null);
  const coreRef = useRef(null);
  const phaseRef = useRef("idle");
  const closingRef = useRef(false);
  const transcriptRef = useRef(null);
  const liveRef = useRef(null);
  // A live session's prompt, tools and voice are fixed at setup, so switching
  // persona means a NEW session. These hold the in-flight user utterance while
  // we decide whether it was a handover.
  const heardBufRef = useRef("");
  const heardTimerRef = useRef(0);

  const setPhaseBoth = (next) => {
    phaseRef.current = next;
    setPhase(next);
  };

  /**
   * Tick while the agent is working, and abandon the wait if it never ends.
   *
   * Keyed on the phase, so it starts and stops itself: leaving `thinking`
   * for any reason - an answer, an error, a close, a persona switch - clears
   * the timer, and nothing has to remember to.
   */
  useEffect(() => {
    const working = phase === "thinking" || phase === "transcribing";
    if (!working) {
      clearInterval(waitTimerRef.current);
      setWaitedMs(0);
      return undefined;
    }
    const startedAt = Date.now();
    deadlineRef.current = startedAt + WAIT_LIMIT_MS;
    waitTimerRef.current = setInterval(() => {
      const waited = Date.now() - startedAt;
      setWaitedMs(waited);
      if (waited < WAIT_LIMIT_MS) return;
      // Out of patience. Recover to a usable state rather than sitting here:
      // the screen must never be somewhere you can only leave by reloading.
      clearInterval(waitTimerRef.current);
      if (closingRef.current) return;
      setError("That took too long. Ask me again.");
      cue("fault");
      setRunningTools([]);
      setPhaseBoth("error");
    }, 250);
    return () => clearInterval(waitTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ─────────────────────── audio plumbing ───────────────────────

  /** One AudioContext for the whole session; browsers cap how many you get. */
  const audioContext = () => {
    if (!ctxRef.current || ctxRef.current.state === "closed") {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      ctxRef.current = new Ctx();
    }
    if (ctxRef.current.state === "suspended") ctxRef.current.resume();
    return ctxRef.current;
  };

  /**
   * Bar heights from the TIME DOMAIN, not the frequency bins.
   *
   * Frequency data was the first attempt and it looked wrong for a reason:
   * speech energy piles into the low bins, so the bars rendered as two tall
   * spikes on the left decaying to a flat line on the right. A waveform is
   * what people read as "a voice", so each bar is one slice of the actual
   * signal, and the strips mirror around the orb.
   *
   * Four strips share one pass: the two beside the orb, and the full-width
   * bands framing the top and bottom of the screen.
   */
  const paint = useCallback((time, level) => {
    const groups = barsRef.current;

    /** One slice per bar: RMS for honest loudness, peak for the spikes. */
    const heightsFor = (n, floor, taperFrom) => {
      const slice = Math.floor(time.length / n) || 1;
      const out = new Array(n);
      for (let i = 0; i < n; i++) {
        let sum = 0;
        let peak = 0;
        for (let j = 0; j < slice; j++) {
          const x = (time[i * slice + j] - 128) / 128;
          sum += x * x;
          const a = Math.abs(x);
          if (a > peak) peak = a;
        }
        const amp = Math.sqrt(sum / slice) * 0.45 + peak * 0.55;
        // Taper so a strip fades to dots at its ends instead of stopping dead.
        const t = taperFrom + (1 - taperFrom) * Math.sin(((i + 0.5) / n) * Math.PI);
        out[i] = Math.min(1, Math.max(floor, Math.pow(amp * 2.6, 0.75) * t));
      }
      return out;
    };

    const side = heightsFor(BARS, 0.045, 0.22);
    for (let i = 0; i < BARS; i++) {
      const h = `scaleY(${side[i].toFixed(3)})`;
      // Mirrored: the left strip runs outward from the orb too.
      const l = groups.left[BARS - 1 - i];
      const r = groups.right[i];
      if (l) l.style.transform = h;
      if (r) r.style.transform = h;
    }

    // The bands are wider, so they get their own sampling rather than being
    // stretched — stretching would repeat the same shape four times over.
    const edge = heightsFor(EDGE_BARS, 0.03, 0.55);
    for (let i = 0; i < EDGE_BARS; i++) {
      const h = `scaleY(${edge[i].toFixed(3)})`;
      const b = groups.bottom[i];
      const t = groups.top[EDGE_BARS - 1 - i];
      if (b) b.style.transform = h;
      if (t) t.style.transform = h;
    }

    if (orbRef.current) {
      const scale = 1 + Math.min(level, 0.45) * 0.5;
      orbRef.current.style.transform = `scale(${scale.toFixed(3)})`;
      orbRef.current.style.opacity = String(0.6 + Math.min(level, 0.35));
    }
    if (coreRef.current) {
      const s2 = 1 + Math.min(level, 0.5) * 0.14;
      coreRef.current.style.transform = `scale(${s2.toFixed(3)})`;
    }
  }, []);

  /** rAF loop: paints, and returns the live level for the turn detector. */
  const runMeter = useCallback(
    (onLevel) => {
      const analyser = analyserRef.current;
      if (!analyser) return;
      const time = new Uint8Array(analyser.fftSize);

      const tick = () => {
        analyser.getByteTimeDomainData(time);

        // RMS off the time domain — a real loudness measure. Peak alone would
        // trigger on a single click.
        let sum = 0;
        for (let i = 0; i < time.length; i++) {
          const x = (time[i] - 128) / 128;
          sum += x * x;
        }
        const level = Math.sqrt(sum / time.length);

        paint(time, level);
        onLevel?.(level);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    },
    [paint],
  );

  /** Drive the orb from a single level when there is no analyser (live mode). */
  const paintLevel = useCallback(
    (level) => {
      if (orbRef.current) {
        const scale = 1 + Math.min(level * 3, 0.45) * 0.5;
        orbRef.current.style.transform = `scale(${scale.toFixed(3)})`;
        orbRef.current.style.opacity = String(0.6 + Math.min(level * 3, 0.35));
      }
      const groups = barsRef.current;
      const spread = (arr, n) => {
        for (let i = 0; i < n; i++) {
          const taper = 0.2 + 0.8 * Math.sin(((i + 0.5) / n) * Math.PI);
          // A little jitter so a steady tone still looks like speech.
          const h = Math.min(1, Math.max(0.045, level * 3.4 * taper * (0.7 + Math.random() * 0.6)));
          if (arr[i]) arr[i].style.transform = `scaleY(${h.toFixed(3)})`;
        }
      };
      spread(groups.left, BARS);
      spread(groups.right, BARS);
      spread(groups.bottom, EDGE_BARS);
      spread(groups.top, EDGE_BARS);
    },
    [],
  );

  const stopMeter = () => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
  };

  // ─────────────────────── the turn ───────────────────────

  const listen = useCallback(async () => {
    if (closingRef.current) return;
    setError("");
    setPhaseBoth("listening");

    try {
      if (!streamRef.current) {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        // The screen can be closed while the permission prompt is up, and
        // `closingRef` is only checked on the way in. teardown has already
        // run by then and stopped a stream that did not exist yet, so
        // handing this one to the ref leaves the microphone live with
        // nothing left to turn it off: the tab keeps its recording dot.
        if (closingRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
      }
      const ctx = audioContext();
      if (!analyserRef.current) {
        analyserRef.current = ctx.createAnalyser();
        analyserRef.current.fftSize = 1024;
        // Low smoothing on purpose — the default averages frames together and
        // turns a waveform into a slow-breathing blob.
        analyserRef.current.smoothingTimeConstant = 0.55;
      }
      if (!sourceRef.current) {
        sourceRef.current = ctx.createMediaStreamSource(streamRef.current);
      }
      // Mic -> analyser only. Never to the destination, or the room echoes.
      sourceRef.current.connect(analyserRef.current);

      const chunks = [];
      const rec = new MediaRecorder(streamRef.current);
      recorderRef.current = rec;

      let spoke = false;
      let quietSince = 0;
      const startedAt = Date.now();

      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = async () => {
        stopMeter();
        const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
        if (closingRef.current) return;

        if (!spoke || blob.size < VAD.minBytes) {
          // Nothing worth sending — go round again rather than bothering the
          // API with a second of room tone.
          listen();
          return;
        }

        try {
          setPhaseBoth("transcribing");
          const { text } = await saasAiApi.transcribe(blob);
          if (closingRef.current) return;

          // Silence is filtered server-side, so an empty result is normal.
          if (!text) {
            listen();
            return;
          }

          // "Bilal" or "let's go to Bilal" is a handover, not a question.
          const target = matchPersonaCommand(text, personas);
          if (target && target.key !== personaRef.current) {
            switchPersona(target.key, false);
            await speak(target.greeting, target.key);
            return;
          }

          setTurns((prev) => [...prev, { role: "user", text }]);
          setPhaseBoth("thinking");

          const who = personaRef.current;
          const data = await ask(text, who, languageRef.current);
          if (closingRef.current) return;

          cue("answer");
          setRunningTools([]);
          setCardsHidden(false);
          setTurns((prev) => [
            ...prev,
            {
              role: "assistant",
              text: data.answer,
              tools: data.used_tools,
              meta: data.meta,
              persona: personas.find((p) => p.key === (data.persona ?? who)),
            },
          ]);

          await speak(data.answer, data.persona ?? who);
        } catch (e) {
          if (closingRef.current) return;
          setError(e.response?.data?.message || "That did not go through");
          cue("fault");
      setPhaseBoth("error");
        }
      };

      rec.start();
      runMeter((level) => {
        const now = Date.now();
        if (level > VAD.speak) {
          spoke = true;
          quietSince = 0;
          return;
        }
        if (spoke && level < VAD.silence) {
          if (!quietSince) quietSince = now;
          else if (now - quietSince > VAD.hangMs) stopTurn();
          return;
        }
        // Still waiting for a first word.
        if (!spoke && now - startedAt > VAD.patienceMs) stopTurn();
        if (now - startedAt > VAD.maxMs) stopTurn();
      });
    } catch {
      setError("No microphone available, or permission was denied");
      cue("fault");
      setPhaseBoth("error");
    }
  }, [ask, runMeter]);

  const stopTurn = () => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  };

  // ─────────────────────── speaking ───────────────────────

  const speak = useCallback(
    async (text, who) => {
      if (!text) return listen();
      setPhaseBoth("speaking");
      try {
        const blob = await saasAiApi.speak(text, who ?? personaRef.current);
        if (closingRef.current) return;

        const url = URL.createObjectURL(blob);
        if (!audioRef.current) audioRef.current = new Audio();
        const audio = audioRef.current;
        audio.src = url;

        /**
         * The clock the data cards run on.
         *
         * `timeupdate` fires about four times a second, which is finer than
         * anyone can see a card arrive and far cheaper than a frame loop.
         * `duration` is NaN until metadata lands and Infinity for a stream,
         * hence the finite check - dividing by either would send progress to
         * NaN and hold every card back for the whole answer.
         */
        setSpeech(0);
        audio.ontimeupdate = () => {
          const d = audio.duration;
          if (!Number.isFinite(d) || d <= 0) return;
          setSpeech(Math.min(1, audio.currentTime / d));
        };

        // Analyse the OUTPUT too, so the bars move to the answer. A given
        // element can only ever have one MediaElementSource, hence the ref.
        const ctx = audioContext();
        if (!audioSourceRef.current) {
          audioSourceRef.current = ctx.createMediaElementSource(audio);
        }
        if (!analyserRef.current) {
          analyserRef.current = ctx.createAnalyser();
          analyserRef.current.fftSize = 1024;
          analyserRef.current.smoothingTimeConstant = 0.55;
        }
        // Disconnect the mic while it talks, or the bars show both at once.
        try {
          sourceRef.current?.disconnect(analyserRef.current);
        } catch {
          /* not connected — fine */
        }
        audioSourceRef.current.connect(analyserRef.current);
        // Must also reach the speakers: routing an element through Web Audio
        // and stopping at the analyser plays silence.
        audioSourceRef.current.connect(ctx.destination);

        runMeter();

        await new Promise((resolve) => {
          audio.onended = resolve;
          audio.onerror = resolve;
          audio.play().catch(resolve);
        });

        stopMeter();
        audio.ontimeupdate = null;
        // Whatever has not been reached by now is reached: an answer that
        // ended early, or a duration that never resolved, must not leave the
        // last card permanently off screen.
        setSpeech(1);
        URL.revokeObjectURL(url);
        try {
          audioSourceRef.current.disconnect(analyserRef.current);
        } catch {
          /* already gone */
        }
        if (!closingRef.current) listen();
      } catch (e) {
        if (closingRef.current) return;
        setError(e.response?.data?.message || "Could not play the answer");
        cue("fault");
      setPhaseBoth("error");
      }
    },
    [listen, runMeter],
  );

  /**
   * Real-time transport: one socket, audio both ways, the model doing its own
   * turn detection. Falls back to the record-transcribe-speak loop if the
   * session cannot be opened, so a bad key or a blocked WebSocket degrades to
   * something that works rather than to nothing.
   */
  // `restartAs` runs before `startLive` is defined, and a live handover has to
  // reach it; a ref keeps the two from having to be declared in order.
  const startLiveRef = useRef(null);

  const startLive = useCallback(async () => {
    try {
      setError("");
      setPhaseBoth("listening");
      const { ticket, path } = await saasAiApi.liveTicket(
        personaRef.current,
        languageRef.current,
      );
      const origin = API_BASE_URL.replace(/\/api\/?$/, "");

      liveRef.current = await openLiveSession({
        ticket,
        path,
        apiOrigin: origin,
        handlers: {
          // The visualiser reads the same samples being sent upstream, so the
          // bars cannot show something the model is not hearing.
          level: (v) => paintLevel(v),
          said: ({ role, text }) => {
            if (!text?.trim()) return;

            /**
             * Switching by name, in live mode.
             *
             * On the recorded path the transcript reaches us BEFORE the model,
             * so a handover could be intercepted. Here the audio goes straight
             * to Google and we only see what it heard — so the check moves to
             * the user's own transcript, and it has to wait for the whole
             * utterance: fragments stream in, and a fragment reading exactly
             * "Bilal" inside a longer question would otherwise switch agent
             * mid-sentence.
             */
            if (role === "user") {
              heardBufRef.current += text;
              clearTimeout(heardTimerRef.current);
              heardTimerRef.current = setTimeout(() => {
                const utterance = heardBufRef.current;
                heardBufRef.current = "";
                // End of utterance: seal the bubble so the next thing said
                // starts a new one rather than appending to this.
                setTurns((prev) =>
                  prev.map((t, i) =>
                    i === prev.length - 1 && t.role === "user" ? { ...t, streaming: false } : t,
                  ),
                );
                const target = matchPersonaCommand(utterance, personas);
                if (target && target.key !== personaRef.current) {
                  restartAs(target, residualQuestion(utterance, target));
                  return;
                }

                // The utterance is over and the answer has not started. Even
                // with no tool to run there is a real pause here while the
                // model composes, and an idle-looking screen through it is
                // what made the assistant feel unresponsive.
                if (phaseRef.current === "listening") setPhaseBoth("thinking");
              }, 900);
            }
            setTurns((prev) => {
              const last = prev[prev.length - 1];
              // Transcripts stream in fragments; append to the open turn
              // rather than making a new bubble per syllable.
              if (last && last.role === role && last.streaming) {
                const merged = [...prev];
                merged[merged.length - 1] = { ...last, text: last.text + text };
                return merged;
              }
              return [
                ...prev,
                {
                  role,
                  text,
                  streaming: true,
                  persona: personas.find((p) => p.key === personaRef.current),
                },
              ];
            });
            setPhaseBoth(role === "assistant" ? "speaking" : "listening");
          },
          turnComplete: () => {
            setTurns((prev) =>
              prev.map((t, i) => (i === prev.length - 1 ? { ...t, streaming: false } : t)),
            );
            setPhaseBoth("listening");
          },
          // Tools are running upstream. This is the only honest signal the
          // live path has that work is happening: between the question and
          // the answer there is nothing but silence on the wire.
          working: (tools) => {
            setRunningTools(tools);
            if (tools.length) cue("tool");
            setPhaseBoth(tools.length ? "thinking" : "listening");
          },
          // The model was asked to work the screen and did it, rather than
          // explaining which button to press.
          screen: ({ action, language: lang }) => {
            if (action === "clear_log") setTurns([]);
            else if (action === "hide_cards") setCardsHidden(true);
            else if (action === "set_language" && lang) chooseLanguage(lang);
            cue("reveal");
          },
          interrupted: () => setPhaseBoth("listening"),
          // The model decided to hand over. It understands "I want to talk to
          // Ayesha" in any phrasing and any language, which is why this is the
          // reliable path and the transcript matcher is only a fast one.
          // The model was asked to end the call and called the tool for it.
          closeRequested: () => requestClose(),
          switch: ({ persona: key, question }) => {
            const target = personas.find((p) => p.key === key);
            if (target && target.key !== personaRef.current) {
              restartAs(target, question);
            }
          },
          error: (message) => {
            setError(message);
            cue("fault");
      setPhaseBoth("error");
          },
        },
      });
    } catch (e) {
      // Degrade rather than dead-end.
      setError(
        (e.response?.data?.message || e.message || "Live voice could not start") +
          ". Using the standard voice instead.",
      );
      liveRef.current = null;
      listen();
    }
  }, [listen, personas]);

  startLiveRef.current = startLive;

  /**
   * Hand over to another persona in live mode.
   *
   * The Live API fixes the system prompt, the tool list and the voice at
   * session setup — none of it can change on an open socket — so a handover is
   * a reconnect. The new session is then asked to introduce itself, which is
   * what makes the switch audible rather than just visible.
   */
  /**
   * What has been said so far, for whoever is taking over.
   *
   * A live session starts blank: its prompt is fixed at setup and it has no
   * memory of a conversation it was not part of. So the colleague used to
   * arrive knowing nothing, which is exactly why they introduced themselves
   * and asked what was needed - the admin had to say it all again.
   *
   * The last few turns are enough. The whole thread would cost more of the
   * context window than it is worth and would bury the question they are
   * actually being handed.
   */
  const recapFor = useCallback((turnList) => {
    const lines = turnList
      .filter((t) => t.text && t.text.trim())
      .slice(-6)
      .map((t) => {
        const who = t.role === "user" ? "Admin" : t.persona?.name || "Colleague";
        // One line each: a transcript with newlines in it reads as several
        // turns and the model answers the wrong one.
        return `${who}: ${t.text.replace(/\s+/g, " ").slice(0, 400)}`;
      });
    return lines.join("\n");
  }, []);

  const restartAs = useCallback(
    async (target, question) => {
      if (closingRef.current) return;
      // A reconnect takes a moment. Without this the screen sits on the old
      // persona in silence and the handover looks like it failed.
      cue("handover");
      setSwitchingTo(target);
      liveRef.current?.stop();
      liveRef.current = null;
      personaRef.current = target.key;
      setPersona(target.key);
      // The greeting used to be pushed into the log here, so every handover
      // put "Omar here, I can give you the whole picture" in front of the
      // admin before anything was answered. Whoever takes over now speaks
      // for themselves, and what they say is an answer.
      const recap = recapFor(turnsRef.current);
      try {
        await startLiveRef.current?.();
      } finally {
        setSwitchingTo(null);
      }

      // "Ask Bilal what is overdue" is a handover AND a question. Dropping the
      // question would make the user say it twice; carrying it is what makes
      // this an assistant rather than a switchboard.
      /**
       * Primed, not introduced.
       *
       * The recap goes first so the question is read in its light, and the
       * instruction is explicit about not introducing himself: a model handed
       * a conversation will otherwise open with who it is, which is the one
       * thing the admin already knows and the thing they have heard on every
       * previous handover.
       */
      liveRef.current?.sendText(
        [
          "You are continuing a conversation that is already under way.",
          recap ? `What has been said so far:\n${recap}` : "",
          question
            ? `The admin now wants to know: ${question}`
            : "Pick up from the last thing said and carry on.",
          "Answer it. Do not introduce yourself, do not say your name, and do not " +
            "list what you can help with.",
        ]
          .filter(Boolean)
          .join("\n\n"),
      );
    },
    [recapFor],
  );

  /**
   * Change who is answering.
   *
   * `announce` is false when the switch came from something already speaking
   * (a voice handover says the greeting itself) and true from a rail click,
   * where hearing the new voice is the confirmation that it worked.
   */
  const switchPersona = (key, announce) => {
    const who = personas.find((p) => p.key === key);
    setError("");

    // In live mode a switch is a reconnect, not a state change.
    if (live && who) {
      void restartAs(who);
      return;
    }

    personaRef.current = key;
    setPersona(key);
    if (!announce || !who) return;

    audioRef.current?.pause();
    // Hearing the new voice is what confirms the click worked, so something
    // has to be said. Mid-conversation that is an offer to carry on, not the
    // full "I am X and here is what I do" - which is what made every switch
    // feel like starting again.
    // Just the name once the conversation is under way. It confirms the
    // voice, and a name is the same word in every language this panel is
    // spoken to in - a canned English line would not be.
    const started = turnsRef.current.some((t) => t.text && t.text.trim());
    speak(started ? who.name : who.greeting, key);
  };

  /**
   * Change the conversation language.
   *
   * A live session fixes its prompt at setup, so this is a reconnect for the
   * same reason a handover is. The persona does not change, so there is no
   * greeting: the session simply comes back speaking the other language.
   */
  const chooseLanguage = useCallback(
    async (code) => {
      if (code === languageRef.current) return;
      languageRef.current = code;
      setLanguage(code);
      try {
        localStorage.setItem("saas_ai_language", code);
      } catch {
        // Not worth failing a language change over.
      }
      if (!live || !liveRef.current || closingRef.current) return;
      liveRef.current.stop();
      liveRef.current = null;
      await startLiveRef.current?.();
    },
    [live],
  );

  /** The current persona's standing question, asked on their behalf. */
  const briefMe = async () => {
    const who = personas.find((p) => p.key === personaRef.current);
    if (!who?.briefing || closingRef.current) return;
    try {
      setError("");
      setTurns((prev) => [...prev, { role: "user", text: "Brief me" }]);
      setPhaseBoth("thinking");
      const data = await ask(who.briefing, who.key, languageRef.current);
      if (closingRef.current) return;
      cue("answer");
      setRunningTools([]);
      setCardsHidden(false);
      setTurns((prev) => [
        ...prev,
        {
          role: "assistant",
          text: data.answer,
          tools: data.used_tools,
          meta: data.meta,
          persona: who,
        },
      ]);
      await speak(data.answer, who.key);
    } catch (e) {
      if (closingRef.current) return;
      setError(e.response?.data?.message || "Could not put that briefing together");
      cue("fault");
      setPhaseBoth("error");
    }
  };

  /**
   * Follow the newest line, unless the reader has gone looking.
   *
   * Pinning to the bottom on every turn is right while someone is watching
   * the conversation happen, and wrong the moment they scroll up to read
   * something: a live transcript that yanks itself back down cannot be read
   * at all. So it follows only while it is ALREADY at the bottom, and the
   * check runs before the new turn is painted, because afterwards everything
   * looks scrolled up by exactly the height of what just arrived.
   */
  const followingRef = useRef(true);
  useLayoutEffect(() => {
    const el = transcriptRef.current;
    if (!el) return;
    // 24px of slack: a reader who is a line from the bottom meant to be at
    // the bottom, and sub-pixel heights rarely land on an exact zero.
    followingRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= 24;
  });

  useEffect(() => {
    const el = transcriptRef.current;
    if (el && followingRef.current) el.scrollTop = el.scrollHeight;
  }, [turns]);

  /**
   * Close, after the screen has had time to shrink away.
   *
   * Everything that closes goes through here — the button, Escape, and the
   * agent's own end_conversation — so none of them can skip the animation.
   */
  const requestClose = useCallback(() => {
    // Costly layers off for the shrink as well as for the grow.
    setBusy(true);
    setExiting((already) => {
      if (already) return already;
      setTimeout(onClose, EXIT_MS);
      return true;
    });
  }, [onClose]);

  /** Tap while it talks to cut in; tap after an error to try again. */
  const interrupt = () => {
    if (phaseRef.current === "speaking") {
      audioRef.current?.pause();
      stopMeter();
      listen();
    } else if (phaseRef.current === "listening") {
      stopTurn();
    } else if (phaseRef.current === "error" || phaseRef.current === "idle") {
      listen();
    }
  };

  // ─────────────────────── lifecycle ───────────────────────

  const teardown = useCallback(() => {
    closingRef.current = true;
    clearTimeout(heardTimerRef.current);
    liveRef.current?.stop();
    liveRef.current = null;
    stopMeter();
    try {
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    } catch {
      /* already stopped */
    }
    audioRef.current?.pause();
    // Release the microphone: the browser keeps the recording indicator in the
    // tab until every track is stopped, which looks like we are still listening.
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    sourceRef.current = null;
    audioSourceRef.current = null;
    analyserRef.current = null;
    if (ctxRef.current && ctxRef.current.state !== "closed") {
      ctxRef.current.close().catch(() => {});
    }
    ctxRef.current = null;
    audioRef.current = null;
    cue("shutdown");
    // Give the goodbye its moment before the device goes.
    setTimeout(releaseSound, 400);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    closingRef.current = false;
    setTurns([]);
    setError("");
    personaRef.current = personas[0]?.key ?? "chief";
    setPersona(personaRef.current);
    cue("boot");
    setExiting(false);

    setBusy(true);

    /**
     * The mic and the socket start AFTER the entrance, not with it.
     *
     * `getUserMedia` blocks the main thread while the OS enumerates audio
     * devices, and a WebSocket handshake plus the first React render of a
     * live session land in the same few frames. Doing that while the screen
     * is still growing is the other half of the hitch: the transform itself
     * is on the compositor, but the canvas, the waveform and every React
     * update freeze, and a frozen screen mid-animation reads as a crash.
     *
     * A quarter of a second later nobody has finished saying "hey" yet.
     */
    const settle = setTimeout(() => setBusy(false), OPEN_MS);
    const begin = setTimeout(() => {
      if (live) startLive();
      else listen();
    }, OPEN_MS);

    return () => {
      clearTimeout(settle);
      clearTimeout(begin);
      teardown();
    };
    // `listen` is stable enough for this; re-running on it would restart the mic.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Escape closes, as it does for every other overlay in the panel.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && requestClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, requestClose]);

  /**
   * Asking about a domain brings that agent's figures forward.
   *
   * "Show me today's traffic" should put Sana's dashboard on screen without
   * the admin having to find her first. Only on a question that names a
   * subject: `agentForQuestion` returns null when nothing matches, because
   * guessing and opening the wrong dashboard is worse than opening none.
   *
   * Every hook on this component lives ABOVE `if (!open) return null`. React
   * matches hooks by call ORDER, so one below that line is not called while
   * the screen is closed, and the render where it opens then calls more hooks
   * than the one before it - a hard crash, not a warning. Two were added
   * below it once and took the whole panel down to its error boundary on the
   * first press of the mic.
   */
  const lastAsked = turns.filter((t) => t.role === "user").slice(-1)[0]?.text ?? "";
  useEffect(() => {
    if (!open || !lastAsked) return;
    const want = agentForQuestion(lastAsked);
    if (want) setSelectedAgent(want);
  }, [lastAsked, open]);

  if (!open) return null;

  const status = STATUS[phase] ?? STATUS.idle;

  /*
   * WHAT THE SCREEN SAYS WHILE IT WORKS.
   *
   * "Looking it up" holding still for twenty seconds is the thing that reads
   * as a crash. Three facts fix it, and none needs new plumbing: the tool
   * actually running, the seconds elapsed, and - once the wait is long
   * enough to doubt - an explicit reassurance that it is still going.
   */
  const waitedSec = Math.floor(waitedMs / 1000);
  const slow = waitedMs >= WAIT_SLOW_MS;
  const toolNow = runningTools[runningTools.length - 1];
  const workLabel = switchingTo
    ? `Handing over to ${switchingTo.name}\u2026`
    : phase !== "thinking"
      ? status.label
      : TOOL_WORK[toolNow] ??
        (slow ? "Still working on it\u2026" : status.label);
  const active = phase === "listening" || phase === "speaking";


  // No audio flows while it thinks, so the bars would freeze flat. A pulse is
  // clearly a loading state rather than a pretend waveform.
  const thinking = phase === "thinking" || phase === "transcribing";

  const who = personas.find((p) => p.key === persona) ?? personas[0];
  const theme = themeFor(who?.accent);
  const brain = brainBoxSize(vp.w, vp.h);

  const StatusIcon = thinking
    ? Loader2
    : phase === "speaking"
      ? Volume2
      : phase === "error"
        ? RotateCcw
        : Mic;

  /** A strip of bars. `group` decides which slot in the registry it fills. */
  /**
   * What the waveform box shows while it is thinking.
   *
   * The bars are driven by microphone and speaker energy, and during a tool
   * run there is neither, so they sit flat — the one moment the screen most
   * needs to look alive is the one moment they say nothing. This occupies the
   * same box, so nothing moves when it swaps in.
   */
  const NeuralTrace = ({ flip }) => (
    <svg
      viewBox="0 0 200 112"
      preserveAspectRatio="none"
      aria-hidden="true"
      className={`w-full h-full ${flip ? '-scale-x-100' : ''}`}
      style={{ color: `rgb(${theme.rim})` }}
    >
      <path
        d={TRACE}
        pathLength="100"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        className="opacity-20"
      />
      <path
        d={TRACE}
        pathLength="100"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        className="neural-trace"
      />
    </svg>
  );

  /**
   * The orb's look is fixed. Only its tempo moves.
   *
   * It used to change appearance with state: the sweep and the spin
   * appeared and vanished, the mesh thickened and brightened while
   * thinking. That made it a different object in each state instead of one
   * object doing something. Everything is on all the time now, and thinking
   * simply winds it up.
   */
  const tempo = thinking
    ? { mesh: 12, sweep: 3.2, pulse: 1.1, edge: 1.1, node: 1.3 }
    : phase === "speaking"
      ? { mesh: 26, sweep: 6, pulse: 1.9, edge: 2.2, node: 2.6 }
      : { mesh: 54, sweep: 11, pulse: 3.2, edge: 3.6, node: 4.2 };

  /**
   * One side of the signal.
   *
   * Both sides are the same component so they can never drift apart: the
   * bars and the trace swap on the same condition, at the same height, and
   * only `flip` differs. The pair runs outward from the status pill between
   * them, which is what makes it read as one waveform with a label in the
   * middle rather than two strips either side of a button.
   */
  const SignalHalf = ({ group, flip }) => (
    <div className="flex-1 min-w-0 h-full">
      {thinking ? (
        <NeuralTrace flip={flip} />
      ) : (
        <Strip
          group={group}
          count={BARS}
          origin="center"
          className={`h-full gap-[3px] items-center ${flip ? "justify-end" : "justify-start"}`}
          barClass="w-[3px] h-full"
        />
      )}
    </div>
  );

  const Strip = ({ group, count, className, barClass, origin }) => (
    <div className={`flex items-end ${className}`} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          ref={(el) => {
            barsRef.current[group][i] = el;
          }}
          className={`${barClass} rounded-full bg-gradient-to-t ${theme.bar} ${
            thinking ? "animate-pulse" : ""
          }`}
          style={{ transform: "scaleY(0.04)", transformOrigin: origin }}
        />
      ))}
    </div>
  );

  /**
   * A HUD panel: a labelled box with a tick rule and corner marks.
   *
   * The label is part of the frame rather than a heading inside it, which is
   * what stops a screen of panels reading as a screen of cards.
   */
  const Panel = ({ label, right, className = "", bodyClass = "", bodyRef, children }) => (
    <section
      className={`relative min-h-0 border border-white/10 bg-white/[0.025] backdrop-blur-xl ${className}`}
    >
      <header className="flex items-center gap-2 h-6 px-2 border-b border-white/10">
        <span className="font-mono text-[9.5px] tracking-[0.18em] text-gray-500">
          {label}
        </span>
        <span className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
        {right}
      </header>
      {/* The body is the scrolling box, so anything that wants to scroll it
          has to hold THIS element. A ref on a wrapper inside would be a node
          with no overflow of its own and scrollTop would silently do
          nothing. */}
      <div ref={bodyRef} className={`min-h-0 ${bodyClass}`}>
        {children}
      </div>
      {/* Bracketed corners. A 1px rectangle is a card; a rectangle with its
          corners drawn separately is a frame, and that difference is most of
          what separates an instrument from a dialog. */}
      {["top-0 left-0 border-l border-t", "top-0 right-0 border-r border-t",
        "bottom-0 left-0 border-l border-b", "bottom-0 right-0 border-r border-b",
      ].map((corner) => (
        <span
          key={corner}
          aria-hidden="true"
          className={`absolute w-2 h-2 border-white/30 pointer-events-none ${corner}`}
        />
      ))}
    </section>
  );

  /** Abstract tick marks. Decoration, and carrying no figure on purpose. */
  const Ticks = ({ count = 14, className = "" }) => (
    <span className={`flex items-end gap-[3px] h-2.5 ${className}`} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          className="w-px bg-white/20"
          style={{ height: `${i % 4 === 0 ? 100 : i % 2 === 0 ? 60 : 35}%` }}
        />
      ))}
    </span>
  );

  /**
   * The answer the cards are read from: the most recent SETTLED one.
   *
   * It must be settled. In live mode a turn is appended chunk by chunk, and
   * the cards are derived from its text — so reading a half-finished turn
   * rebuilt them on every chunk: the headline changed as more of the first
   * sentence arrived, a chart appeared only once its table closed, and each
   * card that appeared pushed the others into different berths. Cards jumped
   * corners and vanished mid-answer, which is exactly what it looked like.
   *
   * On the recorded path a turn is pushed complete and has no streaming
   * flag, so it qualifies at once.
   *
   * If `turnComplete` never arrives the cards simply do not appear for that
   * answer. The log still shows every word of it, so the failure costs the
   * reading of the answer, never the answer.
   */
  /**
   * The answer the cards are built from.
   *
   * Streaming turns included now. They used to be excluded because deriving
   * the cards from a half-arrived answer made them flicker in and out; the
   * overlay accumulates instead of recomputing, so the live path can show a
   * table the moment it is spoken without that happening.
   */
  const latest = [...turns].reverse().find((t) => t.role === "assistant");

  return (
    <div
      className={`fixed inset-0 z-50 overflow-hidden select-none ${
        exiting ? "vc-close" : "vc-open"
      } ${busy ? "vc-busy" : ""} vc-light`}
      style={
        origin
          ? {
              transformOrigin: `${(origin.fx * 100).toFixed(2)}% ${(
                origin.fy * 100
              ).toFixed(2)}%`,
            }
          : undefined
      }
    >
      {/* ── backdrop ──
          Opaque, and TINTED BY THE ACTIVE PERSONA. A near-black screen with a
          coloured chip in the corner made switching agent a detail; letting
          the room change colour makes it the event it should be. */}
      {/* The surface. Light, with the faintest wash of the active
          persona's colour so switching agent is still felt. */}
      <div className="absolute inset-0 vc-surface" />

      {/* The brain, top right.

          It used to be the background, drifting behind every panel and every
          figure on the screen. As one framed object it is something being
          LOOKED at - an instrument showing the agent working - rather than
          wallpaper that happens to move, and the rest of the screen is left
          to the orb and the data.

          Not mounted until the screen has stopped moving: a canvas redrawing
          a mesh every frame inside a scaling ancestor is paying for a picture
          that is being resampled anyway. */}
      {!busy && (
        <figure
          className="hud-pop absolute z-20 border border-white/10 vc-panel pointer-events-none"
          style={{
            top: `calc(2.25rem + ${BRAIN_MARGIN}px)`,
            right: BRAIN_MARGIN,
            width: brain.w,
            height: brain.h + 14,
            "--pop-ry": "-6deg",
            animationDelay: "120ms",
          }}
        >
          <figcaption className="h-[14px] px-1.5 flex items-center font-mono text-[8px] tracking-[0.2em] text-gray-500">
            {thinking ? "PROCESSING" : phase === "speaking" ? "RESPONDING" : "IDLE"}
          </figcaption>
          <div className="w-full" style={{ height: brain.h }}>
            <NeuronField active={thinking || phase === "speaking"} rim={theme.ink} />
          </div>
        </figure>
      )}

      {/* ══ the core's own readout, directly under the portrait ══

          One headline figure per agent, so choosing one is an informed click
          rather than a guess. It hangs off the bottom of the brain box as a
          right-hand column: the middle of this screen is the orb's, and it
          has been pushed off it once already.

          Hidden while a dashboard is open, because that dashboard says
          everything this does and in more detail. */}
      {!busy && !selectedAgent && (
        <div
          className="hud-in absolute z-20 hidden sm:block pointer-events-auto"
          style={{
            top: `calc(2.25rem + ${BRAIN_MARGIN * 2 + 14}px + ${brain.h}px)`,
            right: BRAIN_MARGIN,
            width: Math.max(brain.w, 168),
          }}
        >
          <SystemOverview
            agents={AGENTS}
            metrics={sim.metrics}
            states={sim.states}
            changed={sim.changed}
            stacked
            onSelect={setSelectedAgent}
          />
        </div>
      )}

      {/* A pane of glass over the field. Translucent rather than blurred: the
          canvas repaints every frame, so a backdrop-filter here would re-blur
          the whole viewport sixty times a second. */}
      <div className="absolute inset-0 vc-surface-veil pointer-events-none" />

      {/* Scanlines. Low enough to read as a screen, not as a fault. */}
      <div
        className="absolute inset-0 opacity-[0.3] pointer-events-none"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, rgba(255,255,255,0.025) 0px, rgba(255,255,255,0.025) 1px, transparent 1px, transparent 3px)",
        }}
      />
      <div
        className="absolute inset-0 transition-[background] duration-700 pointer-events-none"
        style={{
          background:
            `radial-gradient(900px 600px at 50% 42%, rgba(${theme.glow},0.13), transparent 68%),` +
            `radial-gradient(700px 500px at 6% 94%, rgba(${theme.glow},0.07), transparent 70%)`,
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            // Was a near-black vignette, which on a light surface reads as
            // a dirty smudge. White, so the edges fall away instead.
            "radial-gradient(130% 95% at 50% 45%, transparent 46%, rgba(248,250,252,0.92) 100%)",
        }}
      />

      {/* The signal frames the screen behind the chrome. */}
      <Strip
        group="top"
        count={EDGE_BARS}
        origin="top"
        className="vc-strip absolute top-0 inset-x-0 h-10 gap-[2px] px-2 opacity-20 pointer-events-none"
        barClass="flex-1 h-full"
      />
      <Strip
        group="bottom"
        count={EDGE_BARS}
        origin="bottom"
        className="vc-strip absolute bottom-0 inset-x-0 h-10 gap-[2px] px-2 opacity-25 pointer-events-none"
        barClass="flex-1 h-full"
      />

      {/* Findings arrive here: over the scene, never in it. */}
      <AnswerOverlay
        hidden={cardsHidden}
        turn={latest}
        tools={runningTools}
        thinking={thinking}
        accent={theme.rim}
        progress={speech}
      />

      <div className="relative z-10 h-full flex flex-col">
        {/* ══ top rail ══ */}
        <header className="shrink-0 h-9 flex items-center gap-2.5 px-3 border-b border-white/10 bg-white/[0.03] backdrop-blur-xl">
          <span className={`w-1.5 h-1.5 rounded-full ${theme.badge}`} />
          <span className="font-mono text-[10px] tracking-[0.22em] text-gray-400">
            JGASFLOW
          </span>
          <span className="hidden sm:inline font-mono text-[10px] tracking-[0.22em] text-gray-600">
            PLATFORM ASSISTANT
          </span>
          <Ticks className="hidden md:flex opacity-60" />

          <span className="flex-1" />

          <span className="hidden sm:flex items-center gap-2 min-w-0">
            <span
              className={`font-mono text-[10px] tracking-[0.18em] truncate ${theme.name}`}
            >
              {(who?.name ?? "").toUpperCase()}
            </span>
            <span className="h-3 w-px bg-white/15" />
            <span className="font-mono text-[10px] tracking-[0.18em] text-gray-600 truncate">
              {(who?.role ?? "").toUpperCase()}
            </span>
          </span>

          <button
            onClick={() => {
              const next = !muted;
              setMuted(next);
              setMutedState(next);
              // Unmuting with silence is indistinguishable from a broken
              // toggle, so it confirms itself.
              if (!next) cue("reveal");
            }}
            title={muted ? "Interface sounds off" : "Interface sounds on"}
            aria-pressed={!muted}
            className="shrink-0 w-6 h-6 grid place-items-center rounded border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={requestClose}
            title="Close (Esc)"
            className="shrink-0 w-6 h-6 grid place-items-center rounded border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </header>

        {/* ══ body ══ */}
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-2 p-2">
          {/* ── left rail ── */}
          <HudReveal when delay={60} from="left" className="shrink-0 w-full lg:w-[200px] lg:h-full min-h-0">
          <nav className="w-full h-full min-h-0 flex flex-row lg:flex-col gap-2 overflow-x-auto lg:overflow-visible scrollbar-none">
            <Panel
              label="LANG"
              className="shrink-0 lg:w-full"
              bodyClass="flex items-center gap-1 p-1"
            >
              {LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  onClick={() => chooseLanguage(l.code)}
                  title={`Speak and write ${l.title}`}
                  aria-pressed={language === l.code}
                  className={`flex-1 px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                    language === l.code
                      ? "bg-white/15 text-white"
                      : "text-gray-400 hover:text-gray-200"
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </Panel>

            <Panel
              label="AGENTS"
              className="shrink-0 lg:w-full"
              bodyClass="relative flex flex-row lg:flex-col gap-1 p-1"
            >
              {personas.map((p) => {
                const on = p.key === persona;
                const t = themeFor(p.accent);
                const Glyph = ICONS[p.icon] ?? Sparkles;
                return (
                  <button
                    key={p.key}
                    onClick={() => switchPersona(p.key, true)}
                    title={`${p.name} · ${p.role}`}
                    className={`group relative flex items-center gap-1.5 pl-1 pr-2 py-1 rounded border transition-all duration-300 ${
                      on
                        ? `border-white/20 bg-gradient-to-r ${t.card} to-white/[0.03]`
                        : "border-transparent hover:bg-white/[0.06]"
                    }`}
                  >
                    {/* The active mark is a bar on the edge, not a ring round
                        the whole chip: in a list, an edge mark is read at a
                        glance and a ring has to be compared. */}
                    <span
                      className={`absolute left-0 inset-y-1 w-0.5 rounded-full transition-opacity ${t.badge} ${
                        on ? "opacity-100" : "opacity-0"
                      }`}
                    />
                    <span
                      className={`relative shrink-0 w-5 h-5 rounded grid place-items-center text-white transition-transform duration-300 ${t.badge} ${
                        on ? "scale-105" : "opacity-75 group-hover:opacity-100"
                      }`}
                    >
                      <Glyph className="w-3 h-3" />
                      {(AGENT_STATE[sim.states[p.key]] ?? AGENT_STATE.idle).live && (
                        <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                      )}
                    </span>
                    <span className="text-left leading-tight">
                      <span
                        className={`block text-[11.5px] font-medium ${
                          on ? "text-white" : "text-gray-300"
                        }`}
                      >
                        {p.name}
                      </span>
                      {/* The role, until there is something more useful to
                          say. A row that always carries a state word trains
                          the eye to skip it, and then the one that matters
                          is not read either. */}
                      <span className="block text-[9.5px] leading-tight text-gray-500">
                        {AGENT_STATE[sim.states[p.key]]?.word ? (
                          <span
                            className={`font-mono tracking-wide ${
                              sim.states[p.key] === "error"
                                ? "text-rose-300"
                                : "text-primary-300"
                            }`}
                          >
                            {AGENT_STATE[sim.states[p.key]].word.toUpperCase()}
                          </span>
                        ) : (
                          p.role
                        )}
                      </span>
                    </span>
                  </button>
                );
              })}

            </Panel>

            <button
              onClick={() => briefMe()}
              disabled={thinking || phase === "speaking"}
              className="shrink-0 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded border border-white/10 bg-white/[0.04] text-[11.5px] font-medium text-gray-300 hover:bg-white/10 disabled:opacity-40 transition-colors"
            >
              <Sparkles className="w-3 h-3" />
              Brief me
            </button>

            <p className="hidden lg:block mt-auto font-mono text-[9.5px] leading-snug tracking-wide text-gray-600">
              SAY A NAME TO SWITCH
            </p>

            {/* The log lives here now rather than in a column of its own.
                It takes whatever height the rail has left, which is what
                makes it a log rather than a panel: it grows into the space
                instead of reserving it. Moving it off the right also gives
                the findings that side of the screen back. */}
          <Panel
            label="LOG"
            className="flex-1 min-h-0 flex flex-col"
            bodyClass="flex-1 overflow-y-auto scrollbar-none p-2 space-y-2"
            bodyRef={transcriptRef}
            right={
              turns.length > 0 ? (
                <button
                  onClick={() => setTurns([])}
                  className="font-mono text-[9.5px] tracking-[0.18em] text-gray-600 hover:text-gray-300"
                >
                  CLEAR
                </button>
              ) : null
            }
          >
            <>
              {/* Until there is a conversation, the log carries what the
                  agents have been reporting. "NO TRAFFIC" was accurate and
                  useless: the screen was busy and the one panel that could
                  have said why was empty.

                  Each entry is ONE agent reporting its own domain - there is
                  no "from X to Y" here, because nothing goes between them.
                  Clicking one opens that agent's dashboard. */}
              {turns.length === 0 && (
                <ActivityFeed entries={sim.activity} onSelect={setSelectedAgent} />
              )}
              {turns.map((t, i) =>
                t.role === "user" ? (
                  <div key={i} className="flex justify-end">
                    <p
                      dir="auto"
                      className="max-w-[92%] rounded border border-white/10 bg-white/[0.07] px-2 py-1.5 text-[12px] leading-relaxed text-gray-100"
                    >
                      {t.text}
                    </p>
                  </div>
                ) : (
                  <div key={i} className="space-y-1">
                    <p className="font-mono text-[9.5px] tracking-[0.16em] text-gray-600">
                      {(t.persona?.name ?? "ASSISTANT").toUpperCase()}
                    </p>
                    <div
                      dir="auto"
                      className="rounded border-l-2 border-white/15 bg-white/[0.03] pl-2 pr-2 py-1.5 text-gray-200"
                    >
                      <MarkdownMessage text={t.text} tone="dark" />
                    </div>
                  </div>
                ),
              )}
            </>
          </Panel>
          </nav>
          </HudReveal>

          {/* ── centre ──
              The orb is centred on the VIEWPORT, not on this column: with a
              rail one side and a log the other, a column centre sits well
              left of the middle of the screen, and the orb is the thing the
              screen is built around. The layer takes no pointer events, so
              the rails either side stay clickable underneath it. */}
          <main className="relative flex-1 min-h-0 min-w-0">
            {/* Vertical scales down both edges of the stage. The references
                are dense to the margins and this screen was not; these fill
                it without inventing anything, because a scale with no units
                measures nothing and claims nothing. */}
            {["left-0", "right-0"].map((side) => (
              <span
                key={side}
                aria-hidden="true"
                className={`absolute ${side} top-8 bottom-8 w-3 hidden lg:flex flex-col justify-between items-${side === "left-0" ? "start" : "end"} pointer-events-none`}
              >
                {Array.from({ length: 26 }).map((_, i) => (
                  <span
                    key={i}
                    className="h-px bg-white/20"
                    style={{ width: i % 5 === 0 ? "100%" : i % 2 === 0 ? "55%" : "30%" }}
                  />
                ))}
              </span>
            ))}

            {/* `overflow-hidden` is load-bearing. `min-h-0` lets this band
                shrink below the orb, and with `items-center` the overflow
                goes BOTH ways: at a short viewport the orb’s box pushed up
                into the agent list, and since the orb is a button, its
                invisible outer ring swallowed clicks on the chips. */}
            {/* ══ one agent's dashboard, when one is picked ══

                It REPLACES the core rather than sharing the middle with it.
                The orb has been pushed off centre by a neighbour before and
                it is not a mistake worth repeating; and picking an agent is
                a request to look at that agent's domain, not to look at both.
                Clearing the selection brings the orb straight back. */}
            {selectedAgent && (
              <div className="fixed inset-0 z-10 flex items-stretch justify-center px-3 pt-12 pb-28 lg:pl-[17.5rem] pointer-events-none">
                <div className="w-full max-w-3xl pointer-events-auto">
                  <AgentDashboard
                    agent={AGENT_BY_KEY[selectedAgent]}
                    metrics={sim.metrics[selectedAgent]}
                    charts={sim.charts[selectedAgent]}
                    moved={sim.changed[selectedAgent] ?? []}
                    state={sim.states[selectedAgent]}
                    onClose={() => setSelectedAgent(null)}
                  />
                </div>
              </div>
            )}

            {/* `overflow-hidden` is load-bearing. `min-h-0` lets this band
                shrink below the orb, and with `items-center` the overflow
                goes BOTH ways. */}
            <div
              className={`fixed inset-0 z-10 grid place-items-center pointer-events-none [&>*]:pointer-events-auto transition-opacity duration-300 ${
                selectedAgent ? "opacity-0 pointer-events-none" : "opacity-100"
              }`}
            >
              {/* The orb inside its scale. The ring is sized off the band so
                  it grows with the space rather than at fixed breakpoints,
                  and it is `pointer-events-none` throughout: it is an
                  instrument face, and the only thing here you can press is
                  the orb at its centre.

                  The four agents sit OUTSIDE this box, at the compass points,
                  each with one line to the core. Nothing joins two agents:
                  they are independent monitors and the only traffic is each
                  one reporting its own domain inward. */}
              <div className="relative shrink-0 grid place-items-center w-[clamp(220px,46vmin,420px)] h-[clamp(220px,46vmin,420px)]">
                <AgentNetwork
                  agents={AGENTS}
                  states={sim.states}
                  selected={selectedAgent}
                  speaking={persona}
                  headlines={Object.fromEntries(
                    AGENTS.map((a) => [a.key, headline(sim.metrics, a.key)]),
                  )}
                  onSelect={setSelectedAgent}
                />
                <svg
                  viewBox="0 0 400 400"
                  aria-hidden="true"
                  className="absolute inset-0 w-full h-full pointer-events-none"
                  style={{ color: `rgb(${theme.rim})` }}
                >
                  {/* graduated scale */}
                  <g stroke="currentColor" strokeLinecap="round">
                    {DIAL.ticks.map((t, i) => (
                      <line
                        key={i}
                        x1={t.x1}
                        y1={t.y1}
                        x2={t.x2}
                        y2={t.y2}
                        strokeWidth={t.long ? 1.4 : 0.7}
                        opacity={t.long ? 0.5 : 0.25}
                      />
                    ))}
                  </g>

                  {/* the segmented gauge */}
                  <g stroke="currentColor" strokeLinecap="round" strokeWidth="2.4">
                    {DIAL.segs.map((s, i) => (
                      <line
                        key={i}
                        x1={s.x1}
                        y1={s.y1}
                        x2={s.x2}
                        y2={s.y2}
                        opacity={s.lit ? 0.75 : 0.14}
                      />
                    ))}
                  </g>

                  {/* two sweeps, counter-rotating so the cluster never looks
                      like one object spinning */}
                  <g
                    className="animate-spin"
                    style={{
                      transformOrigin: "200px 200px",
                      animationDuration: `${tempo.sweep * 2.4}s`,
                    }}
                  >
                    {DIAL.sweepA.map((d, i) => (
                      <path
                        key={i}
                        d={d}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        opacity="0.55"
                      />
                    ))}
                  </g>
                  <g
                    className="animate-spin"
                    style={{
                      transformOrigin: "200px 200px",
                      animationDuration: `${tempo.sweep * 3.6}s`,
                      animationDirection: "reverse",
                    }}
                  >
                    {DIAL.sweepB.map((d, i) => (
                      <path
                        key={i}
                        d={d}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        opacity="0.3"
                      />
                    ))}
                  </g>

                  {/* a still outer frame, so the motion has something to be
                      measured against */}
                  <g stroke="currentColor" fill="none" strokeLinecap="round">
                    {DIAL.brackets.map((d, i) => (
                      <path key={i} d={d} strokeWidth="1.2" opacity="0.4" />
                    ))}
                    {DIAL.crosshairs.map((c, i) => (
                      <line
                        key={i}
                        x1={c.x1}
                        y1={c.y1}
                        x2={c.x2}
                        y2={c.y2}
                        strokeWidth="1"
                        opacity="0.45"
                      />
                    ))}
                  </g>
                </svg>

              <button
                onClick={interrupt}
                title={phase === "speaking" ? "Tap to interrupt" : "Tap to send now"}
                className="relative shrink-0 w-[42%] h-[42%] rounded-full grid place-items-center"
              >
                {/* Range arcs, masked to the band level with the orb so they
                    read as instrument arcs rather than circles drawn over the
                    screen. */}
                {[1.35, 1.85].map((scale, i) => (
                  <span
                    key={scale}
                    aria-hidden="true"
                    className="absolute inset-0 rounded-full border border-white/[0.07] pointer-events-none"
                    style={{
                      transform: `scale(${scale})`,
                      opacity: 1 - i * 0.3,
                      WebkitMaskImage: ARC_MASK,
                      maskImage: ARC_MASK,
                    }}
                  />
                ))}

                <span
                  className="absolute -inset-5 rounded-full blur-2xl pointer-events-none"
                  style={{
                    background:
                      "radial-gradient(circle at 50% 50%, rgba(45,212,191,0.28), rgba(56,189,248,0.10) 52%, transparent 68%)",
                  }}
                />
                <span
                  ref={orbRef}
                  className="absolute -inset-1 rounded-full blur-xl will-change-transform pointer-events-none"
                  style={{
                    background:
                      "radial-gradient(circle at 50% 50%, rgba(45,212,191,0.55), rgba(14,116,144,0.22) 56%, transparent 70%)",
                  }}
                />
                <span
                  className="absolute inset-0 rounded-full animate-spin pointer-events-none"
                  style={{
                    animationDuration: `${tempo.sweep}s`,
                    background:
                      "conic-gradient(from 0deg, transparent 0deg, rgba(94,234,212,0.5) 40deg, transparent 110deg)",
                    WebkitMask: "radial-gradient(circle, transparent 47%, #000 49%)",
                    mask: "radial-gradient(circle, transparent 47%, #000 49%)",
                  }}
                />
                <span
                  className="absolute inset-2 rounded-full blur-[6px] pointer-events-none"
                  style={{
                    background:
                      "radial-gradient(circle, transparent 44%, rgba(103,232,249,0.75) 50%, rgba(45,212,191,0.25) 58%, transparent 70%)",
                  }}
                />
                <span
                  className={`absolute inset-1 rounded-full border animate-pulse pointer-events-none ${theme.ring.replace("ring-", "border-")}`}
                  style={{ animationDuration: `${tempo.pulse}s` }}
                />

                {(phase === "error" || phase === "idle") && (
                  <span className="absolute inset-0 z-20 grid place-items-center pointer-events-none">
                    <span className="flex flex-col items-center gap-1 text-white/90">
                      <RotateCcw className="w-7 h-7" />
                      <span className="text-[11px] font-medium">Restart</span>
                    </span>
                  </span>
                )}

                <span
                  ref={coreRef}
                  className="absolute inset-4 rounded-full will-change-transform overflow-hidden"
                  style={{
                    background:
                      "radial-gradient(circle at 34% 26%, #2b5c86 0%, #14355c 38%, #0a1a32 68%, #050e1e 100%)",
                  }}
                >
                  <svg
                    viewBox="0 0 200 200"
                    className="absolute inset-0 w-full h-full opacity-70 animate-spin"
                    style={{ animationDuration: `${tempo.mesh}s` }}
                    aria-hidden="true"
                  >
                    {/* Signals run through the graph in EVERY state; weight
                        and brightness are fixed and only the speed moves, so
                        the orb stays one object rather than becoming a
                        different one per state. */}
                    <g stroke={`rgba(${theme.rim},0.5)`} strokeWidth="0.62" fill="none">
                      {MESH.edges.map(([[x1, y1], [x2, y2]], i) => (
                        <line
                          key={i}
                          x1={x1}
                          y1={y1}
                          x2={x2}
                          y2={y2}
                          className="neural-edge"
                          style={{
                            animationDuration: `${tempo.edge}s`,
                            animationDelay: `${((i % 13) * tempo.edge) / 13}s`,
                          }}
                        />
                      ))}
                    </g>
                    <g>
                      {MESH.pts.map(([cx, cy], i) => (
                        <circle
                          key={i}
                          cx={cx}
                          cy={cy}
                          r={i % 5 === 0 ? 1.9 : 1.05}
                          fill={i % 5 === 0 ? "rgba(167,243,208,0.95)" : "rgba(147,226,250,0.7)"}
                          className="neural-node"
                          style={{
                            animationDuration: `${tempo.node}s`,
                            // A fraction of the CURRENT duration, so a change
                            // of tempo rescales the spread with it and the
                            // field never bunches into one flash.
                            animationDelay: `${((i % 7) * tempo.node) / 7}s`,
                          }}
                        />
                      ))}
                    </g>
                  </svg>
                  <span
                    className="absolute inset-0 rounded-full"
                    style={{
                      background:
                        "radial-gradient(circle at 32% 24%, rgba(255,255,255,0.22), transparent 42%)",
                    }}
                  />
                </span>
              </button>

              {/* The status, in the middle of its own signal: the label names
                  what the bars are measuring.

                  It hangs off the bottom of the ring's own box rather than
                  sharing a column with it. As a flex sibling it pushed the
                  ring up by half its own height, so the orb sat 70px above
                  the middle of the screen; absolute, it cannot move the
                  thing it is measured from. */}
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-[clamp(32px,8vh,100px)] h-12 w-[620px] max-w-[88vw] px-2 flex items-center gap-3">
                <SignalHalf group="left" flip />
                <span
                  className={`shrink-0 inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[12px] font-medium border border-white/15 bg-white/[0.08] backdrop-blur-xl ${status.tone}`}
                >
                  <StatusIcon className={`w-3.5 h-3.5 ${thinking ? "animate-spin" : ""}`} />
                  {workLabel}
                  {/* The clock is the proof it has not died. It appears only
                      once waiting is long enough to doubt, so a normal
                      two-second answer is not made to look slow. */}
                  {thinking && slow && (
                    <span className="tabular-nums opacity-60">{waitedSec}s</span>
                  )}
                  {active && (
                    <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                  )}
                </span>
                <SignalHalf group="right" />
              </div>
              </div>

              {error && (
                <p className="shrink-0 inline-flex items-center gap-2 text-[12.5px] text-red-300 text-center px-4">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {error}
                </p>
              )}
            </div>


            {/* ── the readout ──
                This is what the screen is for. An answer with a table or a
                list of clinics was only ever legible in the 340px log at the
                side; here it gets the width to be read, in the HUD palette so
                the figure that answers the question is the brightest thing in
                the panel. */}
            {/* The stage. Both panels are absolutely placed inside a box of
                fixed height so they cross-fade IN PLACE: swapping them in
                the flow would make the whole column jump on every question,
                which is the opposite of the machine quietly rearranging
                itself around what it is doing. */}
          </main>

        </div>

        {/* ══ bottom rail ══
            The only numbers here come off the last answer's envelope. */}
        <footer className="shrink-0 h-7 flex items-center gap-3 px-3 border-t border-white/10 bg-white/[0.03] backdrop-blur-xl overflow-hidden">
          <span className="font-mono text-[9.5px] tracking-[0.18em] text-gray-600 shrink-0">
            TOOLS
          </span>
          <span className="flex-1 min-w-0 overflow-hidden">
            {latest?.tools?.length ? (
              <span className="block truncate font-mono text-[10px] tracking-wider text-primary-300/80">
                {latest.tools.join("  ·  ")}
              </span>
            ) : (
              <Ticks count={40} className="opacity-40" />
            )}
          </span>
          {latest?.meta && (
            <span className="shrink-0 font-mono text-[10px] tracking-wider text-gray-500">
              {latest.meta.tokens} TOK · {Math.round(latest.meta.ms / 100) / 10}S
            </span>
          )}
          <span className="shrink-0 flex items-center gap-1.5">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                active ? "bg-emerald-400 animate-pulse" : "bg-gray-600"
              }`}
            />
            <span className="font-mono text-[9.5px] tracking-[0.18em] text-gray-600">
              {live ? "LIVE" : "RELAY"}
            </span>
          </span>
        </footer>
      </div>
    </div>
  );
};

export default VoiceConversation;
