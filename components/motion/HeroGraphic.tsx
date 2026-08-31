"use client";

import { useEffect, useRef } from "react";

/** Morphing blob, orbital signal rings, breathing core and a drifting asterisk — the hero machine. */
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
      <div className="hero-blob" />
      <svg className="hero-rings" viewBox="0 0 500 500">
        <circle className="ring ring-a" cx="250" cy="250" r="236" fill="none" />
        <circle className="ring ring-b" cx="250" cy="250" r="192" fill="none" />
        <circle className="ring ring-c" cx="250" cy="250" r="148" fill="none" />
      </svg>
      <div className="hero-orbit"><i /></div>
      <div className="hero-orbit hero-orbit-2"><i /></div>
      {/* sonar pings radiating from the core */}
      <div className="sonar sonar-hero">
        <i /><i /><i />
      </div>
      {/* spinning target reticles */}
      <svg className="hero-reticle" style={{ top: "22%", left: "24%" }} viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="26" fill="none" stroke="currentColor" strokeWidth="1.4" strokeDasharray="6 5" />
        <line x1="50" y1="8" x2="50" y2="26" stroke="currentColor" strokeWidth="1.4" />
        <line x1="50" y1="74" x2="50" y2="92" stroke="currentColor" strokeWidth="1.4" />
        <line x1="8" y1="50" x2="26" y2="50" stroke="currentColor" strokeWidth="1.4" />
        <line x1="74" y1="50" x2="92" y2="50" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="50" cy="50" r="2.5" fill="currentColor" />
      </svg>
      <svg className="hero-reticle hero-reticle-2" style={{ top: "70%", left: "70%" }} viewBox="0 0 100 100">
        <path d="M50 12 L60 40 L88 50 L60 60 L50 88 L40 60 L12 50 L40 40 Z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeDasharray="4 4" />
        <circle cx="50" cy="50" r="22" fill="none" stroke="currentColor" strokeWidth="1" />
        <circle cx="50" cy="50" r="2.5" fill="currentColor" />
      </svg>
      <div className="hero-core" />
      <span className="hero-asterisk">✳</span>
    </div>
  );
}
