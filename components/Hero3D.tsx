"use client";

/**
 * The 3D core — a wireframe icosahedron with orbiting particles, rendered on
 * canvas with a hand-rolled 3D projection. Pure monochrome: depth is carried
 * by opacity and line weight, not colour. Drag to rotate, wheel to zoom.
 */
import { useEffect, useRef } from "react";

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

function icosahedron(): { vertices: Vec3[]; edges: [number, number][] } {
  const t = (1 + Math.sqrt(5)) / 2;
  const raw: Vec3[] = [
    { x: -1, y: t, z: 0 }, { x: 1, y: t, z: 0 }, { x: -1, y: -t, z: 0 }, { x: 1, y: -t, z: 0 },
    { x: 0, y: -1, z: t }, { x: 0, y: 1, z: t }, { x: 0, y: -1, z: -t }, { x: 0, y: 1, z: -t },
    { x: t, y: 0, z: -1 }, { x: t, y: 0, z: 1 }, { x: -t, y: 0, z: -1 }, { x: -t, y: 0, z: 1 },
  ];
  const vertices = raw.map((v) => {
    const length = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    return { x: v.x / length, y: v.y / length, z: v.z / length };
  });
  // An edge exists between vertices closer than the lattice spacing.
  const edges: [number, number][] = [];
  for (let i = 0; i < vertices.length; i += 1) {
    for (let j = i + 1; j < vertices.length; j += 1) {
      const a = vertices[i];
      const b = vertices[j];
      const d = Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
      if (d < 1.2) edges.push([i, j]);
    }
  }
  return { vertices, edges };
}

export default function Hero3D({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const context = canvas.getContext("2d");
    if (context === null) return;

    const { vertices, edges } = icosahedron();
    const particles = Array.from({ length: 64 }, () => ({
      angle: Math.random() * Math.PI * 2,
      speed: 0.0016 + Math.random() * 0.004,
      radius: 1.55 + Math.random() * 0.85,
      tilt: (Math.random() - 0.5) * 1.9,
      size: 0.6 + Math.random() * 1.6,
    }));

    let rotationX = 0.42;
    let rotationY = 0;
    let zoom = 1;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let frame = 0;
    let width = 0;
    let height = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const render = () => {
      frame = requestAnimationFrame(render);
      if (!dragging && !reduced) {
        rotationY += 0.0042;
        rotationX += Math.sin(rotationY * 0.6) * 0.0006;
      }
      const cosX = Math.cos(rotationX);
      const sinX = Math.sin(rotationX);
      const cosY = Math.cos(rotationY);
      const sinY = Math.sin(rotationY);
      const cx = width / 2;
      const cy = height / 2;
      const scale = Math.min(width, height) * 0.3 * zoom;

      context.clearRect(0, 0, width, height);

      const project = (v: Vec3): { x: number; y: number; depth: number } => {
        // rotate Y then X
        const x1 = v.x * cosY - v.z * sinY;
        const z1 = v.x * sinY + v.z * cosY;
        const y2 = v.y * cosX - z1 * sinX;
        const z2 = v.y * sinX + z1 * cosX;
        const perspective = 2.6 / (2.6 + z2);
        return { x: cx + x1 * scale * perspective, y: cy + y2 * scale * perspective, depth: z2 };
      };

      // orbital particles (behind the lattice)
      for (const particle of particles) {
        particle.angle += particle.speed;
        const px = Math.cos(particle.angle) * particle.radius;
        const pz = Math.sin(particle.angle) * particle.radius;
        const py = Math.sin(particle.angle * 1.7 + particle.tilt) * 0.42;
        const point = project({ x: px, y: py, z: pz });
        const alpha = 0.14 + (1 - point.depth / 2.4) * 0.5;
        if (alpha <= 0) continue;
        context.beginPath();
        context.arc(point.x, point.y, particle.size, 0, Math.PI * 2);
        context.fillStyle = `rgba(255,255,255,${Math.max(0, Math.min(0.75, alpha))})`;
        context.fill();
      }

      // lattice edges with depth attenuation
      for (const [i, j] of edges) {
        const a = project(vertices[i]);
        const b = project(vertices[j]);
        const depth = (a.depth + b.depth) / 2;
        const alpha = Math.max(0.05, 0.85 - depth * 0.4);
        context.beginPath();
        context.moveTo(a.x, a.y);
        context.lineTo(b.x, b.y);
        context.lineWidth = Math.max(0.5, 1.5 - depth * 0.42);
        context.strokeStyle = `rgba(255,255,255,${alpha})`;
        context.stroke();
      }

      // vertices
      for (const vertex of vertices) {
        const point = project(vertex);
        const alpha = Math.max(0.25, 1 - point.depth * 0.42);
        const radius = Math.max(1.2, 3.4 - point.depth * 1.1);
        context.beginPath();
        context.arc(point.x, point.y, radius, 0, Math.PI * 2);
        context.fillStyle = `rgba(255,255,255,${alpha})`;
        context.shadowColor = "rgba(255,255,255,0.9)";
        context.shadowBlur = radius * 3.4;
        context.fill();
        context.shadowBlur = 0;
      }
    };
    render();

    const onDown = (event: PointerEvent) => {
      dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
    };
    const onMove = (event: PointerEvent) => {
      if (!dragging) return;
      rotationY += (event.clientX - lastX) * 0.007;
      rotationX += (event.clientY - lastY) * 0.007;
      rotationX = Math.max(-1.4, Math.min(1.4, rotationX));
      lastX = event.clientX;
      lastY = event.clientY;
    };
    const onUp = () => {
      dragging = false;
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoom = Math.max(0.55, Math.min(1.9, zoom - event.deltaY * 0.0012));
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, []);

  return <canvas ref={canvasRef} className={className} style={{ width: "100%", height: "100%", touchAction: "none", cursor: "grab" }} aria-label="Interactive 3D wireframe core — drag to rotate" />;
}
