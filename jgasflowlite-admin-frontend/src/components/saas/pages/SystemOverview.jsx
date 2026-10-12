// src/components/saas/pages/SystemOverview.jsx
//
// The core's own readout, when no agent has been picked.
//
// ONE HEADLINE PER AGENT, not a dashboard of its own. The overview's job is
// to say what is available and which way it is moving, so that choosing an
// agent is an informed click rather than a guess. Giving the core a full set
// of panels would make the four agents decorative - everything worth seeing
// would already be on screen.
//
// IT SITS UNDER THE BRAIN PORTRAIT, in the right-hand column, so the middle
// of the screen stays the orb's. Stacked rather than in a row, because the
// column is only as wide as the portrait above it and four figures across
// that would be four truncated labels.
//
// THESE ARE REAL. Every figure comes from the platform's own endpoints - the
// same ones the Analytics, Clinics, Subscriptions and Invoices screens use.
// A figure that could not be read shows a dash, never a plausible stand-in,
// which is why the loaders return null rather than zero.

import React from "react";
import { FORMATS } from "./data/agentSources";
import { AGENT_STATE } from "./data/mockAgents";

/**
 * @param {object[]} agents  from AGENTS
 * @param {object}   metrics the whole table
 * @param {object}   states  agent key to state
 * @param {object}   changed agent key to the metric keys that just moved
 */
export default function SystemOverview({
  agents = [],
  metrics = {},
  states = {},
  changed = {},
  stacked = false,
  onSelect,
}) {
  if (!agents.length) return null;

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 mb-1.5 px-0.5">
        <span className="font-mono text-[9px] tracking-[0.22em] text-gray-500">SYSTEM OVERVIEW</span>
        <span className="flex-1 h-px bg-white/10" />
      </div>

      <div className={stacked ? "flex flex-col gap-1" : "grid grid-cols-2 sm:grid-cols-4 gap-1.5"}>
        {agents.map((agent) => {
          const lead = metrics[agent.key]?.[0];
          if (!lead) return null;
          const moved = (changed[agent.key] ?? []).includes(lead.key);
          const live = (AGENT_STATE[states[agent.key]] ?? AGENT_STATE.idle).live;

          return (
            <button
              key={agent.key}
              onClick={() => onSelect?.(agent.key)}
              title={`${agent.name} · ${agent.role}`}
              className={`relative text-left border px-2 py-1.5 transition-colors duration-500 ${
                moved ? "border-white/25 bg-white/[0.06]" : "border-white/10 bg-white/[0.02]"
              } hover:bg-white/[0.08]`}
            >
              {live && (
                <span
                  aria-hidden="true"
                  className="absolute top-1 right-1 w-1 h-1 rounded-full animate-pulse"
                  style={{ background: `rgb(${agent.ink})` }}
                />
              )}
              <p className="font-mono text-[8.5px] tracking-[0.16em] text-gray-500 truncate">
                {agent.name.toUpperCase()}
              </p>
              <p
                className="font-mono text-[15px] leading-tight tabular-nums truncate"
                /* Ink, not accent: a pastel figure on a white tile is
                   unreadable, which is exactly how the billing number
                   shipped. */
                style={{ color: `rgb(${agent.ink})` }}
              >
                {FORMATS[lead.format](lead.value)}
              </p>
              <p className="text-[9.5px] leading-none text-gray-500 truncate">{lead.label}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
