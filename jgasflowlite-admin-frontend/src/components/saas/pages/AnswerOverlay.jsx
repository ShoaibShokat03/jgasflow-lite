// src/components/saas/pages/AnswerOverlay.jsx
//
// The data in an answer, coming forward over the scene.
//
// NOT A PANEL, AND NOT THE CONVERSATION. There is no readout reserved on this
// screen waiting to be filled, and nothing here ever shows a sentence. What
// was said belongs in the log in the left rail; a popup repeating it is the
// screen saying the same thing twice, in the place where the figures should
// be. So these cards are stats, charts, tables and the tools that produced
// them - and an answer that is pure conversation puts nothing on screen,
// which is correct.
//
// IT IS TIMED TO THE VOICE. Every card knows where in the answer its data was
// stated, and comes forward when the speaking reaches it. A chart of storage
// per clinic appears while that part is being said, not at the first syllable
// with everything else. `progress` is real: on the recorded path it is the
// audio element's own position, and on the live path the text arrives as it is
// spoken, so a card appears the moment its data does.
//
// ONCE SHOWN, A CARD STAYS. The list is rebuilt as text streams in, and a
// half-received table parses differently from a whole one - so cards are
// accumulated rather than recomputed. An earlier version derived them from the
// streaming text directly and findings flickered in and out mid-answer.
//
// THE DEPTH IS NOT A FLOURISH. The cards share one perspective, face inward,
// and sit at different distances by age, so a reading stack reads as hovering
// in front of the scene rather than pasted onto it. Without that they are
// more rectangles, which is the thing this screen was asked to stop being.

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { cardsFor, assignBerths } from "./AnswerData";
import { brainBoxSize, BRAIN_MARGIN } from "./NeuronField";
import useViewport from "./useViewport";

/** Card size. Height is capped; the card scrolls rather than growing. */
const CARD_W = 196;
const CARD_MAX_H = 176;

/**
 * The ring's own size expression, repeated here on purpose.
 *
 * The berths have to clear the ring, and the ring is fluid, so a fixed
 * clearance is wrong at every size but one: at 1920x1080 the ring is 420
 * across - 210 radius - and a 185px berth put the cards INSIDE it. Keeping
 * the expression means the gap is measured from the ring rather than guessed.
 */
const RING = "clamp(220px,46vmin,420px)";
/**
 * The ring's edge, plus air - measured from the CENTRE.
 *
 * The `50% +` is load-bearing. `right` is measured from the container's right
 * edge, so a bare `calc(ring / 2 + 44px)` puts the card 254px in from the side
 * of the screen rather than 254px out from the middle: measured at 1920x1080
 * that left a 306px gap where 44 was intended.
 */
const CLEAR = `calc(50% + ${RING} / 2 + 44px)`;
/**
 * A card id, made safe to put in an SVG id and reference from `url(#...)`.
 *
 * Card ids are built from the answer's own words, so they contain spaces:
 * `stat-clinics over quota`. `getElementById` finds that happily, which is
 * what made this hard to see, but `url(#flow-stat-clinics over quota)` is not
 * a parseable reference - the paint server is never found and the path is
 * stroked with nothing. Two of three ribbons were invisible and the third,
 * whose id happened to be `grid-0`, drew perfectly.
 */
const svgId = (id) => `flow-${String(id).replace(/[^A-Za-z0-9_-]+/g, "-")}`;

/** Where a ribbon leaves the ring, and how hard it bends on the way out. */
const RIBBON_GAP = 8;
const RIBBON_BOW = 72;

/**
 * The ribbon from the orb to one card.
 *
 * Measured, in viewport pixels, not expressed as a percentage. The first
 * version of this was an SVG in percentage coordinates, which could not know
 * where a card was: it drew a long diagonal from the middle of the screen to
 * a guessed point, so the lines crossed over the orb and missed the cards at
 * both ends. The replacement was a 36px stub that left the ring and stopped -
 * honest, but it connected nothing, and in the corner layout it had to be
 * switched off entirely because it pointed at empty space.
 *
 * So the card is measured and the curve is drawn to it. Both tangents are
 * HORIZONTAL: the ribbon leaves the ring sideways and arrives at the card
 * sideways, which is what makes a set of them read as flow converging on a
 * hub rather than as spokes on a wheel.
 */
function ribbonFor({ cx, cy, r, x, y, left }) {
  const dir = left ? -1 : 1;
  const sx = cx + dir * (r + RIBBON_GAP);
  const c1 = sx + dir * RIBBON_BOW;
  const c2 = x - dir * RIBBON_BOW;
  return {
    d: `M${sx.toFixed(1)} ${cy.toFixed(1)} C${c1.toFixed(1)} ${cy.toFixed(1)}, ${c2.toFixed(1)} ${y.toFixed(1)}, ${x.toFixed(1)} ${y.toFixed(1)}`,
    // The gradient has to run along the RIBBON, from where it leaves the
    // ring. Running it from the centre of the orb instead spends the opaque
    // end of the gradient inside the orb, where there is no ribbon: a card
    // close to the ring then gets only the faint tail, and measured on a
    // 373px screen two of the three bands were invisible while their traffic
    // dashes still showed, which is what gave it away.
    sx,
    sy: cy,
  };
}

/** Air between a corner card and the edge of the screen. */
const EDGE = 12;
/** The top rail, which the brain box hangs below. */
const RAIL = 36;

/**
 * The bottom of the brain portrait, which nothing may overlap.
 *
 * The portrait sits in the top right corner, which is exactly where a card
 * goes in the corner layout and close to where the top-right card's head
 * reaches on a short screen in the side layout. Both numbers come from
 * `brainBoxSize`, so the card and the box cannot disagree about where it is.
 */
/** Four stacked tiles plus their heading, which hang under the portrait. */
const OVERVIEW_H = 196;

function brainBottom(w, h) {
  // 14px of caption above the canvas, the frame's own air, and the column of
  // figures that now hangs off the bottom of it. Measuring only the portrait
  // would put a card straight through those tiles.
  return RAIL + BRAIN_MARGIN * 2 + brainBoxSize(w, h).h + 14 + OVERVIEW_H;
}

/**
 * The ring's rendered width, in pixels.
 *
 * The same clamp the CSS uses, evaluated in JS because the layout decision
 * below needs the number and not the expression.
 */
function ringWidth(w, h) {
  return Math.min(Math.max(220, 0.46 * Math.min(w, h)), 420);
}

/**
 * Where the cards go, and how big they are.
 *
 * Two layouts, chosen by what fits.
 *
 * BESIDE THE RING, when there is room: the berths are anchored to the CENTRE
 * in CSS, so they track the ring at any size without JS measuring every
 * frame, and each card is wired back to the orb.
 *
 * IN THE CORNERS, when there is not: anchored to the edges of the screen
 * instead, sized to the band above and below the ring so they cannot grow
 * back over it, and with no wires - a wire drawn to a card that is no longer
 * beside the orb points at nothing, which is worse than no wire.
 */
function layoutFor({ w, h }) {
  const ring = ringWidth(w, h);
  const clear = brainBottom(w, h);
  const beside = w >= ring + 2 * (CARD_W + 36);
  if (beside) {
    return {
      beside: true,
      width: CARD_W,
      // A top card is anchored 14px above the centre line and grows upward,
      // so on a short screen its head reaches the portrait. Capping the
      // height is what keeps them apart without moving either of them.
      maxHeight: Math.max(72, Math.min(CARD_MAX_H, h / 2 - 14 - clear)),
      berths: {
        lt: { left: true, up: true, style: { right: CLEAR, bottom: "calc(50% + 14px)" }, ry: 7 },
        lb: { left: true, up: false, style: { right: CLEAR, top: "calc(50% + 14px)" }, ry: 7 },
        rt: { left: false, up: true, style: { left: CLEAR, bottom: "calc(50% + 14px)" }, ry: -7 },
        rb: { left: false, up: false, style: { left: CLEAR, top: "calc(50% + 14px)" }, ry: -7 },
      },
    };
  }
  // Two columns that fit side by side, and a height that fits the band
  // between the edge of the screen and the ring.
  const width = Math.max(120, Math.min(CARD_W, Math.floor((w - EDGE * 3) / 2)));
  const band = Math.floor((h - ring) / 2) - EDGE * 2;
  return {
    beside: false,
    width,
    maxHeight: Math.max(64, Math.min(CARD_MAX_H, band)),
    // The top right is the portrait's. A card there would sit on the box, and
    // moving it below the box put it inside the orb's ring instead: at
    // 373x610 there is room for the rail, the box, a card and half the ring
    // only if one of them goes, and the one that goes is the fourth card.
    open: { l: ["lt", "lb"], r: ["rb"] },
    berths: {
      lt: { left: true, up: true, style: { left: EDGE, top: EDGE }, ry: 7 },
      lb: { left: true, up: false, style: { left: EDGE, bottom: EDGE }, ry: 7 },
      rt: { left: false, up: true, style: { right: EDGE, top: EDGE }, ry: -7 },
      rb: { left: false, up: false, style: { right: EDGE, bottom: EDGE }, ry: -7 },
    },
  };
}

/** A compact bar list. Same rules as the inline charts: nothing derived. */
function MiniChart({ chart, accent }) {
  const max = Math.max(...chart.rows.map((r) => r.value));
  return (
    <div className="space-y-[3px]">
      {chart.rows.slice(0, 6).map((r, i) => (
        <div key={i} className="flex items-center gap-1.5" title={`${r.label}: ${r.shown}`}>
          <span className="w-[36%] shrink-0 truncate text-right text-[10.5px] text-gray-400">
            {r.label}
          </span>
          <span className="relative flex-1 h-2.5 bg-white/[0.05]">
            <span
              className="absolute inset-y-0 left-0 rounded-r-[3px]"
              style={{
                // max is non-zero: an all-zero column is never charted.
                width: `${Math.max((r.value / max) * 100, r.value > 0 ? 3 : 0)}%`,
                background: `rgb(${accent})`,
              }}
            />
          </span>
          <span className="w-[22%] shrink-0 font-mono text-[10.5px] text-gray-200 tabular-nums">
            {r.shown}
          </span>
        </div>
      ))}
    </div>
  );
}

/** One figure, as the answer wrote it. */
function Stat({ stat, accent }) {
  return (
    <div className="py-0.5">
      <p
        dir="auto"
        className="font-mono text-[25px] leading-none tabular-nums"
        style={{ color: `rgb(${accent})` }}
      >
        {stat.shown}
      </p>
    </div>
  );
}

/** A table that had nothing to plot. The cells are the answer's own. */
function Grid({ grid }) {
  return (
    <table className="w-full text-[10.5px] border-collapse">
      <thead>
        <tr>
          {grid.head.map((h, i) => (
            <th
              key={i}
              className="text-left font-mono font-normal text-[9px] tracking-[0.1em] text-gray-500 pb-1 truncate"
            >
              {String(h).toUpperCase()}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {grid.rows.map((row, r) => (
          <tr key={r} className="border-t border-white/[0.06]">
            {row.map((cell, c) => (
              <td
                key={c}
                dir="auto"
                className={`py-[3px] pr-1 truncate max-w-[84px] ${
                  c === 0 ? "text-gray-200" : "text-gray-400 tabular-nums"
                }`}
                title={String(cell)}
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * @param {object}  turn      the assistant turn, streaming or settled
 * @param {array}   tools     tools running right now
 * @param {boolean} thinking  the agent is working
 * @param {string}  accent    the speaking persona's hue, "r,g,b"
 * @param {number}  progress  how far through speaking, 0..1, or null for all
 */
export default function AnswerOverlay({
  turn,
  tools = [],
  thinking,
  accent,
  hidden,
  progress,
  onDismiss,
}) {
  const [dismissed, setDismissed] = useState(() => new Set());
  /** Cards for the answer in flight, in the order they first appeared. */
  const seenRef = useRef({ text: "", list: [] });
  const [, bump] = useState(0);

  const text = turn?.text ?? "";
  const toolNames = turn?.tools ?? [];

  // Accumulate. A streaming answer grows by prefix, so anything that is not a
  // continuation of what we had is a NEW answer and resets the stack.
  useEffect(() => {
    const prev = seenRef.current;
    const continues = text && prev.text && text.startsWith(prev.text);
    const fresh = cardsFor(text, toolNames);

    if (!continues) {
      seenRef.current = { text, list: fresh };
      setDismissed(new Set());
      bump((n) => n + 1);
      return;
    }
    const byId = new Map(prev.list.map((c) => [c.id, c]));
    let added = false;
    for (const card of fresh) {
      if (byId.has(card.id)) {
        // Keep the card, take the newer contents: a table gains rows as it
        // streams, and the card should gain them too.
        byId.set(card.id, { ...card, anchor: byId.get(card.id).anchor });
      } else {
        byId.set(card.id, card);
        added = true;
      }
    }
    seenRef.current = { text, list: [...byId.values()] };
    if (added || fresh.length) bump((n) => n + 1);
    // `toolNames` is a new array each render; its contents are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, toolNames.join("|")]);

  const cards = useMemo(() => {
    if (thinking) {
      return [
        {
          id: "task",
          kind: "task",
          label: tools.length ? "RUNNING" : "WORKING",
          anchor: 0,
        },
      ];
    }
    return seenRef.current.list;
    // seenRef is mutated above and `bump` is what republishes it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thinking, tools.length, text, seenRef.current.list]);

  // How far the voice has got. Null means there is nothing to time against,
  // so everything shows at once rather than nothing showing at all.
  const reached = progress == null ? 1 : progress;
  const live = hidden
    ? []
    : cards.filter(
        (c) =>
          !dismissed.has(c.id) &&
          // The first card is never held back: an answer whose data is stated
          // in its opening line would otherwise wait for a rounding error.
          (c.anchor <= reached || c === cards[0]),
      );

  const vp = useViewport();
  const layout = useMemo(() => layoutFor(vp), [vp]);
  const berths = useMemo(() => assignBerths(live, layout.open), [live, layout]);

  /**
   * Where each card actually ended up.
   *
   * Measured rather than computed from the berth, because a card's height
   * depends on what is in it and the ribbon has to arrive at the middle of
   * its inner edge. The cards are also mid-transform when they first appear,
   * so this runs again once the arrival animation is over - a ribbon drawn to
   * where a card was at 0ms points under it by the time it lands.
   */
  const cardEls = useRef(new Map());
  const [anchors, setAnchors] = useState([]);
  const liveKey = live.map((c) => c.id).join("|");

  useLayoutEffect(() => {
    const measure = () => {
      const next = [];
      for (const card of live) {
        const el = cardEls.current.get(card.id);
        const key = berths.get(card.id);
        if (!el || !key) continue;
        const b = el.getBoundingClientRect();
        if (!b.width) continue;
        const left = key[0] === "l";
        next.push({
          id: card.id,
          left,
          // The inner edge, facing the orb.
          x: left ? b.right : b.left,
          y: b.top + b.height / 2,
        });
      }
      setAnchors((prev) => {
        const same =
          prev.length === next.length &&
          prev.every(
            (p, i) =>
              p.id === next[i].id &&
              Math.abs(p.x - next[i].x) < 0.5 &&
              Math.abs(p.y - next[i].y) < 0.5,
          );
        // Bailing out when nothing moved is what stops this looping: setting
        // state from a layout effect re-runs the layout effect.
        return same ? prev : next;
      });
    };
    measure();
    // The cards arrive on a staggered animation; the last one settles at
    // about 110 + 3 * 70 + 420ms.
    const t = setTimeout(measure, 760);
    return () => clearTimeout(t);
  }, [liveKey, berths, vp, live]);

  const ring = ringWidth(vp.w, vp.h);
  const geom = { cx: vp.w / 2, cy: vp.h / 2, r: ring / 2 };
  if (!live.length) return null;

  const drop = (id) => {
    setDismissed((prev) => new Set(prev).add(id));
    onDismiss?.(id);
  };

  return (
    <div
      className="fixed inset-0 z-30 pointer-events-none"
      aria-live="polite"
      style={{ perspective: "1400px", transformStyle: "preserve-3d" }}
    >
      {/* The flows, under the cards.

          One SVG for all of them rather than an element each: they share a
          coordinate space, and a gradient per ribbon is what gives the sense
          of something leaving the orb and arriving rather than a line that is
          simply present. */}
      <svg
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        width={vp.w}
        height={vp.h}
        viewBox={`0 0 ${vp.w} ${vp.h}`}
      >
        <defs>
          {anchors.map((a) => {
            const { sx, sy } = ribbonFor({ ...geom, ...a });
            return (
              <linearGradient
                key={a.id}
                id={svgId(a.id)}
                gradientUnits="userSpaceOnUse"
                x1={sx}
                y1={sy}
                x2={a.x}
                y2={a.y}
              >
                <stop offset="0%" stopColor={`rgb(${accent})`} stopOpacity="0.72" />
                <stop offset="100%" stopColor={`rgb(${accent})`} stopOpacity="0.2" />
              </linearGradient>
            );
          })}
        </defs>
        {anchors.map((a, i) => {
          const { d } = ribbonFor({ ...geom, ...a });
          return (
            <g key={a.id}>
              {/* The band. */}
              <path
                d={d}
                fill="none"
                // Normalised, so the dash lengths below are percentages of
                // the curve and every ribbon draws itself in at the same
                // rate however long it is.
                pathLength="100"
                stroke={`url(#${svgId(a.id)})`}
                strokeWidth="9"
                strokeLinecap="round"
                className="hud-flow"
                style={{ animationDelay: `${90 + i * 70}ms` }}
              />
              {/* And the traffic on it. A dashed line travelling along the
                  same curve says the connection is carrying something,
                  which a static band does not. */}
              <path
                d={d}
                fill="none"
                pathLength="100"
                stroke={`rgb(${accent})`}
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeDasharray="3 26"
                className="hud-flow-run"
                style={{ animationDelay: `${90 + i * 70}ms` }}
              />
            </g>
          );
        })}
      </svg>

      {live.map((card, i) => {
        const key = berths.get(card.id);
        if (!key) return null;
        const b = layout.berths[key];
        // Only in the side layout: in the corners the pair is not adjacent,
        // so a short connector between them would join nothing.
        const mate = layout.beside && card.linkedTo && berths.get(card.linkedTo);
        // Oldest sits furthest back, newest comes forward. Depth by age is
        // the one ordering the reader already knows, because they watched it
        // happen.
        const depth = -(live.length - 1 - i) * 10;

        return (
          <React.Fragment key={card.id}>
            {/* The wire back to the orb. Plain elements at the same offsets
                the berths use, rather than an SVG in percentage coordinates:
                the percentage version could not know where the cards were, so
                it drew a long diagonal from the middle of the screen to a
                guessed point, crossing the orb and missing the card. */}

            {/* The link to the card above: these two are the same fact at two
                levels of detail, and they are neighbours so the join is a
                short hop rather than a line across the screen. */}
            {mate && (
              <span
                aria-hidden="true"
                className="hud-wire-stub absolute w-px pointer-events-none"
                style={{
                  [b.left ? "right" : "left"]: `calc(${CLEAR} + ${layout.width / 2}px)`,
                  top: "calc(50% - 14px)",
                  height: 28,
                  transformOrigin: "center top",
                  background: `linear-gradient(to bottom, transparent, rgb(${accent}))`,
                  animationDelay: `${150 + i * 70}ms`,
                }}
              />
            )}

            <article
              ref={(el) => {
                if (el) cardEls.current.set(card.id, el);
                else cardEls.current.delete(card.id);
              }}
              className="hud-pop absolute pointer-events-auto flex flex-col border border-white/12 vc-panel-solid backdrop-blur-xl"
              style={{
                ...b.style,
                width: layout.width,
                // Capped, or a tall card at a lower berth grows back up
                // through the ring it was placed to avoid.
                maxHeight: layout.maxHeight,
                "--pop-ry": `${b.ry}deg`,
                "--pop-tz": `${depth}px`,
                animationDelay: `${110 + i * 70}ms`,
              }}
            >
              <header className="flex items-center gap-2 h-6 px-2 border-b border-white/10">
                <span
                  className="w-1 h-1 rounded-full shrink-0"
                  style={{ background: `rgb(${accent})` }}
                />
                <span
                  dir="auto"
                  className="flex-1 font-mono text-[9px] tracking-[0.18em] text-gray-400 truncate"
                  title={card.label}
                >
                  {card.label}
                </span>
                <button
                  onClick={() => drop(card.id)}
                  title="Dismiss"
                  className="shrink-0 text-gray-500 hover:text-white transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </header>

              <div className="px-2 py-1.5 min-h-0 overflow-y-auto scrollbar-none">
                {card.kind === "task" && (
                  <ul className="space-y-1">
                    {(tools.length ? tools : ["composing"]).map((t, k) => (
                      <li
                        key={`${t}-${k}`}
                        className="flex items-center gap-1.5 font-mono text-[10.5px] text-gray-300"
                      >
                        <span
                          className="w-1 h-1 rounded-full animate-pulse"
                          style={{ background: `rgb(${accent})` }}
                        />
                        <span className="truncate">{t}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {card.kind === "stat" && <Stat stat={card.stat} accent={accent} />}
                {card.kind === "chart" && <MiniChart chart={card.chart} accent={accent} />}
                {card.kind === "grid" && <Grid grid={card.grid} />}

                {card.kind === "src" && (
                  <ul className="space-y-0.5">
                    {card.tools.map((t) => (
                      <li
                        key={t}
                        className="font-mono text-[10.5px] text-primary-300/80 truncate"
                      >
                        {t}
                      </li>
                    ))}
                    {turn?.meta && (
                      <li className="pt-1 font-mono text-[9.5px] text-gray-500">
                        {turn.meta.tokens} TOK · {Math.round(turn.meta.ms / 100) / 10}S
                      </li>
                    )}
                  </ul>
                )}
              </div>
            </article>
          </React.Fragment>
        );
      })}
    </div>
  );
}
