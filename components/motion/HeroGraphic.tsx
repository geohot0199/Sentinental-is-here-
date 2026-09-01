"use client";

import { useEffect, useRef, type CSSProperties } from "react";

/**
 * The hero machine: a satellite constellation, and nothing else.
 *
 * One hairline Earth, three inclined orbital planes, satellites riding the
 * exact same paths as their SVG orbit lines, and a ground station receiving
 * downlink packets. Deliberately *not* here: radar sweeps, target reticles,
 * scanning beams — the landing page has no "detecting a target" animation.
 *
 * Geometry note — CSS `offset-path: path()` is spoken in px, not in SVG
 * viewBox units, so the stage is a fixed 480×480 box and every path below is
 * written in that same box. Responsiveness comes from `--gscale` in the
 * stylesheet, never from a second set of coordinates.
 */

type Plane = "p1" | "p2" | "p3";

/** Shared between the SVG orbit and the CSS satellites — one source of truth. */
const ORBITS: Record<Plane, { d: string; dur: string; tilt: string; reverse?: boolean }> = {
  p1: { d: "M 44,240 A 196,78 0 1 1 436,240 A 196,78 0 1 1 44,240", dur: "26s", tilt: "-16deg" },
  p2: { d: "M 88,240 A 152,58 0 1 1 392,240 A 152,58 0 1 1 88,240", dur: "19s", tilt: "34deg", reverse: true },
  p3: { d: "M 26,240 A 214,102 0 1 1 454,240 A 214,102 0 1 1 26,240", dur: "34s", tilt: "-64deg" },
};

/**
 * One satellite on one orbit. `phase` shifts the animation backwards so two
 * birds can share a plane without the eye reading it as a duplicate.
 */
function Satellite({
  plane,
  phase = 0,
  small = false,
  echo = false,
}: {
  plane: Plane;
  phase?: number;
  small?: boolean;
  echo?: boolean;
}) {
  const orbit = ORBITS[plane];
  return (
    <span className={`sat-plane ${plane}`} aria-hidden="true">
      <span
        className={`sat${orbit.reverse ? " rev" : ""}${small ? " sat-small" : ""}${phase !== 0 ? " phase-b" : ""}`}
        style={
          {
            "--dur": orbit.dur,
            "animation-delay": phase === 0 ? undefined : `calc(var(--dur) * ${(-phase).toFixed(3)})`,
          } as CSSProperties
        }
      >
        {echo ? <i className="sat-echo" /> : null}
        <i className="sat-array sat-array-l" />
        <i className="sat-body" />
        <i className="sat-array sat-array-r" />
      </span>
    </span>
  );
}

function OrbitPlane({ plane }: { plane: Plane }) {
  const orbit = ORBITS[plane];
  return (
    <g className={`orbit-plane plane-${plane.slice(1)}`} transform={`rotate(${orbit.tilt} 240 240)`}>
      <path className="orbit-path-dash" d={orbit.d} pathLength={1000} />
      <path className="orbit-path" d={orbit.d} pathLength={1000} />
      {/* the comet behind each satellite: same path, same duration, so it stays welded to it */}
      <path
        className={`orbit-trail${orbit.reverse ? " rev" : ""}`}
        d={orbit.d}
        pathLength={1000}
        style={{ "--dur": orbit.dur } as CSSProperties}
      />
    </g>
  );
}

export default function HeroGraphic() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (node === null) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    const onMove = (event: PointerEvent) => {
      const rect = node.getBoundingClientRect();
      const px = (event.clientX - rect.left) / rect.width - 0.5;
      const py = (event.clientY - rect.top) / rect.height - 0.5;
      node.style.setProperty("--px", px.toFixed(3));
      node.style.setProperty("--py", py.toFixed(3));
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  return (
    <div className="hero-graphic" ref={ref} aria-hidden="true">
      <div className="sats-scaler">
        <svg className="orbits" viewBox="0 0 480 480">
          <OrbitPlane plane="p1" />
          <OrbitPlane plane="p2" />
          <OrbitPlane plane="p3" />

          {/* ground-station beam, drawn in the same coordinate box as the packets */}
          <g transform="translate(96 380)">
            <path className="beam" d="M 12,0 C 40,-58 96,-86 150,-104" />
            <path className="beam" d="M 12,0 C 2,-46 18,-92 60,-130" />
          </g>
        </svg>

        <div className="sats-earth">
          <svg viewBox="0 0 168 168">
            <circle className="graticule" cx="84" cy="84" r="66" fill="none" />
            <ellipse className="graticule-soft" cx="84" cy="84" rx="66" ry="22" fill="none" />
            <ellipse className="graticule-soft" cx="84" cy="84" rx="66" ry="46" fill="none" />
            <ellipse className="graticule-soft" cx="84" cy="84" rx="22" ry="66" fill="none" />
            <ellipse className="graticule-soft" cx="84" cy="84" rx="46" ry="66" fill="none" />
            <line className="graticule" x1="18" y1="84" x2="150" y2="84" />
          </svg>
        </div>

        <Satellite plane="p1" echo />
        <Satellite plane="p1" phase={0.55} small />
        <Satellite plane="p2" small />
        <Satellite plane="p3" phase={0.3} echo />

        <div className="sats-station">
          <svg className="dish" viewBox="0 0 26 26" style={{ overflow: "visible" }}>
            <path d="M 4 22 L 13 8 L 22 22 Z" fill="none" stroke="currentColor" strokeWidth="1.1" />
            <path d="M 8 15 A 7 7 0 0 1 18 15" fill="none" stroke="currentColor" strokeWidth="1.1" />
            <line x1="13" y1="2" x2="13" y2="8" stroke="currentColor" strokeWidth="1.1" />
            <circle cx="13" cy="2" r="1.4" fill="currentColor" />
          </svg>
          <span className="packet" />
          <span className="packet b" />
        </div>
      </div>
    </div>
  );
}
