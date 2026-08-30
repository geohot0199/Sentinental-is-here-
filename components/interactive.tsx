"use client";

/**
 * Interaction primitives — every click in SENTINEL is animated.
 *
 *  - <Btn>   ripple + shine sweep + 3D press
 *  - <Tilt>  pointer-tracking 3D perspective tilt
 *  - <Reveal> IntersectionObserver scroll entrance
 *  - <Toast>  self-dismissing notices
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
  type CSSProperties,
} from "react";

/* ------------------------------------------------------------------ Btn */

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "primary" | "ghost";
  children: ReactNode;
};

export function Btn({ variant = "default", children, className = "", onClick, ...rest }: BtnProps) {
  const ref = useRef<HTMLButtonElement>(null);

  const handleMove = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    const node = ref.current;
    if (node === null) return;
    const rect = node.getBoundingClientRect();
    const x = event.clientX - rect.left - rect.width / 2;
    const y = event.clientY - rect.top - rect.height / 2;
    node.style.transform = `translate(${(x * 0.22).toFixed(1)}px, ${(y * 0.32).toFixed(1)}px)`;
  }, []);

  const handleLeave = useCallback(() => {
    const node = ref.current;
    if (node !== null) node.style.transform = "translate(0, 0)";
  }, []);

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      onClick?.(event);
    },
    [onClick],
  );

  const variantClass = variant === "primary" ? "btn-primary" : variant === "ghost" ? "btn-ghost" : "";
  return (
    <button
      ref={ref}
      className={`btn ${variantClass} ${className}`.trim()}
      onClick={handleClick}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
      {...rest}
    >
      <span style={{ position: "relative", zIndex: 1, display: "inline-flex", alignItems: "center", gap: 9 }}>
        {children}
      </span>
    </button>
  );
}

/* ----------------------------------------------------------- Kinetic type */

export function KineticWords({
  text,
  className = "",
  delay = 0,
}: {
  text: string;
  className?: string;
  delay?: number;
}) {
  return (
    <span className={`kinetic ${className}`}>
      {text.split(" ").map((word, index) => (
        <span
          className="kinetic-word"
          key={`${word}-${index}`}
          style={{ "--i": index, "--d": `${delay}ms` } as CSSProperties}
        >
          <span>{word}</span>
        </span>
      ))}
    </span>
  );
}

/* ------------------------------------------------------------------ Tilt */

export function Tilt({
  children,
  className = "",
  strength = 9,
  style,
}: {
  children: ReactNode;
  className?: string;
  strength?: number;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const handleMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const node = ref.current;
      if (node === null) return;
      const rect = node.getBoundingClientRect();
      const px = (event.clientX - rect.left) / rect.width - 0.5;
      const py = (event.clientY - rect.top) / rect.height - 0.5;
      node.style.transform = `perspective(900px) rotateX(${(-py * strength).toFixed(2)}deg) rotateY(${(px * strength).toFixed(2)}deg) translateZ(0)`;
      node.style.setProperty("--gx", `${((px + 0.5) * 100).toFixed(1)}%`);
      node.style.setProperty("--gy", `${((py + 0.5) * 100).toFixed(1)}%`);
    },
    [strength],
  );

  const handleLeave = useCallback(() => {
    const node = ref.current;
    if (node !== null) node.style.transform = "perspective(900px) rotateX(0deg) rotateY(0deg)";
  }, []);

  return (
    <div
      ref={ref}
      className={`tilt ${className}`}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
      style={style}
    >
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------- Reveal */

export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (node === null) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true);
            observer.disconnect();
          }
        }
      },
      { threshold: 0.12 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={`reveal ${shown ? "in" : ""} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

/* ----------------------------------------------------------------- Toast */

export interface ToastMessage {
  id: number;
  text: string;
  level: "ok" | "warn" | "alert";
}

export function ToastStack({ toasts }: { toasts: ToastMessage[] }) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: 22,
        right: 22,
        zIndex: 200,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        maxWidth: "min(90vw, 420px)",
      }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="panel brackets"
          style={{
            padding: "13px 18px",
            animation: "rise 0.4s ease both",
            fontSize: 13,
            display: "flex",
            gap: 10,
            alignItems: "center",
            borderColor: toast.level === "ok" ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.7)",
          }}
        >
          <span className="dot" style={{ animationDuration: toast.level === "ok" ? "2.2s" : "0.9s" }} />
          <span className="mono" style={{ color: "#fff" }}>{toast.text}</span>
        </div>
      ))}
    </div>
  );
}

export function useToasts() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const push = useCallback((text: string, level: ToastMessage["level"] = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, text, level }]);
    window.setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), 4600);
  }, []);
  return { toasts, push };
}
