// src/components/saas/pages/NeuronField.jsx
//
// The neuron field behind the voice screen.
//
// WHY A CANVAS. Dozens of cells that drift, rewire as they pass each other
// and fire along the links between them is not something CSS can express: the
// connections do not exist until the frame is drawn, because which cells are
// close enough to connect changes continuously. Forty animated elements would
// still be the wrong forty a second later.
//
// WHAT MAKES IT READ AS NEURONS RATHER THAN AS A NETWORK GRAPH. Three things,
// and the first matters most:
//
//   1. The connections CURVE. Straight lines between dots are a
//      constellation. Every axon here is a quadratic whose bend is hashed
//      from the pair of cells it joins, so it is stable frame to frame while
//      they drift. A fresh random bend each frame would make the web writhe.
//   2. Cells sprout DENDRITES that connect to nothing. Real neurons are
//      mostly unconnected branches, and without them a field of linked dots
//      stays a diagram. They grow only on the nearer cells, which is both
//      cheaper and what distance actually does to fine detail.
//   3. Signals travel ALONG those curves as a short lit segment of the axon,
//      not as a dot crossing open space.
//
// IT IS A PORTRAIT, NOT A BACKDROP. The field used to fill the screen, which
// put drifting cells behind every panel and every figure on it. It is now
// confined to a brain: cells are spawned inside the silhouette, bounce off
// the inside of it as they drift, and the outline is drawn around them. So it
// reads as one object being looked at rather than as wallpaper, and the rest
// of the screen is left alone.
//
// It is cheap. Nothing is allocated in the loop but the gradients, and when
// the screen is idle the field drifts slowly at low brightness rather than
// stopping — a field that freezes reads as a crash.

import React, { useEffect, useRef } from "react";

/** One cell per this many CSS pixels of area, clamped at both ends. */
const AREA_PER_NODE = 17000;
const MIN_NODES = 44;
const MAX_NODES = 82;

/**
 * The outline, in its own 100x78 space.
 *
 * A side view: frontal lobe at the left, the occipital swell at the right,
 * cerebellum tucked under the back and a short stem below it. Drawn as one
 * closed curve rather than assembled from parts, because the silhouette is
 * the whole job - a lumpy closed shape with a stem reads as a brain at this
 * size, and detail would be lost anyway.
 */
const BRAIN_PATH =
  "M34 6 C20 7 9 16 8 27 C2 31 1 41 8 46 C5 54 11 62 20 61" +
  " C23 68 33 71 41 66 C47 72 57 72 63 66 C74 69 85 62 86 52" +
  " C94 47 96 34 89 26 C87 13 74 4 60 6 C52 1 42 1 34 6 Z";
/** The stem, drawn separately: an outline alone reads as a bean. */
const BRAIN_STEM = "M52 68 C52 74 54 77 57 78";
/** The fissure between the lobes, which is what names the shape. */
const BRAIN_FOLDS = [
  "M30 12 C38 20 36 32 28 38",
  "M50 8 C56 20 52 34 44 42",
  "M70 12 C74 24 70 36 62 42",
  "M20 30 C30 34 34 44 30 54",
];
const BRAIN_VB = { w: 100, h: 78 };

/** Air between the box and the edges of the screen. */
export const BRAIN_MARGIN = 10;

/**
 * How big the portrait is on a given screen, in CSS pixels.
 *
 * Fluid rather than a breakpoint: it is a decoration, and on a short or
 * narrow screen it has to give way to the things that are not. The cap keeps
 * it from becoming the subject of the screen on a wide monitor - the orb is
 * the subject.
 *
 * Exported because the data cards have to stay off it, and they can only do
 * that if both agree on one number.
 */
export function brainBoxSize(w, h) {
  const width = Math.round(Math.max(96, Math.min(216, w * 0.17, h * 0.26)));
  return { w: width, h: Math.round((width * BRAIN_VB.h) / BRAIN_VB.w) };
}

/**
 * How far apart two cells may be and still grow an axon between them.
 *
 * Proportional to the box, not a fixed 190px. In a 200px-wide portrait a
 * fixed distance that was tuned for a whole screen connects every cell to
 * every other one, and a complete graph is a blob rather than a network.
 */
const linkDistFor = (w, h) => Math.max(30, Math.min(w, h) * 0.46);

/** Drift speed in px/sec, idle and working, before depth scales it. */
const SPEED_IDLE = 4;
const SPEED_HOT = 12;

/** How quickly the field reacts to the agent starting or stopping work. */
const HEAT_RISE = 2.2;
const HEAT_FALL = 0.9;

/** Sparks in flight, and how long one takes to cross an axon. */
const MAX_PULSES = 30;
const PULSE_SECONDS = 0.9;

/**
 * DEPTH.
 *
 * Every cell carries a z in [0,1]: 0 is far behind the screen, 1 is close to
 * the glass. It drives size, brightness, speed, sharpness and whether the
 * cell shows branches at all — five things from one number, which is what
 * makes it read as distance rather than as random variation.
 *
 * The softness is the part that is easy to make expensive. A canvas
 * `filter: blur()` switched per cell would cost more than the whole field;
 * instead a far cell's halo is drawn WIDER and fainter, which is what out of
 * focus looks like, for the price of one extra radial gradient.
 */
const CORE_MIN = 0.6;
const CORE_MAX = 2.8;

/** Below this depth a cell is too far away to resolve branches on. */
const DENDRITE_Z = 0.45;

const rand = (a, b) => a + Math.random() * (b - a);

/**
 * A stable bend for the axon between cells i and j.
 *
 * Hashed from the pair rather than stored, because which pairs are connected
 * changes every frame as they drift, and constant for a given pair, because
 * a fresh random bend per frame would set the entire web writhing.
 */
function bendFor(i, j) {
  const h = ((i * 73856093) ^ (j * 19349663)) >>> 0;
  return ((h % 2000) / 2000 - 0.5) * 0.52;
}

/** A point on the quadratic from a to b through control c. */
function quadAt(t, ax, ay, cx, cy, bx, by) {
  const u = 1 - t;
  return [
    u * u * ax + 2 * u * t * cx + t * t * bx,
    u * u * ay + 2 * u * t * cy + t * t * by,
  ];
}

/**
 * @param {boolean} active  the agent is working or answering
 * @param {string}  rim     the persona's accent as "r,g,b"
 */
export default function NeuronField({ active, rim = "94,234,212" }) {
  const canvasRef = useRef(null);
  // Read inside the loop rather than captured, so a change of persona or
  // phase does not restart the animation and teleport every cell.
  const activeRef = useRef(active);
  const rimRef = useRef(rim);
  activeRef.current = active;
  rimRef.current = rim;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;

    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

    let width = 0;
    let height = 0;
    /** The silhouette, scaled to the canvas. Rebuilt only on resize. */
    let shape = null;
    let outline = null;
    let stem = null;
    let folds = [];
    let linkDist = 190;
    /**
     * The device-pixel ratio, kept because containment needs it.
     *
     * `isPointInPath` transforms the PATH by the current matrix and then
     * tests the point in DEVICE pixels - the point is not put through the
     * transform with it. The context here is scaled by the dpr for retina,
     * so testing a CSS-pixel coordinate against it checks a point at half
     * the intended position: on a 2x screen every cell would be confined to
     * the top-left quarter of the brain. Verified in a browser rather than
     * assumed, because the two readings are indistinguishable at dpr 1 and
     * this was written on a dpr 1 machine.
     */
    let dpr = 1;

    /** Is this CSS-pixel point inside the silhouette? */
    const within = (x, y) => !shape || ctx.isPointInPath(shape, x * dpr, y * dpr);
    const nodes = [];
    const pulses = [];
    let heat = 0;
    let frame = 0;
    let last = 0;

    /**
     * Somewhere inside the brain.
     *
     * Rejection sampling: pick a point in the box, keep it if it is inside
     * the silhouette. The shape fills most of its box so this lands in a
     * couple of tries, and the fallback after 40 is the centre, which is
     * always inside - a spawn loop that can fail to terminate is not worth
     * the few pixels of distribution it would buy.
     */
    const inside = () => {
      for (let k = 0; k < 40; k++) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        if (shape && within(x, y)) return { x, y };
      }
      return { x: width / 2, y: height / 2 };
    };

    const makeNode = () => {
      // Biased towards the back, so the field has a deep middle distance and
      // only a few cells near the glass.
      const z = Math.pow(Math.random(), 1.6);
      // Branches belong to the cell and turn with it, so it keeps its shape
      // as it drifts instead of growing a new one every frame.
      const tendrils = [];
      const count = z > DENDRITE_Z ? 3 + ((Math.random() * 3) | 0) : 0;
      for (let k = 0; k < count; k++) {
        tendrils.push({
          a: rand(0, Math.PI * 2),
          // Scaled to the portrait: branches tuned for a full screen are
          // longer than the brain is wide.
          len: rand(0.06, 0.18) * Math.min(width, height) * (0.5 + z),
          bend: rand(-0.6, 0.6),
        });
      }
      const seed = inside();
      return {
        x: seed.x,
        y: seed.y,
        dx: rand(-1, 1),
        dy: rand(-1, 1),
        z,
        // Each cell breathes and turns on its own clock, so the field never
        // pulses in unison.
        phase: rand(0, Math.PI * 2),
        spin: rand(-0.06, 0.06),
        tendrils,
      };
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      // Retina: back the canvas with real device pixels and scale the
      // context, or every filament is drawn at half resolution.
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = "round";

      // Fit the silhouette into the box, centred, with a little air so the
      // outline's own stroke is not clipped.
      const scale = Math.min(width / BRAIN_VB.w, height / BRAIN_VB.h) * 0.94;
      const ox = (width - BRAIN_VB.w * scale) / 2;
      const oy = (height - BRAIN_VB.h * scale) / 2;
      const place = (d) => {
        const p = new Path2D();
        p.addPath(new Path2D(d), new DOMMatrix().translate(ox, oy).scale(scale));
        return p;
      };
      outline = place(BRAIN_PATH);
      stem = place(BRAIN_STEM);
      folds = BRAIN_FOLDS.map(place);
      // The region cells live in is the outline inset slightly, so a cell
      // body sits inside the line rather than on top of it.
      const inset = Math.min(width / BRAIN_VB.w, height / BRAIN_VB.h) * 0.86;
      const ix = (width - BRAIN_VB.w * inset) / 2;
      const iy = (height - BRAIN_VB.h * inset) / 2;
      shape = new Path2D();
      shape.addPath(
        new Path2D(BRAIN_PATH),
        new DOMMatrix().translate(ix, iy).scale(inset),
      );
      linkDist = linkDistFor(width, height);

      const want = Math.max(
        MIN_NODES,
        Math.min(MAX_NODES, Math.round((width * height) / AREA_PER_NODE)),
      );
      // Keep the cells that already exist. Rebuilding the field on a window
      // resize would make every one of them jump at once.
      while (nodes.length > want) nodes.pop();
      while (nodes.length < want) nodes.push(makeNode());
      for (const n of nodes) {
        const len = Math.hypot(n.dx, n.dy) || 1;
        n.dx /= len;
        n.dy /= len;
        // A cell left outside the silhouette after a resize would drift
        // around outside it forever: the bounce only turns cells that are
        // already in, so a stray has to be put back.
        if (!within(n.x, n.y)) {
          const seed = inside();
          n.x = seed.x;
          n.y = seed.y;
        }
      }
    };

    const spawnPulse = () => {
      if (pulses.length >= MAX_PULSES || nodes.length < 2) return;
      const a = (Math.random() * nodes.length) | 0;
      // Fire along an axon that actually exists, so a spark is never seen
      // crossing open space between two unconnected cells.
      for (let k = 0; k < 8; k++) {
        const b = (Math.random() * nodes.length) | 0;
        if (b === a) continue;
        const d = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y);
        if (d < linkDist) {
          pulses.push({ a, b, t: 0 });
          return;
        }
      }
    };

    const draw = (now) => {
      frame = requestAnimationFrame(draw);
      if (!width || !height) return;

      // Seconds since the last frame, capped: a backgrounded tab resumes with
      // a huge delta and every cell would teleport across the screen.
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 0.016;
      last = now;

      const target = activeRef.current ? 1 : 0;
      heat += (target - heat) * Math.min(1, dt * (target > heat ? HEAT_RISE : HEAT_FALL));

      const rgb = rimRef.current;
      const speed = still ? 0 : SPEED_IDLE + (SPEED_HOT - SPEED_IDLE) * heat;

      ctx.clearRect(0, 0, width, height);

      for (const n of nodes) {
        // Parallax: the far field crawls, the near one drifts.
        const par = 0.3 + 0.9 * n.z;
        const nx = n.x + n.dx * speed * par * dt;
        const ny = n.y + n.dy * speed * par * dt;
        // Inside the skull or not at all. Wrapping was right for a field
        // that filled the screen; here a cell that left would reappear on
        // the far side, outside the outline, which is the one thing that
        // would give away that this is a box of dots and not a brain.
        if (within(nx, ny)) {
          n.x = nx;
          n.y = ny;
        } else {
          // Turn away rather than reflect off a measured normal: the normal
          // of a bezier at the point of contact costs more than this looks
          // worth, and a cell that drifts off at a new angle is what the eye
          // reads either way.
          const a = Math.atan2(n.dy, n.dx) + Math.PI + rand(-0.7, 0.7);
          n.dx = Math.cos(a);
          n.dy = Math.sin(a);
        }
        n.phase += dt * (0.6 + heat) * (0.5 + n.z);
        for (const t of n.tendrils) t.a += n.spin * dt * (0.4 + heat);
      }

      // Neon is additive light, not paint. Under normal compositing the
      // overlapping halos darken each other into grey smudges instead of
      // building up where filaments cross, which is the whole look.
      ctx.globalCompositeOperation = "lighter";

      // ── the silhouette, under everything ──
      if (outline) {
        ctx.save();
        ctx.lineWidth = 1;
        ctx.strokeStyle = `rgba(${rgb},${(0.3 + 0.25 * heat).toFixed(3)})`;
        ctx.stroke(outline);
        ctx.stroke(stem);
        // The folds are what make a lumpy oval read as a brain, so they
        // brighten with the work rather than sitting at a fixed weight.
        ctx.lineWidth = 0.8;
        ctx.strokeStyle = `rgba(${rgb},${(0.1 + 0.2 * heat).toFixed(3)})`;
        for (const f of folds) ctx.stroke(f);
        ctx.restore();

        /**
         * Nothing escapes the skull.
         *
         * Keeping the cell BODIES inside is not enough: a dendrite is up to a
         * third of the box long and an axon bows outward between two cells
         * near the edge, so filaments were hanging outside the outline, which
         * is exactly the tell that this is a box of dots rather than a brain.
         * Clipping is the only version of this that cannot be got wrong by a
         * later change to how long a branch may be.
         *
         * Unlike `isPointInPath`, `clip` DOES put the path through the
         * current transform, so the silhouette in CSS pixels is correct here
         * with no dpr adjustment.
         */
        ctx.save();
        ctx.clip(outline);
      }

      // ── dendrites, drawn first so axons and cell bodies sit over them ──
      const dendriteBase = 0.15 + 0.28 * heat;
      for (const n of nodes) {
        if (!n.tendrils.length) continue;
        ctx.lineWidth = 0.35 + 0.6 * n.z;
        ctx.strokeStyle = `rgba(${rgb},${(dendriteBase * (0.4 + 0.8 * n.z)).toFixed(3)})`;
        for (const t of n.tendrils) {
          const ex = n.x + Math.cos(t.a) * t.len;
          const ey = n.y + Math.sin(t.a) * t.len;
          // Bent perpendicular to its own direction, so the branch arcs away
          // from the cell rather than kinking.
          const bx = (n.x + ex) / 2 - Math.sin(t.a) * t.len * t.bend;
          const by = (n.y + ey) / 2 + Math.cos(t.a) * t.len * t.bend;
          ctx.beginPath();
          ctx.moveTo(n.x, n.y);
          ctx.quadraticCurveTo(bx, by, ex, ey);
          ctx.stroke();
        }
      }

      // ── axons ──
      // The connections ARE the picture here, not a hint between cell
      // bodies, so they carry more of the light than they did when this was
      // a background and had to stay out of the way of the text on top.
      const linkBase = 0.3 + 0.42 * heat;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > linkDist * linkDist) continue;
          // Fade the axon out as the pair drifts apart, or connections snap
          // in and out of existence and the field flickers.
          const fade = 1 - Math.sqrt(d2) / linkDist;
          // An axon belongs to the nearer of its two ends at most, so it
          // never looks sharper than the cell it is attached to.
          const z = Math.min(a.z, b.z);
          const bend = bendFor(i, j);
          const cx = (a.x + b.x) / 2 - dy * bend;
          const cy = (a.y + b.y) / 2 + dx * bend;
          ctx.lineWidth = 0.35 + 0.8 * z;
          ctx.strokeStyle = `rgba(${rgb},${(linkBase * fade * (0.5 + 0.6 * z)).toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.quadraticCurveTo(cx, cy, b.x, b.y);
          ctx.stroke();
        }
      }

      // ── cell bodies ──
      for (const n of nodes) {
        const breath = 0.5 + 0.5 * Math.sin(n.phase);
        const core = CORE_MIN + (CORE_MAX - CORE_MIN) * n.z;
        const lit = 0.32 + 0.72 * heat + 0.2 * breath;
        const alpha = lit * (0.4 + 0.8 * n.z);

        // The bloom. Far cells get a wider, fainter one: that is what out of
        // focus looks like, and it costs one gradient rather than a filter.
        const halo = core * (3.4 + 5.2 * (1 - n.z)) * (1 + 0.3 * heat);
        const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, halo);
        g.addColorStop(0, `rgba(${rgb},${(alpha * 0.66).toFixed(3)})`);
        g.addColorStop(0.32, `rgba(${rgb},${(alpha * 0.22).toFixed(3)})`);
        g.addColorStop(1, `rgba(${rgb},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(n.x, n.y, halo, 0, Math.PI * 2);
        ctx.fill();

        // Near cells keep a hard bright centre; far ones are all bloom and no
        // core, which is how distance reads.
        ctx.fillStyle = `rgba(${rgb},${(alpha * (0.5 + 0.5 * n.z)).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(n.x, n.y, core, 0, Math.PI * 2);
        ctx.fill();
      }

      // ── sparks, travelling the axons ──
      if (!still && heat > 0.15 && Math.random() < heat * dt * 30) spawnPulse();

      for (let k = pulses.length - 1; k >= 0; k--) {
        const p = pulses[k];
        p.t += dt / PULSE_SECONDS;
        const a = nodes[p.a];
        const b = nodes[p.b];
        // A resize can shrink the field out from under a spark in flight.
        if (p.t >= 1 || !a || !b) {
          pulses.splice(k, 1);
          continue;
        }

        // The SAME bend the axon was drawn with, or the spark travels beside
        // its own wire instead of along it.
        const bend = bendFor(Math.min(p.a, p.b), Math.max(p.a, p.b));
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const cx = (a.x + b.x) / 2 - dy * bend;
        const cy = (a.y + b.y) / 2 + dx * bend;

        // Brightest in the middle of the trip, so it arrives and departs
        // softly instead of blinking on at the cell body.
        const glow = Math.sin(p.t * Math.PI);
        const z = Math.min(a.z, b.z);
        const depth = 0.3 + 0.9 * z;
        const [x, y] = quadAt(p.t, a.x, a.y, cx, cy, b.x, b.y);

        // A short lit SEGMENT of the axon rather than a dot riding on top of
        // it. This is what carries the illusion: the wire itself brightens.
        const tail = Math.max(0, p.t - 0.07);
        const [tx, ty] = quadAt(tail, a.x, a.y, cx, cy, b.x, b.y);
        ctx.lineWidth = 1 + 1.4 * glow * depth;
        ctx.strokeStyle = `rgba(${rgb},${(0.85 * glow * heat * depth).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(x, y);
        ctx.stroke();

        const spark = (2.4 + 3.6 * glow) * (0.6 + 0.7 * z);
        const sg = ctx.createRadialGradient(x, y, 0, x, y, spark);
        sg.addColorStop(0, `rgba(${rgb},${(0.55 * glow * heat * depth).toFixed(3)})`);
        sg.addColorStop(1, `rgba(${rgb},0)`);
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.arc(x, y, spark, 0, Math.PI * 2);
        ctx.fill();
      }

      // Matching the save that set the clip. Guarded the same way it was
      // taken, or a frame where the shape is not built yet would restore a
      // state that was never saved.
      if (outline) ctx.restore();

      // Leave the context as it was found: anything drawn after this without
      // resetting would also be additive.
      ctx.globalCompositeOperation = "source-over";
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="block w-full h-full pointer-events-none"
    />
  );
}
