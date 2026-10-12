// src/components/saas/pages/data/mockActivity.js
//
// What each agent reports, as it reports it.
//
// EVERY EVENT HAS EXACTLY ONE AGENT. There is no `to`, because nothing here
// goes to anybody: these are four independent monitors each saying what it
// just found in its own domain. An event with two agents in it would be the
// agent-to-agent traffic this screen is specifically not about.
//
// THE MESSAGE COMES FROM THE FIGURE THAT MOVED. An entry is written from the
// metric that actually changed in that tick, so the log and the dashboard can
// never disagree: if the feed says visitors are up, the visitors tile moved.
// A pool of generic sentences picked at random would drift from the numbers
// within a minute and the whole thing would stop being readable.

import { FORMATS } from "./agentSources";
import { AGENT_BY_KEY } from "./mockAgents";

/** How many entries the feed keeps. It is a window, not an archive. */
export const MAX_ACTIVITY = 40;

let seq = 0;

/** hh:mm, which is the resolution anyone reads a feed at. */
export function clockOf(at) {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * One entry, written from what actually moved.
 *
 * @param {string}   agentKey whose domain this is
 * @param {object[]} row      that agent's metrics, after the tick
 * @param {string[]} changed  the keys that moved
 */
export function activityFor(agentKey, row, changed) {
  const agent = AGENT_BY_KEY[agentKey];
  if (!agent || !changed.length) return null;

  // The biggest mover is the one worth a line. Several changed figures in one
  // tick make one entry, not four: a feed that reports every cell is a
  // spreadsheet scrolling past.
  const moved = row
    .filter((m) => changed.includes(m.key))
    .sort((a, b) => Math.abs(b.trend ?? 0) - Math.abs(a.trend ?? 0));
  const lead = moved[0];
  if (!lead) return null;

  const delta = lead.trend ?? 0;
  const pct = lead.value ? (delta / lead.value) * 100 : 0;
  const rising = delta > 0;

  seq += 1;
  return {
    id: `a${seq}`,
    agent: agentKey,
    name: agent.name,
    icon: agent.icon,
    accent: agent.accent,
    at: Date.now(),
    status: rising ? "up" : "down",
    message: `${agent.domain} updated`,
    detail: `${lead.label} ${FORMATS[lead.format](lead.value)}`,
    // Only worth showing when it is big enough to read as a move rather than
    // as noise on the last digit.
    change: Math.abs(pct) >= 0.05 ? `${rising ? "+" : "-"}${Math.abs(pct).toFixed(1)}%` : null,
  };
}

/** Newest first, capped. */
export function pushActivity(list, entry) {
  if (!entry) return list;
  return [entry, ...list].slice(0, MAX_ACTIVITY);
}
