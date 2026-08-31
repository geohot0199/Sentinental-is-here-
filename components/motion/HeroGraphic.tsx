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
      <div className="hero-core" />
      <span className="hero-asterisk">✳</span>
    </div>
  );
}
