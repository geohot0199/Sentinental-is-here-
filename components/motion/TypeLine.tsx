"use client";

import { useEffect, useState } from "react";

/**
 * TypeLine — a self-contained terminal typewriter. Types out a line, holds it,
 * deletes it, then advances to the next line in `lines`, looping forever.
 * Renders the first line statically when the user prefers reduced motion.
 */
export default function TypeLine({
  lines,
  prompt = "sentinel ▸",
  className = "",
  typeSpeed = 42,
  holdMs = 2100,
}: {
  lines: string[];
  prompt?: string;
  className?: string;
  typeSpeed?: number;
  holdMs?: number;
}) {
  const [lineIndex, setLineIndex] = useState(0);
  const [text, setText] = useState("");
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setReduced(true);
      return;
    }

    let timer: number;
    const full = lines[lineIndex];
    let count = 0;
    let phase: "typing" | "holding" | "deleting" = "typing";

    const step = () => {
      if (phase === "typing") {
        count += 1;
        setText(full.slice(0, count));
        if (count >= full.length) {
          phase = "holding";
          timer = window.setTimeout(step, holdMs);
        } else {
          timer = window.setTimeout(step, typeSpeed + Math.random() * 40);
        }
      } else if (phase === "holding") {
        phase = "deleting";
        timer = window.setTimeout(step, 60);
      } else {
        count = Math.max(0, count - 3);
        setText(full.slice(0, count));
        if (count === 0) {
          setLineIndex((i) => (i + 1) % lines.length);
          return;
        }
        timer = window.setTimeout(step, 22);
      }
    };

    timer = window.setTimeout(step, 900 + lineIndex * 200);
    return () => window.clearTimeout(timer);
  }, [lineIndex, lines, typeSpeed, holdMs]);

  const shown = reduced ? lines[0] : text;

  return (
    <div className={`type-line ${className}`.trim()}>
      <span className="type-prompt">{prompt}</span>
      <span className="type-text">{shown}</span>
      <span className="type-caret" />
    </div>
  );
}
