// src/components/saas/pages/AgentNetwork.jsx
//
// Four independent monitors, each with one line to the core.
//
// NOTHING JOINS TWO AGENTS. Omar, Ayesha, Bilal and Sana do not talk to each
// other, do not delegate and do not answer on each other's behalf, so there
// is no mark on this screen that connects one to another. Every line runs
// between the core and a single agent, and it means a data stream: that agent
// reporting its own domain inward.
//
// AND NOTHING SITS ON THE DIAL. An earlier version put these nodes with their
// names on the instrument ring itself. The ring's ticks and sweeps are the
// whole reason the orb reads as an instrument rather than a logo, and four
// labels across them turned it into a cluttered diagram. The nodes sit
// OUTSIDE the ring now, at the four compass points, with the dial untouched.
//
// A LINE ONLY CARRIES TRAFFIC WHEN THERE IS TRAFFIC. A stream is dim and
// still while its agent is quiet, and runs particles inward while that agent
// is reporting. Motion here always means something just happened.

import React from "react";
import { Compass, Activity, Receipt, TrendingUp, Sparkles } from "lucide-react";
import { AGENT_STATE } from "./data/mockAgents";

const ICONS = {
  compass: Compass,
  activity: Activity,
  receipt: Receipt,
  "trending-up": TrendingUp,
};

/**
 * Where each node sits, relative to the ring box it surrounds.
 *
 * Percentages of the box, so the nodes track the ring at every size without
 * measuring anything: the ring is fluid and a fixed offset would be right at
 * one width only.
 */
/*
 * A seat is a DIRECTION from the core, not a compass word.
 *
 * It was four hard-coded positions with a vertical/horizontal flag, which
 * meant a fifth agent could not be seated at all without a diagonal case in
 * every piece of geometry. A unit vector places the node, draws the line and
 * animates the pulse with one set of maths, so the next colleague is a row
 * in the roster rather than a change here.
 */
const at = (dx, dy) => ({
  dx,
  dy,
  style: {
    left: `${50 + dx * 50}%`,
    top: `${50 + dy * 50}%`,
    transform: "translate(-50%,-50%)",
  },
});

const SEATS = {
  top: at(0, -1),
  bottom: at(0, 1),
  left: at(-1, 0),
  right: at(1, 0),
  // Normalised, or a diagonal node sits further out than the compass four.
  topRight: at(0.707, -0.707),
  topLeft: at(-0.707, -0.707),
  bottomRight: at(0.707, 0.707),
  bottomLeft: at(-0.707, 0.707),
};

/** One agent. */
function AgentNode({ agent, state, selected, speaking, headline, onSelect }) {
  const Glyph = ICONS[agent.icon] ?? Sparkles;
  const look = AGENT_STATE[state] ?? AGENT_STATE.idle;
  const accent = agent.accent;
  // Drawn as text or a glyph rather than as light, so it needs the dark hue.
  const ink = agent.ink ?? agent.accent;

  return (
    <button
      onClick={() => onSelect(agent.key)}
      title={`${agent.name} · ${agent.role}`}
      className="pointer-events-auto absolute flex flex-col items-center gap-1 group"
      style={SEATS[agent.seat].style}
    >
      <span className="relative grid place-items-center">
        {/* Live work, as a ring that leaves. */}
        {look.live && (
          <span
            aria-hidden="true"
            className="absolute inset-0 rounded-full animate-ping"
            style={{ border: `1px solid rgb(${accent})`, opacity: 0.45, animationDuration: "1.5s" }}
          />
        )}
        <span
          className="w-9 h-9 rounded-full grid place-items-center border transition-all duration-300"
          style={{
            borderColor: `rgb(${ink})`,
            /* Was a near-black disc, which on the light surface read as a
               dead grey button for every agent that was not selected. */
            background: selected ? `rgba(${ink},0.12)` : "rgba(255,255,255,0.92)",
            opacity: selected || look.live || speaking ? 1 : 0.62,
            boxShadow: selected ? `0 0 0 1px rgb(${accent})` : "none",
          }}
        >
          <Glyph className="w-4 h-4" style={{ color: `rgb(${ink})` }} />
        </span>
        {/* The agent currently holding the conversation. */}
        {speaking && (
          <span
            aria-hidden="true"
            className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-white"
            style={{ background: `rgb(${ink})` }}
          />
        )}
      </span>

      <span className="font-mono text-[8.5px] tracking-[0.18em] text-gray-400 group-hover:text-white transition-colors">
        {agent.name.toUpperCase()}
      </span>
      {/* The state word, or the headline figure when quiet. A node that always
          carries the same label teaches the eye to skip it. */}
      <span
        className="font-mono text-[8px] tracking-[0.1em] leading-none"
        style={{ color: look.word ? `rgb(${ink})` : "rgb(100,116,139)" }}
      >
        {(look.word || headline?.shown || "").toUpperCase()}
      </span>
    </button>
  );
}

/**
 * @param {object[]} agents   from AGENTS
 * @param {object}   states   agent key to state
 * @param {string}   selected which dashboard is open, if any
 * @param {string}   speaking which agent holds the conversation
 * @param {object}   headlines agent key to {label, shown}
 */
export default function AgentNetwork({
  agents = [],
  states = {},
  selected,
  speaking,
  headlines = {},
  onSelect,
}) {
  if (!agents.length) return null;

  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* ══ the data streams ══
          One per agent, from the core outward. Drawn in the box's own
          percentage space so they stay attached to the ring at any size. */}
      <svg
        aria-hidden="true"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full"
      >
        {agents.map((agent) => {
          const seat = SEATS[agent.seat];
          if (!seat) return null;
          const live = (AGENT_STATE[states[agent.key]] ?? AGENT_STATE.idle).live;
          // From just outside the orb to just short of the node, along the
          // seat's own direction.
          const x1 = 50 + seat.dx * 26;
          const y1 = 50 + seat.dy * 26;
          const x2 = 50 + seat.dx * 44;
          const y2 = 50 + seat.dy * 44;

          return (
            <g key={agent.key}>
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={`rgb(${agent.accent})`}
                strokeWidth="0.4"
                opacity={live ? 0.75 : 0.22}
                vectorEffect="non-scaling-stroke"
              />
              {live && (
                /* Inward: the agent is reporting to the core, and direction
                   is most of what a stream means. */
                <circle r="0.9" fill={`rgb(${agent.accent})`}>
                  {/* Both axes animate, so a diagonal stream travels along
                      its own line instead of along one axis only. */}
                  <animate
                    attributeName="cx"
                    values={`${x2};${x1}`}
                    dur="1.1s"
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="cy"
                    values={`${y2};${y1}`}
                    dur="1.1s"
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    values="0;1;0"
                    dur="1.1s"
                    repeatCount="indefinite"
                  />
                </circle>
              )}
            </g>
          );
        })}
      </svg>

      {agents.map((agent) => (
        <AgentNode
          key={agent.key}
          agent={agent}
          state={states[agent.key]}
          selected={selected === agent.key}
          speaking={speaking === agent.key}
          headline={headlines[agent.key]}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
