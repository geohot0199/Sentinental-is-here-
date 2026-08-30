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
        top: 0, left: 0, right: 0,
        zIndex: 100,
        transition: "background 0.4s, border-color 0.4s",
        borderBottom: `1px solid ${scrolled ? "var(--line)" : "transparent"}`,
        background: scrolled ? "rgba(243, 241, 233, 0.78)" : "transparent",
        backdropFilter: scrolled ? "blur(18px)" : "none",
      }}
    >
      <nav className="container nav-row">
        <Link href="/" className="nav-brand" aria-label="SENTINEL — home">
          <span className="nav-mark">S</span>
          <Wordmark small hidden />
        </Link>

        <div className="nav-right">
          <div className="row nav-links" style={{ gap: 20 }}>
            {LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="link" style={{ fontSize: 13.5, color: "var(--ink-dim)", fontWeight: 500 }}>
                {link.label}
              </Link>
            ))}
          </div>
          <Link href="/app" style={{ textDecoration: "none" }} className="nav-cta">
            <Btn variant="primary">
              Launch Console
            </Btn>
          </Link>
        </div>
      </nav>
    </header>
  );
}
