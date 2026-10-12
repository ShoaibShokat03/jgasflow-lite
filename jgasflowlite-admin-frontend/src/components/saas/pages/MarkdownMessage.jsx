// src/components/saas/pages/MarkdownMessage.jsx
// Renders the assistant's markdown: headings, bold, italics, inline code,
// code blocks, bullet and numbered lists, tables, quotes, rules and links.
//
// Hand-written rather than pulling in react-markdown + remark-gfm, for the
// same reason the admin app hand-builds its chart bars: this is a constrained
// subset with known input, and owning it keeps the bundle and the styling
// under our control.
//
// IT BUILDS REACT ELEMENTS, NEVER HTML STRINGS. There is no
// dangerouslySetInnerHTML anywhere here, so a model that echoes a patient note
// containing markup cannot inject anything — the text is text. Link hrefs are
// additionally scheme-checked, because `[click](javascript:...)` is the one
// place markdown can still carry an executable payload.
import React from "react";

/**
 * WHICH COLOURS, AND WHY THIS IS A PROP.
 *
 * Every colour below used to be written `text-gray-900 dark:text-white`, which
 * looks like it handles both themes and does not. In this app `dark:` compiles
 * to `@media (prefers-color-scheme: dark)` — there is no `@custom-variant`
 * declaring the class form — so those variants follow the operating system,
 * not the surface the text is drawn on.
 *
 * The voice overlay is dark whatever the OS is doing. On a light-mode machine
 * every `dark:` above was therefore inert and **bold text rendered near-black
 * on dark glass**: measured at 1.05:1 contrast, which is invisible. That is
 * why an answer read "There is    clinic that signed up today" — the figure
 * was bold, and bold was the one thing you could not see.
 *
 * So the palette is chosen by the caller, which is the only thing that knows
 * what it is painting on. `chrome` keeps the old OS-following behaviour for
 * the admin panel's own pages, whose backgrounds follow the OS in step with
 * it. `dark` is fixed, for a surface that is always dark.
 */
const PALETTES = {
  chrome: {
    strong: "text-gray-900 dark:text-white",
    code: "bg-gray-100 dark:bg-gray-700/70",
    link: "text-primary-600 dark:text-primary-400",
    tableBorder: "border-gray-200 dark:border-gray-700",
    tableHead: "bg-gray-50 dark:bg-gray-700/50",
    th: "text-gray-700 dark:text-gray-200",
    td: "text-gray-700 dark:text-gray-300",
    rowBorder: "border-gray-100 dark:border-gray-700/60",
    heading: "text-gray-900 dark:text-white",
    subheading: "text-gray-700 dark:text-gray-200",
    li: "text-gray-700 dark:text-gray-200",
    marker: "marker:text-gray-400",
    rule: "border-gray-200 dark:border-gray-700",
    quoteBar: "border-gray-300 dark:border-gray-600",
    quote: "text-gray-600 dark:text-gray-300",
    pre: "bg-gray-900 text-gray-100",
  },
  /**
   * The readout panel in voice mode. Same shapes as `dark`, tuned for a
   * surface that is meant to be read across a room: figures carry the accent
   * instead of plain white, and the table is a data grid rather than a
   * document table.
   */
  hud: {
    strong: "text-primary-300 font-semibold",
    code: "bg-primary-400/10 text-primary-200",
    link: "text-primary-300",
    tableBorder: "border-primary-400/20",
    tableHead: "bg-primary-400/[0.07]",
    th: "text-primary-200/80 uppercase tracking-wider text-[10.5px]",
    td: "text-gray-200",
    rowBorder: "border-white/[0.06]",
    heading: "text-white uppercase tracking-wide",
    subheading: "text-primary-200/80 uppercase tracking-wide",
    li: "text-gray-200",
    marker: "marker:text-primary-400/60",
    rule: "border-primary-400/20",
    quoteBar: "border-primary-400/40",
    quote: "text-gray-300",
    pre: "bg-black/50 text-primary-100",
  },
  dark: {
    strong: "text-white",
    code: "bg-white/10",
    link: "text-primary-300",
    tableBorder: "border-white/15",
    tableHead: "bg-white/[0.06]",
    th: "text-gray-200",
    td: "text-gray-300",
    rowBorder: "border-white/10",
    heading: "text-white",
    subheading: "text-gray-200",
    li: "text-gray-200",
    marker: "marker:text-gray-500",
    rule: "border-white/15",
    quoteBar: "border-white/25",
    quote: "text-gray-300",
    pre: "bg-black/40 text-gray-100",
  },
};

const paletteFor = (tone) => PALETTES[tone] ?? PALETTES.chrome;

/** Only these can end up in an href. Anything else renders as plain text. */
const SAFE_SCHEME = /^(https?:|mailto:|tel:)/i;

// ─────────────────────── inline ───────────────────────

// Order matters: code first, so **bold** inside `code` stays literal.
const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*\n]+\*)|(_[^_\n]+_)|(\[[^\]]+\]\([^)\s]+\))/g;

function renderInline(text, keyPrefix = "i", p = PALETTES.chrome) {
  if (!text) return null;
  const out = [];
  let last = 0;
  let match;
  let n = 0;

  INLINE.lastIndex = 0;
  while ((match = INLINE.exec(text)) !== null) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${n++}`;

    if (token.startsWith("`")) {
      out.push(
        <code
          key={key}
          className={`px-1 py-0.5 rounded font-mono text-[12.5px] ${p.code}`}
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("**") || token.startsWith("__")) {
      out.push(
        <strong key={key} className={`font-semibold ${p.strong}`}>
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("[")) {
      const cut = token.indexOf("](");
      const label = token.slice(1, cut);
      const href = token.slice(cut + 2, -1);
      out.push(
        SAFE_SCHEME.test(href) ? (
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={`underline underline-offset-2 ${p.link}`}
          >
            {label}
          </a>
        ) : (
          // Not a scheme we will link to — show the label, drop the target.
          <span key={key}>{label}</span>
        ),
      );
    } else {
      out.push(
        <em key={key} className="italic">
          {token.slice(1, -1)}
        </em>,
      );
    }
    last = match.index + token.length;
  }

  if (last < text.length) out.push(text.slice(last));
  return out;
}

// ─────────────────────── tables ───────────────────────

const splitRow = (line) =>
  line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());

const isSeparator = (line) =>
  /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);

function Table({ head, rows, k, p }) {
  return (
    <div key={k} className="my-2 overflow-x-auto">
      <table
        className={`w-full text-[12.5px] border rounded-lg overflow-hidden ${p.tableBorder}`}
      >
        <thead className={p.tableHead}>
          <tr>
            {head.map((c, i) => (
              <th
                key={i}
                className={`text-left font-semibold px-2.5 py-1.5 border-b whitespace-nowrap ${p.th} ${p.tableBorder}`}
              >
                {renderInline(c, `th${i}`, p)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr
              key={ri}
              className={`border-b last:border-0 ${p.rowBorder}`}
            >
              {head.map((_, ci) => (
                <td key={ci} className={`px-2.5 py-1.5 align-top ${p.td}`}>
                  {renderInline(r[ci] ?? "", `td${ri}-${ci}`, p)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────── blocks ───────────────────────

const BULLET = /^(\s*)([-*•])\s+(.*)$/;
const NUMBER = /^(\s*)(\d+)[.)]\s+(.*)$/;
const HEADING = /^(#{1,4})\s+(.*)$/;

const headingClass = (level, p) =>
  ({
    1: `text-[15px] font-bold mt-3 first:mt-0 mb-1 ${p.heading}`,
    2: `text-[14px] font-bold mt-3 first:mt-0 mb-1 ${p.heading}`,
    3: `text-[13.5px] font-semibold mt-2.5 first:mt-0 mb-0.5 ${p.heading}`,
    4: `text-[13px] font-semibold mt-2 first:mt-0 mb-0.5 ${p.subheading}`,
  })[level];

/** A run of list items at one indent level. Nesting is rendered by padding. */
function List({ ordered, items, k, p }) {
  const Tag = ordered ? "ol" : "ul";
  return (
    <Tag
      key={k}
      className={`my-1.5 space-y-0.5 ${ordered ? "list-decimal" : "list-disc"} pl-5 ${p.marker}`}
    >
      {items.map((it, i) => (
        <li
          key={i}
          className={p.li}
          style={it.depth ? { marginLeft: it.depth * 14 } : undefined}
        >
          {renderInline(it.text, `li${i}`, p)}
        </li>
      ))}
    </Tag>
  );
}

export default function MarkdownMessage({ text, tone = "chrome" }) {
  if (!text) return null;

  const p = paletteFor(tone);

  const lines = String(text).replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let paragraph = [];
  let key = 0;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const joined = paragraph.join(" ");
    blocks.push(
      <p key={`p${key++}`} className="my-1.5 first:mt-0 last:mb-0">
        {renderInline(joined, `p${key}`, p)}
      </p>,
    );
    paragraph = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // ── fenced code ──
    if (/^\s*```/.test(line)) {
      flushParagraph();
      const body = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) body.push(lines[i++]);
      blocks.push(
        <pre
          key={`c${key++}`}
          className={`my-2 p-2.5 rounded-lg overflow-x-auto text-[12px] font-mono leading-relaxed ${p.pre}`}
        >
          <code>{body.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    // ── table ──
    if (line.includes("|") && isSeparator(lines[i + 1] ?? "")) {
      flushParagraph();
      const head = splitRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) {
        rows.push(splitRow(lines[i++]));
      }
      i--;
      blocks.push(<Table key={`t${key++}`} k={`t${key}`} head={head} rows={rows} p={p} />);
      continue;
    }

    // ── blank ──
    if (!line.trim()) {
      flushParagraph();
      continue;
    }

    // ── horizontal rule ──
    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
      flushParagraph();
      blocks.push(
        <hr key={`h${key++}`} className={`my-2.5 ${p.rule}`} />,
      );
      continue;
    }

    // ── heading ──
    const heading = HEADING.exec(line);
    if (heading) {
      flushParagraph();
      const level = heading[1].length;
      blocks.push(
        <div key={`hd${key++}`} className={headingClass(level, p)}>
          {renderInline(heading[2], `hd${key}`, p)}
        </div>,
      );
      continue;
    }

    // ── blockquote ──
    if (/^\s*>\s?/.test(line)) {
      flushParagraph();
      const quoted = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quoted.push(lines[i++].replace(/^\s*>\s?/, ""));
      }
      i--;
      blocks.push(
        <blockquote
          key={`q${key++}`}
          className={`my-2 pl-3 border-l-2 ${p.quoteBar} ${p.quote}`}
        >
          {renderInline(quoted.join(" "), `q${key}`, p)}
        </blockquote>,
      );
      continue;
    }

    // ── lists (a run of consecutive items keeps one <ul>/<ol>) ──
    const bullet = BULLET.exec(line);
    const numbered = NUMBER.exec(line);
    if (bullet || numbered) {
      flushParagraph();
      const ordered = !!numbered;
      const items = [];
      while (i < lines.length) {
        const m = ordered ? NUMBER.exec(lines[i]) : BULLET.exec(lines[i]);
        if (!m) break;
        items.push({ depth: Math.floor(m[1].length / 2), text: m[3] });
        i++;
      }
      i--;
      blocks.push(
        <List key={`l${key++}`} k={`l${key}`} ordered={ordered} items={items} p={p} />,
      );
      continue;
    }

    paragraph.push(line.trim());
  }

  flushParagraph();

  // Urdu and Arabic are right-to-left, and `auto` lets the browser pick per
  // block from its first strong character — so an English answer is unchanged
  // and an Urdu one is not rendered backwards with its full stop on the left.
  return (
    <div dir="auto" className="text-[13.5px] leading-relaxed">
      {blocks}
    </div>
  );
}
