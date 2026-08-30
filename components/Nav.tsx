"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Btn } from "./interactive";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/app", label: "Console" },
  { href: "/docs", label: "Docs" },
];

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      style={{
        position: "fixed",
        top: 0, left: 0, right: 0,
        zIndex: 100,
        transition: "background 0.4s, border-color 0.4s",
        borderBottom: `1px solid ${scrolled ? "rgba(255,255,255,0.12)" : "transparent"}`,
        background: scrolled ? "rgba(3,3,4,0.82)" : "transparent",
        backdropFilter: scrolled ? "blur(16px)" : "none",
      }}
    >
      <nav className="container" style={{ height: "var(--nav-h)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <Link href="/" style={{ textDecoration: "none", color: "#fff", display: "flex", alignItems: "center", gap: 11 }}>
          <span
            className="mono"
            style={{
              display: "grid",
              placeItems: "center",
              width: 30, height: 30,
              borderRadius: 9,
              background: "linear-gradient(135deg,#fff,#9a9aa6)",
              color: "#000",
              fontWeight: 800,
              fontSize: 14,
              boxShadow: "0 0 22px rgba(255,255,255,0.35)",
            }}
          >
            S
          </span>
          <span className="display" style={{ fontSize: 17, letterSpacing: "0.08em" }}>SENTINEL</span>
        </Link>

        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div className="row nav-links" style={{ gap: 20 }}>
            {LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="link" style={{ fontSize: 13.5, color: "var(--ink-dim)", fontWeight: 500 }}>
                {link.label}
              </Link>
            ))}
          </div>
          <Link href="/app" style={{ textDecoration: "none" }} className="nav-cta">
            <Btn variant="primary" style={{ padding: "9px 18px", fontSize: 13 }}>
              Launch Console
            </Btn>
          </Link>
        </div>
      </nav>
    </header>
  );
}
