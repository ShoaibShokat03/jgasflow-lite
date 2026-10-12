// src/components/saas/pages/AnswerData.js
//
// Turning an answer into the data it contains.
//
// NO PROSE. Nothing here returns a sentence. The overlay this feeds shows
// figures, tables and charts, and the conversation itself belongs in the log
// in the left rail; a popup repeating what was just said is the screen
// talking twice. So every card produced here is a number, a table or a list
// of tool names, and an answer that is purely conversational produces none.
//
// EVERYTHING IS VERBATIM. A stat is a label and a figure the answer itself
// stated, copied across as written. Nothing is summed, averaged, ranked or
// converted - the same rule the charts obey, for the same reason: a number on
// this screen that does not appear in the answer is a number the assistant
// never said, and there is no way for the reader to tell the difference.
//
// EVERY CARD KNOWS WHERE IT WAS SAID. `anchor` is the position of a card's
// source text within the answer, as a fraction. That is what lets the overlay
// put a chart on screen while that part of the answer is being spoken rather
// than dumping all of it at the first syllable.

import { toNumber, parseTables, chartsFor } from "./AnswerCharts";

/** Four berths, so four cards. More would reach past the ring. */
export const MAX_CARDS = 4;

/** A label long enough to mean something, short enough to fit a card. */
const LABEL_MAX = 38;

/**
 * `Label: 1,234` as the answer wrote it.
 *
 * Deliberately narrow. It matches a label and figure on their own line, or as
 * a bullet, with or without the bold markers - the shapes these answers
 * actually use - and the value still has to survive `toNumber`, so "Status:
 * active" and "Clinic: Dental Care" are not stats. Inline figures inside a
 * sentence are left alone on purpose: pulling "12" out of "about 12 clinics"
 * means deciding what it counts, and that decision is a guess.
 */
const STAT_LINE =
  /(?:^|\n)[ \t]*(?:[-*+][ \t]*)?(?:\*\*)?([A-Za-z؀-ۿ][^\n:*|]{1,37}?)(?:\*\*)?[ \t]*[:：][ \t]*(?:\*\*)?([^\n*|]{1,28}?)(?:\*\*)?[ \t]*(?=\n|$)/g;

/**
 * Units a figure on this panel actually carries.
 *
 * `toNumber` refuses "418 MB", and is right to: it decides whether a whole
 * table COLUMN can be plotted on one axis, where a stray unit means the cells
 * are not comparable. A single stat has no axis and no neighbours, and
 * storage in MB is most of what this panel reports, so a unit is read here
 * and nowhere else.
 *
 * An allowlist rather than "any short word", because `4 months` and
 * `3rd Street Dental` both start with a number too, and neither is a figure
 * this screen should put in a box.
 */
const UNITS = /^(mb|gb|kb|tb|pkr|usd|eur|gbp)$/i;

/**
 * A stat's value, or null.
 *
 * `shown` keeps the answer's own spelling either way - the unit is read to
 * decide whether this IS a figure, never to rewrite it.
 */
function statNumber(shown) {
  const direct = toNumber(shown);
  if (direct !== null) return direct;
  const m = String(shown).trim().match(/^([^\s]+)\s+([A-Za-z]{1,4})$/);
  if (!m || !UNITS.test(m[2])) return null;
  return toNumber(m[1]);
}

/** Comparable form of a label, for matching a stat to a chart. */
export function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9؀-ۿ]+/g, " ")
    .trim();
}

/** The answer with its tables removed, so a table row cannot read as a stat. */
function withoutTables(text) {
  return String(text || "")
    .split("\n")
    .map((line) => (line.includes("|") ? "" : line))
    .join("\n");
}

/**
 * The figures the answer stated, in the order it stated them.
 *
 * @returns {{label:string, shown:string, value:number, at:number}[]}
 */
export function statsFor(text) {
  const body = withoutTables(text);
  const out = [];
  const seen = new Set();
  let m;
  STAT_LINE.lastIndex = 0;
  while ((m = STAT_LINE.exec(body))) {
    const label = m[1].trim();
    const shown = m[2].trim();
    const value = statNumber(shown);
    if (value === null) continue;
    if (label.length > LABEL_MAX) continue;
    const key = norm(label);
    // A figure repeated later in the answer is the same figure.
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ label, shown, value, at: m.index });
  }
  return out;
}

/**
 * Tables that no chart could be drawn from.
 *
 * A table of names and statuses has nothing to plot, and is still the data
 * the question asked for - so it comes forward as a small grid. Tables that
 * DID produce a chart are deliberately skipped: the chart is that table, and
 * two cards of one table is the duplication this overlay exists to avoid.
 */
export function gridsFor(text) {
  const src = String(text || "");
  return parseTables(src)
    .filter((t) => chartsFor(t).length === 0)
    .map((t) => ({
      head: t.head.slice(0, 3),
      rows: t.rows.slice(0, 5).map((r) => r.slice(0, 3)),
      at: src.indexOf(t.rows[0]?.[0] ?? ""),
    }));
}

/**
 * Where each table's chart sits in the text, so a chart can be timed.
 *
 * `parseTables` does not report offsets, so the first cell of the first row
 * is used to find the table again. It is the cheapest honest anchor: a
 * failure to find it returns -1 and the card simply shows from the start.
 */
function chartsWithAnchors(text) {
  const src = String(text || "");
  const out = [];
  for (const table of parseTables(src)) {
    const at = src.indexOf(table.rows[0]?.[0] ?? "");
    // The first header is the dimension the measure is broken down BY, and
    // is what a linked chart gets titled with.
    const dimension = table.head[0] || "";
    for (const chart of chartsFor(table)) out.push({ ...chart, at, dimension });
  }
  return out;
}

/**
 * The cards an answer supports, in the order the answer says them.
 *
 * LINKED PAIRS SIT TOGETHER. A stat whose label names a chart - or names one
 * of that chart's rows - is the same fact at two levels of detail, and that
 * is the one relationship in an answer worth drawing. Rather than running a
 * wire across the screen (which would cross the orb, and did, the first time
 * this was tried) the pair is placed in two berths on the SAME side and
 * joined by a short connector. Adjacency carries the relationship and the
 * middle of the screen stays clear.
 *
 * @param {string}   text   the answer, as markdown
 * @param {string[]} tools  the tools that produced it
 */
export function cardsFor(text, tools = []) {
  const src = String(text || "");
  if (!src.trim() && !tools.length) return [];

  const charts = chartsWithAnchors(src);
  const stats = statsFor(src);
  const grids = gridsFor(src);

  const items = [
    ...charts.map((c, i) => ({
      id: `chart-${i}-${norm(c.title)}`,
      kind: "chart",
      label: (c.title || "breakdown").toUpperCase(),
      chart: c,
      at: c.at,
    })),
    ...stats.map((s) => ({
      id: `stat-${norm(s.label)}`,
      kind: "stat",
      label: s.label.toUpperCase(),
      stat: s,
      at: s.at,
    })),
    ...grids.map((g, i) => ({
      id: `grid-${i}`,
      kind: "grid",
      // Both headers, not just the first. A grid of clinics and statuses
      // labelled "CLINIC" says nothing the first column does not already
      // say; what makes it worth a card is the column beside it.
      label: (g.head.filter(Boolean).join(" · ") || "records").toUpperCase(),
      grid: g,
      at: g.at,
    })),
  ];

  // A missing anchor sorts to the front rather than jumping to the end.
  items.forEach((it) => {
    if (typeof it.at !== "number" || it.at < 0) it.at = 0;
  });
  items.sort((a, b) => a.at - b.at);

  // Pull each stat's chart, if it has one, in beside it.
  const ordered = [];
  const taken = new Set();
  for (const it of items) {
    if (taken.has(it.id)) continue;
    taken.add(it.id);
    ordered.push(it);
    if (it.kind !== "stat") continue;
    const key = norm(it.stat.label);
    const mate = items.find(
      (c) =>
        !taken.has(c.id) &&
        c.kind === "chart" &&
        (norm(c.chart.title) === key ||
          c.chart.rows.some((r) => norm(r.label) === key)),
    );
    if (!mate) continue;
    taken.add(mate.id);
    // A stat links to a chart BECAUSE their labels match, so left alone the
    // pair arrives as two cards with the same heading stacked on each other.
    // The chart is the breakdown, so it is titled by what it breaks down by.
    const sameName = norm(mate.chart.title) === key;
    const by = mate.chart.dimension ? `BY ${mate.chart.dimension.toUpperCase()}` : "BREAKDOWN";
    ordered.push({ ...mate, label: sameName ? by : mate.label, linkedTo: it.id });
  }

  if (tools.length) {
    ordered.push({ id: "src", kind: "src", label: "SOURCE", tools, at: src.length });
  }

  const cards = ordered.slice(0, MAX_CARDS);
  const total = Math.max(src.length, 1);
  return cards.map((c) => ({
    ...c,
    // Where in the answer this was said, as a fraction. The overlay compares
    // it against how far through speaking the assistant is.
    anchor: Math.min(1, Math.max(0, c.at / total)),
  }));
}

/**
 * Which berth each card takes.
 *
 * Four berths: two stacked on each side of the orb, clear of it.
 *
 * Unlinked cards ALTERNATE sides, so two findings do not pile up in one
 * corner and leave the other half of the screen empty. A linked card breaks
 * that rule on purpose and takes the free berth on its mate's side, directly
 * under it: being next to each other is how the relationship is shown, and a
 * wire across the middle would cross the orb - which the first version of
 * this did, and it looked like a mistake rather than a link.
 *
 * NOT EVERY BERTH IS ALWAYS AVAILABLE. On a narrow screen the brain portrait
 * takes the top right corner, and a card placed there would either sit on top
 * of it or, pushed below it, reach into the orb's ring - measured at 373x610,
 * moving the top berths down to clear the box put both of them inside the
 * circle. So the caller says which berths exist and the portrait simply keeps
 * one, leaving three.
 *
 * @param   {{id:string, linkedTo?:string}[]} cards
 * @param   {{l:string[], r:string[]}} [open] berths available, by side
 * @returns {Map<string,string>} card id to berth key: lt, lb, rt or rb
 */
export function assignBerths(cards, open) {
  const free = open
    ? { l: [...open.l], r: [...open.r] }
    : { l: ["lt", "lb"], r: ["rt", "rb"] };
  const out = new Map();
  let next = "l";
  for (const card of cards) {
    const mate = card.linkedTo ? out.get(card.linkedTo) : null;
    // `mate[0]` is the side letter of the berth the mate took.
    let side = mate ? mate[0] : next;
    if (!free[side].length) side = side === "l" ? "r" : "l";
    // Both sides full: the card is dropped rather than stacked on another.
    if (!free[side].length) continue;
    out.set(card.id, free[side].shift());
    if (!mate) next = next === "l" ? "r" : "l";
  }
  return out;
}
