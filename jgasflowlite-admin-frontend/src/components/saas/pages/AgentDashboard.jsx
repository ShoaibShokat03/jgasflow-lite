// src/components/saas/pages/AgentDashboard.jsx
//
// One agent's own readout, in the middle of the screen.
//
// IT REPLACES THE ORB, it does not sit beside it. Selecting an agent is a
// request to look at that agent's domain, and leaving the orb in place while
// a dashboard crowds in next to it gives neither enough room. The orb comes
// back when the selection is cleared.
//
// IT ONLY EVER SHOWS ONE AGENT. There is no comparison view, no "and here is
// what Bilal thinks": these four are independent monitors and a panel that
// mixed two of them would imply a relationship they do not have.
//
// THE FIGURES ARE REAL. They come from the platform's own endpoints, the
// same ones the Analytics, Clinics, Subscriptions and Invoices screens read.
// One that could not be fetched shows a dash rather than a plausible
// stand-in, which is why the loaders return null and never zero.

import React from "react";
import { X } from "lucide-react";
import MetricCard from "./MetricCard";
import LiveChart from "./LiveChart";
import { AGENT_STATE } from "./data/mockAgents";

/** A titled box around one chart. */
function ChartBox({ chart, accent, className = "" }) {
  return (
    <figure className={`min-w-0 border border-white/10 bg-white/[0.02] p-2 flex flex-col ${className}`}>
      <figcaption className="shrink-0 font-mono text-[9px] tracking-[0.16em] text-gray-500 mb-1.5 truncate">
        {chart.title.toUpperCase()}
      </figcaption>
      <div className="flex-1 min-h-0">
        <LiveChart chart={chart} accent={accent} />
      </div>
    </figure>
  );
}

/**
 * @param {object}   agent   from AGENTS
 * @param {object[]} metrics that agent's figures
 * @param {object[]} charts  that agent's charts
 * @param {string[]} moved   metric keys that changed in the last tick
 * @param {string}   state   what the agent is doing
 */
export default function AgentDashboard({ agent, metrics = [], charts = [], moved = [], state, onClose }) {
  if (!agent) return null;
  const accent = agent.accent;
  const word = AGENT_STATE[state]?.word;

  return (
    <section className="hud-in w-full h-full min-h-0 flex flex-col gap-2">
      {/* ══ who, and what they are doing ══ */}
      <header className="shrink-0 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2
            className="font-mono text-[15px] tracking-[0.18em] leading-none truncate"
            style={{ color: `rgb(${accent})` }}
          >
            {agent.name.toUpperCase()}
          </h2>
          <p className="mt-0.5 text-[11px] text-gray-400 truncate">{agent.role}</p>
        </div>

        {word && (
          <span
            className="shrink-0 font-mono text-[9px] tracking-[0.16em] px-1.5 py-0.5 border"
            style={{ color: `rgb(${accent})`, borderColor: `rgb(${accent})`, opacity: 0.8 }}
          >
            {word.toUpperCase()}
          </span>
        )}
        <button
          onClick={onClose}
          title="Back to the core"
          className="shrink-0 text-gray-500 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </header>

      {/* ══ the figures ══ */}
      <div className="shrink-0 grid grid-cols-2 sm:grid-cols-4 gap-1.5">
        {metrics.map((m) => (
          <MetricCard key={m.key} metric={m} accent={accent} moved={moved.includes(m.key)} />
        ))}
      </div>

      {/* ══ and what they look like ══
          Scrolls rather than squeezing: a chart compressed to forty pixels
          tall is a smear, and this panel has to work on a laptop as well as
          a monitor. */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-none grid gap-1.5 sm:grid-cols-2 auto-rows-[112px]">
        {charts.map((c, i) => (
          <ChartBox
            key={c.key}
            chart={c}
            accent={accent}
            // The first chart is the headline one and gets the full width.
            className={i === 0 ? "sm:col-span-2" : ""}
          />
        ))}
      </div>
    </section>
  );
}
