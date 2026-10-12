// src/components/saas/pages/useLiveMetrics.js
//
// The agents' figures, fetched from the platform.
//
// REAL. Every number here is read from the same endpoints the Analytics,
// Clinics, Subscriptions and Invoices screens use. There is no simulation,
// nothing drifts on a timer, and a figure that could not be fetched is shown
// as a dash rather than filled in with something plausible - which is the
// whole reason the loaders return null instead of zero.
//
// ONE REQUEST PER AGENT, STAGGERED. They are independent, so each one loads
// and refreshes on its own. Staggering them also keeps four requests off the
// same moment, which matters because several of these are count queries.
//
// IT STOPS WHEN NOBODY IS LOOKING. Nothing is fetched while the screen is
// closed or the tab is hidden: a background tab polling an admin API is pure
// waste, and `setInterval` keeps firing in one long after rAF has been
// throttled away.

import { useCallback, useEffect, useRef, useState } from "react";
import { AGENTS } from "./data/mockAgents";
import { SOURCES } from "./data/agentSources";
import { activityFor, pushActivity } from "./data/mockActivity";

/** How often an agent re-reads its own figures. */
const REFRESH_MS = 60_000;
/** Gap between agents, so four count queries do not land together. */
const STAGGER_MS = 900;
/** How long an agent stays lit after it reports. */
const GLOW_MS = 1800;

const EMPTY = { chief: [], ops: [], accounts: [], growth: [] };

/**
 * @param {boolean} running whether the screen is open
 */
export default function useLiveMetrics(running) {
  const [metrics, setMetrics] = useState(EMPTY);
  const [charts, setCharts] = useState(EMPTY);
  const [activity, setActivity] = useState([]);
  const [states, setStates] = useState({});
  /** Which metric keys changed since the last read, so only those pulse. */
  const [changed, setChanged] = useState({});

  const timers = useRef([]);
  const alive = useRef(true);
  const prev = useRef({});

  const load = useCallback(async (key) => {
    const fetcher = SOURCES[key];
    if (!fetcher) return;

    setStates((s) => ({ ...s, [key]: "analyzing" }));
    let next;
    try {
      next = await fetcher();
    } catch {
      // An agent that cannot read its own domain says so, and the others
      // carry on: that is what independent means here.
      if (alive.current) setStates((s) => ({ ...s, [key]: "error" }));
      return;
    }
    if (!alive.current) return;

    // What actually moved since the last read. A figure that is unchanged
    // must not pulse, or the pulse stops meaning anything.
    const before = prev.current[key] ?? [];
    const moved = next.metrics
      .filter((m) => {
        const was = before.find((b) => b.key === m.key);
        return was && was.value != null && m.value != null && was.value !== m.value;
      })
      .map((m) => m.key);

    const withTrend = next.metrics.map((m) => {
      const was = before.find((b) => b.key === m.key);
      return { ...m, trend: was?.value != null && m.value != null ? m.value - was.value : 0 };
    });

    prev.current[key] = withTrend;
    setMetrics((p) => ({ ...p, [key]: withTrend }));
    setCharts((p) => ({ ...p, [key]: next.charts }));
    setChanged((c) => ({ ...c, [key]: moved }));

    // Only a real change is worth a line in the feed. A reload that returned
    // the same figures is not news.
    if (moved.length) {
      setActivity((list) => pushActivity(list, activityFor(key, withTrend, moved)));
    }

    setStates((s) => ({ ...s, [key]: "updating" }));
    const quiet = setTimeout(() => {
      if (!alive.current) return;
      setStates((s) => ({ ...s, [key]: "idle" }));
      setChanged((c) => ({ ...c, [key]: [] }));
    }, GLOW_MS);
    timers.current.push(quiet);
  }, []);

  useEffect(() => {
    if (!running) return undefined;
    alive.current = true;

    // First pass, staggered.
    AGENTS.forEach((a, i) => {
      timers.current.push(setTimeout(() => load(a.key), 200 + i * STAGGER_MS));
    });

    const id = setInterval(() => {
      if (document.hidden) return;
      AGENTS.forEach((a, i) => {
        timers.current.push(setTimeout(() => load(a.key), i * STAGGER_MS));
      });
    }, REFRESH_MS);

    return () => {
      alive.current = false;
      clearInterval(id);
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, [running, load]);

  return { metrics, charts, activity, states, changed, reload: load };
}
