"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Btn } from "./interactive";
import Wordmark from "./Wordmark";

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
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        transition: "background 0.3s, border-color 0.3s",
        borderBottom: `1px solid ${scrolled ? "var(--line)" : "transparent"}`,
        background: scrolled ? "rgba(255, 255, 255, 0.86)" : "transparent",
        backdropFilter: scrolled ? "blur(14px) saturate(1.1)" : "none",
      }}
    >
      <nav className="container nav-row">
        <Link href="/" className="nav-brand" aria-label="SENTINEL — home">
          <span className="nav-mark">S</span>
          <Wordmark small hidden />
        </Link>

        <div className="nav-right">
          <div className="row nav-links" style={{ gap: 24 }}>
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="link"
                style={{
                  fontSize: 14,
                  color: "var(--ink-dim)",
                  fontWeight: 450,
                  letterSpacing: "-0.01em",
                }}
              >
                {link.label}
              </Link>
            ))}
          </div>
          <Link href="/app" style={{ textDecoration: "none" }} className="nav-cta">
            <Btn variant="primary" className="btn-md">
              Launch console
            </Btn>
          </Link>
        </div>
      </nav>
    </header>
  );
}
