import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import MotionRoot from "@/components/motion/MotionRoot";

// Self-hosted variable fonts (fontsource woff2, bundled with the app) — the
// build never depends on a third-party font CDN.
const display = localFont({
  src: "./fonts/orbitron-latin-wght-normal.woff2",
  variable: "--font-orbitron",
  display: "swap",
  weight: "400 900",
});
const body = localFont({
  src: "./fonts/saira-latin-wght-normal.woff2",
  variable: "--font-saira",
  display: "swap",
  weight: "100 900",
});
const mono = localFont({
  src: "./fonts/jetbrains-mono-latin-wght-normal.woff2",
  variable: "--font-jetbrains",
  display: "swap",
  weight: "100 800",
});

export const metadata: Metadata = {
  title: "SENTINEL — Autonomous Supply-Chain CVE Strike Team",
  description:
    "SENTINEL reads your dependency tree, triages every advisory against the versions you actually ship, prepares the patch — and stops to ask a human before the pull request. Built on the TrueForge agent harness.",
  keywords: ["SENTINEL", "CVE", "supply chain", "dependency triage", "TrueForge", "MCP", "Daytona", "OSV", "security agent"],
  openGraph: {
    title: "SENTINEL — Autonomous Supply-Chain CVE Strike Team",
    description:
      "Everything up to the pull request is autonomous. The pull request itself is not — it stops and asks a human.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#f3f1e9",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <div className="backdrop" aria-hidden />
        <MotionRoot />
        {children}
      </body>
    </html>
  );
}
