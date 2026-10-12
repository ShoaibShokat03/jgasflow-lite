// src/components/saas/pages/hudSound.js
//
// The voice screen's interface sounds.
//
// SYNTHESISED, NOT SAMPLED. Every cue here is a few oscillators and a gain
// envelope, so there are no audio files to ship, cache-bust or 404. It also
// means a cue costs nothing until it is played and nothing is downloaded by
// an admin who has muted them.
//
// THEY MUST NEVER FIGHT THE AGENT. This screen's whole job is a spoken
// conversation, so every cue is short, quiet and ABOVE the voice band: a
// 180ms blip at 500-1800Hz sits clear of speech formants and cannot be
// mistaken for the agent saying something. Nothing loops, and nothing plays
// while the agent is mid-sentence except the one cue that means it stopped.
//
// A browser will not start an AudioContext without a gesture. This screen is
// opened by a click, so the first cue is safe — but `resume()` is called
// anyway, because a context created before the gesture lands starts
// suspended and would otherwise stay silent for the whole session.

const STORAGE_KEY = "saas_ai_hud_sound";

/** Shared across cues: browsers cap how many AudioContexts a page may hold. */
let ctx = null;
/** Master gain, so a mute takes effect on sounds already scheduled. */
let bus = null;

function audio() {
  if (ctx) return ctx;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  try {
    ctx = new Ctx();
    bus = ctx.createGain();
    // Quiet by design. These are punctuation, not content.
    bus.gain.value = 0.18;
    bus.connect(ctx.destination);
  } catch {
    ctx = null;
  }
  return ctx;
}

export function isMuted() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "off";
  } catch {
    // Private mode or storage disabled. Audible is the better default: a
    // muted-by-accident interface looks broken rather than quiet.
    return false;
  }
}

export function setMuted(muted) {
  try {
    localStorage.setItem(STORAGE_KEY, muted ? "off" : "on");
  } catch {
    /* not worth failing a mute over */
  }
}

/**
 * One tone.
 *
 * `at` is an offset in seconds so a cue can be a short sequence without
 * setTimeout: scheduling on the audio clock is sample-accurate, where a
 * timer drifts under load — and under load is exactly when these fire.
 */
function tone({ freq, to, at = 0, dur = 0.12, type = "sine", gain = 1 }) {
  const c = audio();
  if (!c) return;
  const t0 = c.currentTime + at;
  const osc = c.createOscillator();
  const env = c.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);

  // A 6ms attack rather than an instant one: a square-edged start clicks,
  // and a click is the one thing that makes a UI sound feel cheap.
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(gain, t0 + 0.006);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  osc.connect(env);
  env.connect(bus);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** The cues. Each is named for what happened, not for what it sounds like. */
const CUES = {
  /** The screen opened. */
  boot: () => {
    tone({ freq: 420, to: 880, dur: 0.18, type: "triangle", gain: 0.5 });
    tone({ freq: 660, to: 1320, at: 0.08, dur: 0.22, type: "sine", gain: 0.35 });
  },
  /** The screen closed. */
  shutdown: () => {
    tone({ freq: 880, to: 420, dur: 0.2, type: "triangle", gain: 0.45 });
  },
  /** A panel arrived. */
  reveal: () => {
    tone({ freq: 1200, dur: 0.06, type: "sine", gain: 0.3 });
  },
  /** A tool started running. */
  tool: () => {
    tone({ freq: 1600, dur: 0.045, type: "square", gain: 0.12 });
  },
  /** An answer landed. */
  answer: () => {
    tone({ freq: 740, dur: 0.14, type: "sine", gain: 0.3 });
    tone({ freq: 1110, at: 0.06, dur: 0.16, type: "sine", gain: 0.22 });
  },
  /** The conversation changed hands. */
  handover: () => {
    tone({ freq: 520, to: 1040, dur: 0.26, type: "triangle", gain: 0.35 });
  },
  /** Something went wrong. */
  fault: () => {
    tone({ freq: 300, dur: 0.1, type: "sawtooth", gain: 0.3 });
    tone({ freq: 220, at: 0.1, dur: 0.16, type: "sawtooth", gain: 0.3 });
  },
};

/**
 * Play a cue by name.
 *
 * Silent and harmless when muted, when the name is unknown, or when the
 * browser gives us no audio at all: an interface sound is never worth an
 * exception on a screen whose real job is the conversation.
 */
export function cue(name) {
  if (isMuted()) return;
  const play = CUES[name];
  if (!play) return;
  const c = audio();
  if (!c) return;
  // A context created before the opening gesture starts suspended; without
  // this it stays suspended and every cue is silently dropped.
  if (c.state === "suspended") c.resume().catch(() => {});
  try {
    play();
  } catch {
    /* an unplayable blip is not an error worth surfacing */
  }
}

/** Let go of the audio device when the screen closes. */
export function releaseSound() {
  if (!ctx) return;
  const dying = ctx;
  ctx = null;
  bus = null;
  dying.close().catch(() => {});
}

export const CUE_NAMES = Object.keys(CUES);
