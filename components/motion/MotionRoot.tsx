"use client";

/**
 * Site-wide motion layer: a living particle constellation (mostly white, with
 * green and red signal particles), comet streaks, a cursor follower and the
 * green→white→red scroll progress beam.
 * Disabled automatically when the user prefers reduced motion.
 */
import { useEffect, useRef } from "react";

type Particle = { x: number; y: number; vx: number; vy: number; r: number; c: string };
type Comet = { x: number; y: number; vx: number; vy: number; life: number; ttl: number; c: string };

/** 78% monochrome snow, 12% green, 10% red — meaning rides along with colour */
function pickColour(): string {
  const roll = Math.random();
  if (roll < 0.78) return "255, 255, 255";
  if (roll < 0.9) return "47, 221, 112";
  return "255, 73, 73";
}

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

    const mouse = { x: window.innerWidth * 0.7, y: window.innerHeight * 0.35 };
    const ringPos = { x: mouse.x, y: mouse.y };
    const dotPos = { x: mouse.x, y: mouse.y };
    let width = 0;
    let height = 0;
    let frame = 0;
    let running = true;
    let cometTimer = 90;

    let particles: Particle[] = [];
    const comets: Comet[] = [];

    const seed = () => {
      const count = Math.min(96, Math.floor((width * height) / 21000));
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.32,
        vy: (Math.random() - 0.5) * 0.32,
        r: 0.8 + Math.random() * 1.7,
        c: pickColour(),
      }));
    };

    const spawnComet = () => {
      const fromLeft = Math.random() < 0.5;
      const speed = 4.4 + Math.random() * 3.2;
      const angle = (Math.random() * 0.5 - 0.25) + (fromLeft ? 0 : Math.PI);
      comets.push({
        x: fromLeft ? -40 : width + 40,
        y: Math.random() * height * 0.7,
        vx: Math.cos(angle) * speed,
        vy: Math.abs(Math.sin(angle) * speed) * 0.5,
        life: 0,
        ttl: 130 + Math.random() * 120,
        c: Math.random() < 0.6 ? "255, 255, 255" : Math.random() < 0.5 ? "47, 221, 112" : "255, 73, 73",
      });
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
      const link = 128;

      // ---------------- comets
      cometTimer -= 1;
      if (cometTimer <= 0) {
        spawnComet();
        cometTimer = 120 + Math.random() * 200;
      }
      for (let i = comets.length - 1; i >= 0; i -= 1) {
        const comet = comets[i];
        comet.x += comet.vx;
        comet.y += comet.vy;
        comet.life += 1;
        const fade = Math.sin((comet.life / comet.ttl) * Math.PI); // ease in, ease out
        if (comet.life > comet.ttl || comet.x < -80 || comet.x > width + 80 || comet.y > height + 80) {
          comets.splice(i, 1);
          continue;
        }
        const tailX = comet.x - comet.vx * 14;
        const tailY = comet.y - comet.vy * 14;
        const gradient = context.createLinearGradient(comet.x, comet.y, tailX, tailY);
        gradient.addColorStop(0, `rgba(${comet.c}, ${0.75 * fade})`);
        gradient.addColorStop(1, `rgba(${comet.c}, 0)`);
        context.beginPath();
        context.moveTo(comet.x, comet.y);
        context.lineTo(tailX, tailY);
        context.strokeStyle = gradient;
        context.lineWidth = 1.4;
        context.stroke();
        context.beginPath();
        context.arc(comet.x, comet.y, 1.6, 0, Math.PI * 2);
        context.fillStyle = `rgba(${comet.c}, ${0.9 * fade})`;
        context.fill();
      }

      // ---------------- constellation
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
        if (dist < 170) {
          p.vx -= (dx / dist) * 0.004;
          p.vy -= (dy / dist) * 0.004;
        }
        p.vx *= 0.995;
        p.vy *= 0.995;
        p.vx += (Math.random() - 0.5) * 0.01;
        p.vy += (Math.random() - 0.5) * 0.01;

        context.beginPath();
        context.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        context.fillStyle = `rgba(${p.c}, 0.5)`;
        context.fill();

        for (let j = i + 1; j < particles.length; j += 1) {
          const q = particles[j];
          const ddx = p.x - q.x;
          const ddy = p.y - q.y;
          const d2 = ddx * ddx + ddy * ddy;
          if (d2 < link * link) {
            const alpha = 0.14 * (1 - Math.sqrt(d2) / link);
            context.beginPath();
            context.moveTo(p.x, p.y);
            context.lineTo(q.x, q.y);
            context.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
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
