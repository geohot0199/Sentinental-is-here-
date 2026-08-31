import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import MotionRoot from "@/components/motion/MotionRoot";

// Self-hosted variable fonts — OpenAI & Claude inspired typography stack:
// 1. Inter (Variable): Neo-grotesque Swiss sans matching OpenAI's Söhne / OpenAI Sans and Claude Sans.
// 2. Newsreader (Variable): Literary optical-size serif matching Claude's Tiempos / Anthropic Serif and OpenAI's Signifier.
// 3. JetBrains Mono (Variable): Precision monospace matching Söhne Mono & Anthropic Mono.
const sans = localFont({
  src: "./fonts/inter-latin-wght-normal.woff2",
  variable: "--font-sans",
  display: "swap",
  weight: "100 900",
});

const serif = localFont({
  src: "./fonts/newsreader-latin-opsz-normal.woff2",
  variable: "--font-serif",
  display: "swap",
  weight: "200 800",
});

const mono = localFont({
  src: "./fonts/jetbrains-mono-latin-wght-normal.woff2",
  variable: "--font-mono",
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
  themeColor: "#030304",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} ${mono.variable}`}>
      <body>
        <div className="backdrop" aria-hidden />
        <MotionRoot />
        {children}
      </body>
    </html>
  );
}
