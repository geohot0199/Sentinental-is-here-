"use client";

import { useEffect, useRef } from "react";

/**
 * GlyphField — a sparse Matrix-style "data rain" of terminal glyphs
 * ({ } / > # ✓ ⚠ …) falling down the far background. Mostly green signal
 * characters with the occasional white/red one, matching the constellation
 * palette. Rendered on a canvas only when motion is allowed; removed
 * entirely under prefers-reduced-motion.
 */

const GLYPHS = ["{", "}", "/", ">", "<", "#", "$", "%", "&", "0", "1", "✓", "⚠", "▲", "●", "λ", "ƒ", "[]", "::"];
const COLOURS = ["", "", "", "glyph-green", "glyph-green", "glyph-white", "glyph-red"] as const;

type Drop = {
  x: number;
  y: number;
  speed: number;
  char: string;
  colour: string;
  alpha: number;
  switchAt: number;
};

export default function GlyphField() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (node === null) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const reduce = window.matchMedia("(pointer: coarse)").matches;
    const COUNT = reduce ? 10 : 22;
    const drops: Drop[] = Array.from({ length: COUNT }, () => makeDrop(true));

    function makeDrop(anywhere: boolean): Drop {
      return {
        x: Math.random() * 100,
        y: anywhere ? Math.random() * 100 : -5,
        speed: 6 + Math.random() * 14,
        char: GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
        colour: COLOURS[Math.floor(Math.random() * COLOURS.length)],
        alpha: 0.3 + Math.random() * 0.4,
        switchAt: Math.floor(Math.random() * 12),
      };
    }

    // Build DOM nodes once per drop, then recycle them top-to-bottom.
    const nodes = drops.map((drop) => {
      const el = document.createElement("i");
      el.textContent = drop.char;
      if (drop.colour === "glyph-white") el.classList.add("glyph-white");
      else if (drop.colour === "glyph-red") el.classList.add("glyph-red");
      el.style.left = `${drop.x}%`;
      el.style.setProperty("--go", drop.alpha.toFixed(2));
      const duration = (100 / drop.speed) * 1.15;
      el.style.animationDuration = `${duration.toFixed(2)}s`;
      el.style.animationDelay = `${(-Math.random() * duration).toFixed(2)}s`;
      node.appendChild(el);
      return el;
    });

    // Periodically swap glyphs on the running nodes for a "streaming data" feel.
    let frame = 0;
    const timer = window.setInterval(() => {
      frame += 1;
      for (let i = 0; i < drops.length; i += 1) {
        const drop = drops[i];
        if (frame % (drop.switchAt + 6) === 0) {
          drop.char = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
          nodes[i].textContent = drop.char;
        }
      }
    }, 140);

    return () => {
      window.clearInterval(timer);
      node.innerHTML = "";
    };
  }, []);

  return <div ref={ref} className="glyph-field" aria-hidden="true" />;
}
