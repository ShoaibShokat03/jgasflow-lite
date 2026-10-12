// src/components/saas/pages/AnswerCharts.jsx
//
// Charts drawn from what the agent actually answered.
//
// ON DEMAND, NOT ON DISPLAY. Nothing here renders until a question produces a
// table. There is no standing dashboard: the figures appear because they were
// asked for, and leave with the next question.
//
// IT CHARTS THE TABLE, AND ONLY THE TABLE. The source is the markdown table in
// the answer, never prose. A column becomes a chart only if EVERY one of its
// cells parses as a number — one unparseable cell and the column is skipped
// rather than charted with a gap. Guessing at half-numeric data is how a
// chart ends up saying something the answer did not.
//
// NOTHING IS DERIVED. No totals, no averages, no percentages of a whole. A
// column header is not enough to know whether summing it is meaningful —
// adding up a column of percentages or averages produces a number that is
// simply false — so every value drawn here appears verbatim in the table
// underneath.
//
// FORM. Comparing magnitude across named categories is a bar chart, laid out
// horizontally because the categories are words of unpredictable length and
// horizontal bars give them a whole line to sit on. One series per chart, so
// identity is never carried by colour and no legend is needed: the caption
// names the measure. The table below is the table view.

import React from "react";

/** How many charts one answer may produce before it stops being a readout. */
const MAX_CHARTS = 2;
/** Below this a "chart" is just two bars and the table says it better. */
const MIN_ROWS = 2;

/**
 * A cell to a number, or null.
 *
 * Tolerates the shapes money and counts actually arrive in — thousands
 * separators, a leading currency, a trailing percent — and refuses anything
 * else. A date, a range or an id must come back null, or the column is
 * charted as if those were magnitudes.
 */
export function toNumber(cell) {
  if (cell == null) return null;
  const raw = String(cell).trim();
  if (!raw) return null;

  // Strip one leading currency token, grouping commas and spaces, and one
  // trailing percent. Anything still left that is not a number disqualifies.
  const cleaned = raw
    .replace(/^(PKR|Rs\.?|USD|EUR|GBP|\$|€|£)\s*/i, "")
    .replace(/[,\s]/g, "")
    .replace(/%$/, "");

  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Markdown pipe tables in a block of text. */
export function parseTables(text) {
  if (!text) return [];
  const lines = String(text).replace(/\r\n/g, "\n").split("\n");
  const tables = [];

  const cells = (line) =>
    line
      .trim()
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((c) => c.trim());

  const isSeparator = (line) =>
    /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line ?? "");

  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes("|") || !isSeparator(lines[i + 1])) continue;
    const head = cells(lines[i]);
    const rows = [];
    i += 2;
    while (i < lines.length && lines[i].includes("|") && lines[i].trim()) {
      rows.push(cells(lines[i]));
      i++;
    }
    i--;
    if (rows.length) tables.push({ head, rows });
  }
  return tables;
}

/**
 * The charts a table can honestly support.
 *
 * The first column is the label. A later column qualifies only when every
 * row parses AND at least one value is non-zero: a chart of nothing but
 * zeroes is a row of empty tracks that says less than the table.
 */
export function chartsFor(table) {
  const { head, rows } = table;
  if (!head || rows.length < MIN_ROWS) return [];

  const out = [];
  for (let col = 1; col < head.length; col++) {
    const values = rows.map((r) => toNumber(r[col]));
    if (values.some((v) => v === null)) continue;
    if (!values.some((v) => v !== 0)) continue;
    // Negatives would need a baseline in the middle of the track; the table
    // reads them fine and a wrong baseline does not.
    if (values.some((v) => v < 0)) continue;

    out.push({
      title: head[col] || "",
      rows: rows.map((r, i) => ({
        label: r[0] ?? "",
        value: values[i],
        shown: String(r[col] ?? "").trim(),
      })),
    });
  }
  return out;
}

/** One measure, one hue, bars anchored to a shared baseline. */
function BarCard({ title, rows, accent }) {
  const max = Math.max(...rows.map((r) => r.value));
  return (
    <figure className="relative border border-white/10 bg-white/[0.025] p-2.5">
      <figcaption className="font-mono text-[9.5px] tracking-[0.18em] text-gray-400 mb-1.5">
        {title.toUpperCase()}
      </figcaption>
      {/* 2px between bars: adjacent fills need a surface gap or they read as
          one block. */}
      <div className="space-y-[2px]">
        {rows.map((r, i) => (
          <div
            key={`${r.label}-${i}`}
            className="flex items-center gap-2"
            title={`${r.label}: ${r.shown}`}
          >
            <span className="w-[34%] shrink-0 truncate text-right text-[11px] text-gray-400">
              {r.label}
            </span>
            <span className="relative flex-1 h-3.5 bg-white/[0.04]">
              <span
                className="absolute inset-y-0 left-0 rounded-r-[4px]"
                style={{
                  // max is non-zero: chartsFor refuses an all-zero column.
                  width: `${Math.max((r.value / max) * 100, r.value > 0 ? 2 : 0)}%`,
                  background: `rgb(${accent})`,
                }}
              />
            </span>
            <span className="w-[18%] shrink-0 font-mono text-[11px] text-gray-200 tabular-nums">
              {r.shown}
            </span>
          </div>
        ))}
      </div>
      <span
        aria-hidden="true"
        className="absolute top-0 left-0 w-1.5 h-1.5 border-l border-t border-white/25"
      />
    </figure>
  );
}

/**
 * @param {string} text    the answer, as markdown
 * @param {string} accent  the speaking persona's hue, as "r,g,b"
 */
export default function AnswerCharts({ text, accent = "94,234,212", className = "" }) {
  const charts = parseTables(text).flatMap(chartsFor).slice(0, MAX_CHARTS);
  if (!charts.length) return null;

  return (
    <div className={`grid gap-2 ${charts.length > 1 ? "sm:grid-cols-2" : ""} ${className}`}>
      {charts.map((c, i) => (
        <BarCard key={`${c.title}-${i}`} title={c.title} rows={c.rows} accent={accent} />
      ))}
    </div>
  );
}
