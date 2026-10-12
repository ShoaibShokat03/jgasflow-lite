// src/components/saas/pages/LiveChart.jsx
//
// One chart component, five marks.
//
// HAND-DRAWN SVG, because this app has no charting library and adding one for
// five small marks would cost more in bundle than it saves in code. Each mark
// is a path built from the data; there is no layout engine to fight and
// nothing to theme around.
//
// THE MARK FOLLOWS THE QUESTION. A line for a quantity over time, an area for
// a cumulative one, bars for named categories, a donut for parts of a whole,
// a radial for progress towards a target. One series per chart, so identity
// is never carried by colour and no legend is needed: the title names the
// measure.
//
// IT IS NOT A DECORATION. Every value drawn is a value in the data, the axis
// starts where the data starts, and nothing is smoothed into a shape the
// numbers do not have.

import React, { useMemo } from "react";

/** The drawing box. Charts scale to their container through the viewBox. */
const W = 300;
const H = 96;
const PAD = 4;

/** A point list to a path, straight segments: no invented curvature. */
function linePath(values, w, h) {
  if (!values.length) return "";
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const step = values.length > 1 ? (w - PAD * 2) / (values.length - 1) : 0;
  return values
    .map((v, i) => {
      const x = PAD + i * step;
      const y = PAD + (1 - (v - min) / span) * (h - PAD * 2);
      return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

function Line({ values, accent, area }) {
  const d = useMemo(() => linePath(values, W, H), [values]);
  const floor = H - PAD;
  const closed = `${d} L${(W - PAD).toFixed(1)} ${floor} L${PAD} ${floor} Z`;
  const last = values[values.length - 1];
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const lastY = PAD + (1 - (last - min) / span) * (H - PAD * 2);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="none">
      {area && (
        <>
          <defs>
            <linearGradient id={`fill-${accent.replace(/\D/g, "")}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={`rgb(${accent})`} stopOpacity="0.28" />
              <stop offset="100%" stopColor={`rgb(${accent})`} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={closed} fill={`url(#fill-${accent.replace(/\D/g, "")})`} />
        </>
      )}
      <path
        d={d}
        fill="none"
        stroke={`rgb(${accent})`}
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      {/* The newest point, which is the one being watched. */}
      <circle cx={W - PAD} cy={lastY} r="2.6" fill={`rgb(${accent})`}>
        <animate attributeName="r" values="2.6;4.2;2.6" dur="2s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

function Bars({ labels, values, accent }) {
  const max = Math.max(...values) || 1;
  return (
    /* `items-stretch`, NOT `items-end`.
       The bars are already anchored to the baseline inside their own column,
       and `items-end` on the row stopped those columns stretching: each one
       collapsed to the height of its label - measured at 16px - which left
       every bar's slot at zero and the chart showing nothing but day names. */
    <div className="h-full flex items-stretch gap-1">
      {values.map((v, i) => (
        <div key={i} className="h-full flex-1 flex flex-col items-center gap-1 min-w-0">
          <div className="w-full flex-1 flex items-end">
            <div
              className="w-full rounded-t-[3px] transition-[height] duration-500 ease-out"
              style={{
                height: `${Math.max((v / max) * 100, 3)}%`,
                background: `rgb(${accent})`,
                opacity: 0.35 + (v / max) * 0.65,
              }}
              title={`${labels[i]}: ${v.toLocaleString("en-US")}`}
            />
          </div>
          <span className="shrink-0 font-mono text-[8px] text-gray-500 truncate w-full text-center">
            {labels[i]}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Parts of a whole. Shares one hue by lightness, so no legend is needed. */
function Donut({ slices, accent }) {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const R = 34;
  const C = 2 * Math.PI * R;
  let offset = 0;

  return (
    <div className="h-full flex items-center gap-3">
      <svg viewBox="0 0 88 88" className="h-full shrink-0" style={{ width: 88 }}>
        <circle cx="44" cy="44" r={R} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="11" />
        {slices.map((s, i) => {
          const frac = s.value / total;
          const dash = frac * C;
          const el = (
            <circle
              key={s.label}
              cx="44"
              cy="44"
              r={R}
              fill="none"
              stroke={`rgb(${accent})`}
              strokeOpacity={1 - i * (0.72 / Math.max(slices.length - 1, 1))}
              strokeWidth="11"
              strokeDasharray={`${dash.toFixed(2)} ${(C - dash).toFixed(2)}`}
              strokeDashoffset={(-offset).toFixed(2)}
              // Starts at twelve o'clock, which is where a reader expects it.
              transform="rotate(-90 44 44)"
            />
          );
          offset += dash;
          return el;
        })}
      </svg>
      <ul className="min-w-0 flex-1 space-y-0.5">
        {slices.map((s, i) => (
          <li key={s.label} className="flex items-center gap-1.5 text-[10.5px]">
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{
                background: `rgb(${accent})`,
                opacity: 1 - i * (0.72 / Math.max(slices.length - 1, 1)),
              }}
            />
            <span className="flex-1 truncate text-gray-400">{s.label}</span>
            <span className="font-mono tabular-nums text-gray-200">
              {s.value.toLocaleString("en-US")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Progress towards a target. The target is named, or the ring means nothing. */
function Radial({ value, target, unit, accent }) {
  const frac = Math.max(0, Math.min(1, target ? value / target : 0));
  const R = 32;
  const C = 2 * Math.PI * R;
  return (
    <div className="h-full flex items-center justify-center gap-3">
      <svg viewBox="0 0 80 80" className="h-full" style={{ width: 80 }}>
        <circle cx="40" cy="40" r={R} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="7" />
        <circle
          cx="40"
          cy="40"
          r={R}
          fill="none"
          stroke={`rgb(${accent})`}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${(frac * C).toFixed(2)} ${C.toFixed(2)}`}
          transform="rotate(-90 40 40)"
          style={{ transition: "stroke-dasharray 600ms ease-out" }}
        />
        <text
          x="40"
          y="44"
          textAnchor="middle"
          className="font-mono"
          fontSize="15"
          fill={`rgb(${accent})`}
        >
          {value.toFixed(1)}
          {unit}
        </text>
      </svg>
      <p className="font-mono text-[10px] leading-tight text-gray-500">
        TARGET
        <span className="block text-[12px] text-gray-300">
          {target}
          {unit}
        </span>
      </p>
    </div>
  );
}

/**
 * @param {object} chart  one entry from the chart data
 * @param {string} accent the agent's hue, "r,g,b"
 */
export default function LiveChart({ chart, accent }) {
  if (!chart) return null;
  switch (chart.kind) {
    case "line":
      return <Line values={chart.values} accent={accent} />;
    case "area":
      return <Line values={chart.values} accent={accent} area />;
    case "bar":
      return <Bars labels={chart.labels} values={chart.values} accent={accent} />;
    case "donut":
      return <Donut slices={chart.slices} accent={accent} />;
    case "radial":
      return <Radial value={chart.value} target={chart.target} unit={chart.unit} accent={accent} />;
    default:
      return null;
  }
}
