// src/components/saas/pages/ActivityFeed.jsx
//
// What each agent just reported, newest first.
//
// EVERY ENTRY HAS ONE AGENT. There is no "from X to Y" here, because nothing
// goes between agents: these are independent monitors each saying what
// it found in its own domain.
//
// NEW ENTRIES ARRIVE, they do not appear. The list is read from the top, so a
// new line sliding in from above is the only motion that matches how it is
// read - and it is the cue that tells a reader something changed without
// their having to diff two screenfuls.

import React from "react";
import { Compass, Activity, Receipt, TrendingUp, Target, Sparkles } from "lucide-react";
import { clockOf } from "./data/mockActivity";

const ICONS = {
  compass: Compass,
  activity: Activity,
  receipt: Receipt,
  "trending-up": TrendingUp,
  target: Target,
};

/**
 * What to say, while there is nothing to report yet.
 *
 * The panel used to read "WAITING FOR THE FIRST REPORT", which was accurate
 * and useless: it is the largest area on the screen, it is empty for the
 * first thirty seconds of every session, and a voice interface that does
 * not say what it understands leaves you guessing at it.
 *
 * One per agent, phrased the way somebody would actually say it out loud,
 * and each one demonstrates a different way in: a name, a plain question,
 * and the word "should" that routes to strategy rather than to the noun it
 * contains.
 */
const OPENERS = [
  { who: "Omar", say: "Brief me on the platform" },
  { who: "Ayesha", say: "Which shops have gone quiet?" },
  { who: "Bilal", say: "Which payments are waiting?" },
  { who: "Zara", say: "What should we do to grow?" },
];

export default function ActivityFeed({ entries = [], onSelect }) {
  if (!entries.length) {
    return (
      <div className="px-1 py-1.5">
        <p className="font-mono text-[9px] tracking-[0.2em] text-gray-500 mb-2">
          TRY SAYING
        </p>
        <ul className="space-y-1.5">
          {OPENERS.map((o) => (
            <li key={o.say} className="leading-snug">
              <span className="block text-[12px] text-gray-200">
                &ldquo;{o.say}&rdquo;
              </span>
              <span className="font-mono text-[8.5px] tracking-[0.16em] text-gray-500">
                {o.who.toUpperCase()} ANSWERS
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <ul className="space-y-1">
      {entries.map((e) => {
        const Glyph = ICONS[e.icon] ?? Sparkles;
        return (
          <li key={e.id}>
            <button
              onClick={() => onSelect?.(e.agent)}
              className="hud-in w-full flex items-start gap-1.5 px-1 py-1 rounded text-left hover:bg-white/[0.05] transition-colors"
            >
              <span
                className="shrink-0 mt-0.5 w-4 h-4 rounded grid place-items-center"
                style={{ background: `rgba(${e.accent},0.18)` }}
              >
                <Glyph className="w-2.5 h-2.5" style={{ color: `rgb(${e.accent})` }} />
              </span>

              <span className="min-w-0 flex-1 leading-tight">
                <span className="flex items-baseline gap-1.5">
                  <span className="font-mono text-[9px] text-gray-600 tabular-nums">
                    {clockOf(e.at)}
                  </span>
                  <span className="text-[11px] font-medium" style={{ color: `rgb(${e.accent})` }}>
                    {e.name}
                  </span>
                  {e.change && (
                    <span
                      className={`ml-auto font-mono text-[9.5px] tabular-nums ${
                        e.status === "up" ? "text-emerald-300" : "text-rose-300"
                      }`}
                    >
                      {e.change}
                    </span>
                  )}
                </span>
                <span className="block text-[10.5px] text-gray-400 truncate">{e.message}</span>
                <span className="block font-mono text-[9.5px] text-gray-500 truncate">
                  {e.detail}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
