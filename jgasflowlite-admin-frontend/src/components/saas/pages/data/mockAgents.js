// src/components/saas/pages/data/mockAgents.js
//
// The four agents, and what each one watches.
//
// THEY ARE INDEPENDENT. Each one monitors its own domain and reports on it.
// Nothing here describes a relationship between two agents, because there
// isn't one: they do not consult each other, delegate, or answer on each
// other's behalf. The only line any of them has is to the core.
//
// THE KEYS ARE THE REAL ONES. `chief`, `ops`, `accounts`, `growth` are the
// persona keys the backend uses, so an agent selected here is the same agent
// the voice session speaks as - a parallel set of ids would drift the first
// time a persona was renamed.

/** Every state an agent node can be in, and what it is called on screen. */
export const AGENT_STATE = {
  idle: { word: "", live: false },
  active: { word: "active", live: true },
  analyzing: { word: "analyzing", live: true },
  updating: { word: "updating", live: true },
  completed: { word: "updated", live: false },
  error: { word: "problem", live: false },
};

/**
 * Where each agent sits around the core.
 *
 * The layout the brief asks for, as compass points:
 *
 *            OMAR
 *              |
 *   AYESHA -- CORE -- BILAL
 *              |
 *            SANA
 */
/*
 * `accent` is the pastel that glows out of a dark screen. `ink` is the same
 * hue dark enough to be read ON one.
 *
 * Both are needed because the two jobs are opposite: the accent is drawn as
 * light (haloes, strokes, the glow behind the orb) and the ink is drawn as
 * text and glyphs. Using the accent for both is why the billing figure came
 * out as pale yellow on white and could not be read at all.
 */
export const AGENTS = [
  {
    key: "chief",
    ink: "13,118,110",
    name: "Omar",
    role: "Chief of Staff",
    domain: "Executive overview",
    seat: "top",
    accent: "94,234,212",
    icon: "compass",
  },
  {
    key: "ops",
    ink: "2,105,161",
    name: "Ayesha",
    role: "Clinic Health",
    domain: "Clinic activity",
    seat: "left",
    accent: "125,211,252",
    icon: "activity",
  },
  {
    key: "accounts",
    ink: "161,98,7",
    name: "Bilal",
    role: "Subscriptions & Billing",
    domain: "Revenue and billing",
    seat: "right",
    accent: "252,211,77",
    icon: "receipt",
  },
  {
    key: "growth",
    ink: "109,40,217",
    name: "Sana",
    role: "Traffic & Signups",
    domain: "Traffic and signups",
    seat: "bottom",
    accent: "196,181,253",
    icon: "trending-up",
  },
  {
    // The one who is asked what to DO. Seated on the diagonal beside Omar,
    // because the two of them answer across the whole platform while the
    // other three each hold one domain.
    key: "strategy",
    ink: "190,18,60",
    name: "Zara",
    role: "Growth Strategy",
    domain: "Growth and retention",
    seat: "topRight",
    accent: "253,164,175",
    icon: "target",
  },
];

export const AGENT_BY_KEY = Object.fromEntries(AGENTS.map((a) => [a.key, a]));

/** Which agent a spoken question belongs to, by the words it uses. */
const SUBJECTS = {
  // Checked FIRST: "how do we sell more subscriptions" contains the word
  // subscription, which is Bilal's noun, but the question is Zara's. Intent
  // beats subject whenever the admin is asking what to change.
  strategy:
    /strateg|grow(th)?|increase|improve|boost|scale|opportunit|recommend|advice|advise|what should|how (do|can) we|upsell|up ?sell|cross ?sell|upgrade path|retention|retain|churn|pricing|price (increase|change)|win back|expand/i,
  growth: /traffic|visitor|signup|sign up|session|page ?view|conversion|campaign|source/i,
  accounts: /revenue|billing|invoice|subscription|payment|owed|overdue|plan|renew/i,
  ops: /clinic|patient|appointment|visit|dental|health|activity|dormant/i,
  chief: /overview|executive|summary|business|overall|everything|system|brief/i,
};

/**
 * The agent a question is about, or null.
 *
 * Used to bring a dashboard forward when the admin asks for something: "show
 * me today's traffic" should put Sana's figures on screen without them having
 * to click her first. Null when nothing matches, because guessing an agent
 * and showing the wrong dashboard is worse than showing none.
 */
export function agentForQuestion(text) {
  const q = String(text || "");
  if (!q.trim()) return null;
  for (const [key, re] of Object.entries(SUBJECTS)) {
    if (re.test(q)) return key;
  }
  return null;
}
