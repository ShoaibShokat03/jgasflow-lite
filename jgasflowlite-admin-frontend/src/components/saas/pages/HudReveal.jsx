// src/components/saas/pages/HudReveal.jsx
//
// Panels that arrive and leave instead of always being there.
//
// THE PROBLEM THIS SOLVES. React unmounts instantly, so a panel that is
// conditionally rendered can animate IN and never OUT — it is simply gone on
// the frame the condition flips. Keeping every panel mounted and hiding it
// with opacity fixes the animation and breaks everything else: hidden panels
// still take layout, still run their canvases, and are still in the tab
// order, so a screen reader announces four panels that are not on screen.
//
// So the child is held for the length of the exit and then genuinely
// unmounted. `when` is the truth; what is rendered lags it by one animation.
//
// IT ANIMATES, IT DOES NOT TRANSITION. A CSS transition needs the element to
// exist in its start state for a frame before the end state is applied, which
// means waiting on requestAnimationFrame. rAF is throttled in a background
// tab and on a busy machine, and the first version of this file gated the
// entrance behind two of them — so a panel could mount, never reach opacity
// 1, and sit there invisible. An animation runs from its own keyframes the
// moment the class lands, with no second pass to miss.

import React, { useEffect, useRef, useState } from "react";

/** Must match .hud-in / .hud-out in index.css. */
const ENTER_MS = 380;
const EXIT_MS = 240;

const OFFSET = {
  bottom: "translate3d(0, 14px, 0)",
  top: "translate3d(0, -14px, 0)",
  left: "translate3d(-16px, 0, 0)",
  right: "translate3d(16px, 0, 0)",
};

/**
 * @param {boolean}  when     render the child
 * @param {number}   delay    stagger, in ms, applied to the entrance only
 * @param {string}   from     which edge it travels from
 * @param {function} onEnter  fired once per arrival, when it has settled
 */
export default function HudReveal({
  when,
  delay = 0,
  from = "bottom",
  onEnter,
  className = "",
  children,
}) {
  const [mounted, setMounted] = useState(when);
  const [leaving, setLeaving] = useState(false);
  const timers = useRef([]);
  const enterCb = useRef(onEnter);
  enterCb.current = onEnter;

  useEffect(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];

    if (when) {
      setMounted(true);
      setLeaving(false);
      timers.current.push(
        setTimeout(() => enterCb.current?.(), delay + ENTER_MS),
      );
    } else {
      setLeaving(true);
      timers.current.push(setTimeout(() => setMounted(false), EXIT_MS));
    }

    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, [when, delay]);

  if (!mounted) return null;

  return (
    <div
      className={`${leaving ? "hud-out" : "hud-in"} ${className}`}
      // A panel on its way out must not be clickable or focusable, or a
      // mis-timed click lands on something already seen to disappear.
      inert={leaving || undefined}
      style={{
        "--hud-from": OFFSET[from] ?? OFFSET.bottom,
        animationDelay: leaving ? "0ms" : `${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}
