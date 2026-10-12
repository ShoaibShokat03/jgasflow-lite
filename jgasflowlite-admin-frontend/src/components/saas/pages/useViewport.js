// src/components/saas/pages/useViewport.js
//
// The size of the window, as state.
//
// The voice screen lays itself out around the orb, and several things have to
// agree about how much room there is: the data cards choose between sitting
// beside the ring and sitting in the corners, and the brain portrait sizes
// itself against both. A CSS breakpoint cannot express "is there room for the
// ring plus a card plus air on both sides", and guessing at one is how the
// cards ended up at `left: -144` on a 373px screen - entirely off the edge.

import { useEffect, useState } from "react";

export default function useViewport() {
  const [vp, setVp] = useState(() => ({
    // Rendered on the server or in a test there is no window; these are only
    // ever the value for one frame, because the effect measures immediately.
    w: typeof window === "undefined" ? 1280 : window.innerWidth,
    h: typeof window === "undefined" ? 800 : window.innerHeight,
  }));

  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    // Measure once on mount as well as on resize: entering fullscreen changes
    // the viewport before this mounts, so the initial state is already stale.
    on();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);

  return vp;
}
