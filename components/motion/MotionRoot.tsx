"use client";

/**
 * Site-wide motion layer: particle field, cursor follower, scroll progress.
 * Disabled automatically when the user prefers reduced motion or is on a coarse pointer.
 */
import { useEffect, useRef } from "react";

export default function MotionRoot() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    if (reduce) return;

    const canvas = canvasRef.current;
    const ring = ringRef.current;
    const dot = dotRef.current;
    const bar = barRef.current;
    if (canvas === null) return;

    const context = canvas.getContext("2d", { alpha: true });
    if (context === null) return;

    const mouse = { x: window.innerWidth * 0.7, y: window.innerHeight * 0.35, tx: 0, ty: 0 };
    const ringPos = { x: mouse.x, y: mouse.y };
    const dotPos = { x: mouse.x, y: mouse.y };
    let width = 0;
    let height = 0;
    let frame = 0;
    let running = true;

    type Particle = { x: number; y: number; vx: number; vy: number; r: number };
    let particles: Particle[] = [];

    const seed = () => {
      const count = Math.min(56, Math.floor((width * height) / 28000));
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.28,
        vy: (Math.random() - 0.5) * 0.28,
        r: 0.8 + Math.random() * 1.6,
      }));
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    };

    const onMove = (event: PointerEvent) => {
      mouse.x = event.clientX;
      mouse.y = event.clientY;
      const target = event.target;
      const over = target instanceof Element && target.closest("a, button, summary, .btn, .tab");
      document.documentElement.classList.toggle("cursor-link", Boolean(over));
    };

    const onScroll = () => {
      if (bar === null) return;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max <= 0 ? 0 : window.scrollY / max;
      bar.style.transform = `scaleX(${p})`;
    };

    const tick = () => {
      if (!running) return;
      frame = requestAnimationFrame(tick);

      ringPos.x += (mouse.x - ringPos.x) * 0.16;
      ringPos.y += (mouse.y - ringPos.y) * 0.16;
      dotPos.x += (mouse.x - dotPos.x) * 0.38;
      dotPos.y += (mouse.y - dotPos.y) * 0.38;
      if (!coarse && ring !== null && dot !== null) {
        ring.style.transform = `translate3d(${ringPos.x}px, ${ringPos.y}px, 0)`;
        dot.style.transform = `translate3d(${dotPos.x}px, ${dotPos.y}px, 0)`;
      }

      context.clearRect(0, 0, width, height);
      const link = 118;
      for (let i = 0; i < particles.length; i += 1) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -20) p.x = width + 20;
        if (p.x > width + 20) p.x = -20;
        if (p.y < -20) p.y = height + 20;
        if (p.y > height + 20) p.y = -20;

        const dx = mouse.x - p.x;
        const dy = mouse.y - p.y;
        const dist = Math.hypot(dx, dy) || 1;
        if (dist < 160) {
          p.vx -= (dx / dist) * 0.004;
          p.vy -= (dy / dist) * 0.004;
        }
        p.vx *= 0.995;
        p.vy *= 0.995;
        p.vx += (Math.random() - 0.5) * 0.01;
        p.vy += (Math.random() - 0.5) * 0.01;

        context.beginPath();
        context.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        context.fillStyle = "rgba(24, 60, 45, 0.22)";
        context.fill();

        for (let j = i + 1; j < particles.length; j += 1) {
          const q = particles[j];
          const ddx = p.x - q.x;
          const ddy = p.y - q.y;
          const d2 = ddx * ddx + ddy * ddy;
          if (d2 < link * link) {
            const alpha = 0.16 * (1 - Math.sqrt(d2) / link);
            context.beginPath();
            context.moveTo(p.x, p.y);
            context.lineTo(q.x, q.y);
            context.strokeStyle = `rgba(24, 60, 45, ${alpha})`;
            context.lineWidth = 0.7;
            context.stroke();
          }
        }
      }
    };

    resize();
    onScroll();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", () => {
      running = document.visibilityState === "visible";
      if (running) tick();
    });
    if (!coarse) document.documentElement.classList.add("has-cursor");
    tick();

    return () => {
      running = false;
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", onScroll);
      document.documentElement.classList.remove("has-cursor", "cursor-link");
    };
  }, []);

  return (
    <>
      <canvas ref={canvasRef} className="motion-field" aria-hidden />
      <div ref={barRef} className="scroll-progress" aria-hidden />
      <div ref={ringRef} className="cursor-ring" aria-hidden />
      <div ref={dotRef} className="cursor-dot" aria-hidden />
    </>
  );
}
