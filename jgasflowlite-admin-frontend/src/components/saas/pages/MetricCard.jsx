// src/components/saas/pages/MetricCard.jsx
//
// One figure, and what it just did.
//
// THE NUMBER COUNTS TO ITS NEW VALUE rather than swapping to it. A figure
// that changes between two frames is read as a different figure; one that
// travels is read as the same figure moving, which is the whole point of
// watching it. The travel is short - a third of a second - because this is a
// readout, not an odometer.
//
// ONLY WHAT MOVED PULSES. `moved` comes from the data layer and names exactly
// the metrics that changed in that tick. Pulsing every tile on every tick
// teaches the eye to ignore the pulse, and then the one that matters is not
// seen either.

import React, { useEffect, useRef, useState } from "react";
import { FORMATS } from "./data/agentSources";

/** How long a figure takes to travel to its new value. */
const ROLL_MS = 340;

function useRolling(target) {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  const raf = useRef(0);

  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    const b = target;
    if (a === b) return undefined;

    const step = (now) => {
      const t = Math.min(1, (now - start) / ROLL_MS);
      // Ease out: a figure that arrives gently reads as settling, and a
      // linear one reads as a counter being driven.
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(a + (b - a) * eased);
      if (t < 1) raf.current = requestAnimationFrame(step);
      else from.current = b;
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [target]);

  // rAF does not run in a hidden tab, so a value that changed while the page
  // was in the background would be stuck mid-travel on return.
  useEffect(() => {
    const on = () => {
      if (!document.hidden) return;
      cancelAnimationFrame(raf.current);
      from.current = target;
      setShown(target);
    };
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, [target]);

  return shown;
}

/**
 * @param {object}  metric one entry from the metrics table
 * @param {string}  accent the agent's hue, "r,g,b"
 * @param {boolean} moved  whether this one changed in the last tick
 */
export default function MetricCard({ metric, accent, moved }) {
  const shown = useRolling(metric.value);
  const rising = (metric.trend ?? 0) > 0;

  return (
    <div
      className={`relative border px-2.5 py-2 transition-colors duration-500 ${
        moved ? "border-white/25 bg-white/[0.05]" : "border-white/10 bg-white/[0.02]"
      }`}
    >
      {/* The pulse is a ring that leaves, not a flash: a flash is over before
          the eye reaches it. */}
      {moved && (
        <span
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none animate-ping"
          style={{ border: `1px solid rgb(${accent})`, opacity: 0.35, animationDuration: "1.1s" }}
        />
      )}
      <p className="font-mono text-[9px] tracking-[0.16em] text-gray-500 truncate">
        {metric.label.toUpperCase()}
      </p>
      <p
        className="font-mono text-[19px] leading-tight tabular-nums truncate"
        style={{ color: `rgb(${accent})` }}
      >
        {FORMATS[metric.format](shown)}
      </p>
      {moved && metric.trend ? (
        <p
          className={`font-mono text-[9.5px] leading-none ${
            rising ? "text-emerald-300" : "text-rose-300"
          }`}
        >
          {rising ? "▲" : "▼"} {FORMATS[metric.format](Math.abs(metric.trend))}
        </p>
      ) : (
        <p className="font-mono text-[9.5px] leading-none text-transparent select-none">.</p>
      )}
    </div>
  );
}
