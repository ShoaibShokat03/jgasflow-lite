import { useMemo } from 'react';
import { iconFor } from './crew';

/**
 * The crew as a constellation around the core. The working agent glows and
 * its link to the core flows; a consult draws a live link between two agents
 * with a packet travelling along it; a handoff fires a comet from one agent
 * to the next; every tool step sends a ripple out of the core.
 */
export function CrewNetwork({ crew, active, consult, handoff, busy, pulse, elapsed, onPick }) {
  const size = 300;
  const c = size / 2;
  const R = 104;
  const pos = useMemo(() => {
    const p = {};
    crew.forEach((a, i) => {
      const t = (i / crew.length) * Math.PI * 2 - Math.PI / 2;
      p[a.key] = { x: c + R * Math.cos(t), y: c + R * Math.sin(t) };
    });
    return p;
  }, [crew, c]);
  const accent = (k) => crew.find((a) => a.key === k)?.accent ?? '#22d3ee';
  const curve = (a, b) => {
    const pa = pos[a];
    const pb = pos[b];
    if (!pa || !pb) return '';
    // Bend through a point pulled toward the core so links read as arcs.
    const mx = (pa.x + pb.x) / 2;
    const my = (pa.y + pb.y) / 2;
    const qx = mx + (c - mx) * 0.55;
    const qy = my + (c - my) * 0.55;
    return `M${pa.x},${pa.y} Q${qx},${qy} ${pb.x},${pb.y}`;
  };

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="cc-net w-full h-auto select-none" role="img" aria-label={busy ? `Crew working, ${crew.find((a) => a.key === active)?.name ?? ''} active` : 'Crew idle'}>
      <defs>
        <radialGradient id="cc-core" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor={accent(active)} stopOpacity={busy ? 0.55 : 0.25} />
          <stop offset="1" stopColor={accent(active)} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* orbit guide */}
      <circle cx={c} cy={c} r={R} fill="none" stroke="rgba(56,189,248,0.12)" strokeDasharray="1 6" />

      {/* spokes */}
      {crew.map((a) => (
        <line key={a.key} x1={c} y1={c} x2={pos[a.key].x} y2={pos[a.key].y} className={`link ${busy && a.key === active ? 'live' : ''}`} style={{ '--a': a.accent }} />
      ))}

      {/* consult link with a travelling packet */}
      {consult && pos[consult.from] && pos[consult.to] && (
        <g style={{ '--a': accent(consult.to) }}>
          <path d={curve(consult.from, consult.to)} fill="none" className="link live" />
          <circle r="3.5" fill={accent(consult.to)}>
            <animateMotion dur="1.1s" repeatCount="indefinite" path={curve(consult.from, consult.to)} />
          </circle>
          <circle r="2.5" fill={accent(consult.from)}>
            <animateMotion dur="1.1s" begin="0.55s" repeatCount="indefinite" keyPoints="1;0" keyTimes="0;1" calcMode="linear" path={curve(consult.from, consult.to)} />
          </circle>
        </g>
      )}

      {/* handoff comet, remounted per handoff so it fires once */}
      {handoff && pos[handoff.from] && pos[handoff.to] && (
        <g key={handoff.id}>
          <path d={curve(handoff.from, handoff.to)} fill="none" stroke={accent(handoff.to)} strokeWidth="1.5" strokeOpacity="0.5" strokeDasharray="3 5" />
          <circle r="5" fill={accent(handoff.to)}>
            <animateMotion dur="0.9s" fill="freeze" path={curve(handoff.from, handoff.to)} />
            <animate attributeName="r" values="5;3;6" dur="0.9s" fill="freeze" />
          </circle>
        </g>
      )}

      {/* core */}
      <circle cx={c} cy={c} r="54" fill="url(#cc-core)" />
      <circle cx={c} cy={c} r="34" className={`core-ring ${busy ? 'fast' : ''}`} strokeWidth="1.5" />
      <circle cx={c} cy={c} r="42" className="core-ring" strokeWidth="1" style={{ animationDirection: 'reverse' }} />
      {busy && pulse > 0 && <circle key={pulse} cx={c} cy={c} r="30" className="pulse" strokeWidth="1.5" />}
      <circle cx={c} cy={c} r="25" fill="#07101c" stroke={accent(active)} strokeOpacity="0.8" strokeWidth="1.5" />
      <text x={c} y={c - 2} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9" letterSpacing="2" fill="#a6b9cf">{busy ? 'LIVE' : 'CORE'}</text>
      <text x={c} y={c + 11} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="10" fill="#e8f2ff">{busy ? `${(elapsed / 1000).toFixed(1)}s` : 'READY'}</text>

      {/* agent nodes */}
      {crew.map((a) => {
        const Icon = iconFor(a.icon);
        const p = pos[a.key];
        const on = a.key === active;
        const lit = on || consult?.to === a.key || consult?.from === a.key;
        return (
          <g key={a.key} transform={`translate(${p.x},${p.y})`} onClick={() => onPick?.(a.key)} className="cursor-pointer" style={{ '--a': a.accent }}>
            <title>{`${a.name}, ${a.role}`}</title>
            {busy && lit && <circle r="20" fill="none" stroke={a.accent} className="node-halo" />}
            <circle r="18" fill={lit ? `color-mix(in srgb, ${a.accent} 22%, #07101c)` : '#07101c'} stroke={a.accent} strokeOpacity={lit ? 1 : 0.45} strokeWidth={lit ? 2 : 1.2} />
            <Icon x={-8} y={-8} width={16} height={16} color={a.accent} strokeWidth={2} opacity={lit ? 1 : 0.75} />
            <text y="32" textAnchor="middle" fontSize="10.5" fontWeight="600" fill={lit ? '#ffffff' : '#a6b9cf'}>{a.name}</text>
          </g>
        );
      })}
    </svg>
  );
}
