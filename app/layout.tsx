import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import MotionRoot from "@/components/motion/MotionRoot";
import Aurora from "@/components/motion/Aurora";
import WebMcpBoot from "@/components/WebMcpBoot";

/**
 * Typography — the OpenAI stack, self-hosted so it renders identically in an
 * agent's headless browser and offline:
 *
 *   Inter  (variable)  the neutral neo-grotesque that stands in for Söhne /
 *                      OpenAI Sans: UI, body, and the display sizes.
 *   Newsreader (var.)  a literary serif, used only for editorial moments —
 *                      OpenAI pairs its sans with a serif the same way.
 *   JetBrains Mono     machine output: tool names, payloads, the terminal.
 *
 * Colour is deliberately absent: black on white, and the greys between.
 */
const sans = localFont({
  src: "./fonts/inter-latin-wght-normal.woff2",
  // The variables are *_src: globals.css adds the fallback chain on top,
  // so nothing has to reference a token inside its own definition.
  variable: "--font-sans-src",
  display: "swap",
  weight: "100 900",
});

const serif = localFont({
  src: "./fonts/newsreader-latin-opsz-normal.woff2",
  variable: "--font-serif-src",
  display: "swap",
  weight: "200 800",
});

const mono = localFont({
  src: "./fonts/jetbrains-mono-latin-wght-normal.woff2",
  variable: "--font-mono-src",
  display: "swap",
  weight: "100 800",
});

/**
 * WebMCP is still an opt-in browser API. Set the origin-trial token you were
 * issued for this exact host and Next emits the meta tag; leave it unset and
 * nothing is emitted (a bogus token would only log a console error).
 */
const WEBMCP_ORIGIN_TRIAL = process.env.NEXT_PUBLIC_WEBMCP_ORIGIN_TRIAL ?? "";

export const metadata: Metadata = {
  metadataBase: process.env.NEXT_PUBLIC_SITE_URL
    ? new URL(process.env.NEXT_PUBLIC_SITE_URL)
    : undefined,
  title: "SENTINEL — Autonomous Supply-Chain CVE Strike Team",
  description:
    "SENTINEL reads your dependency tree, triages every advisory against the versions you actually ship, works out how risky each fix is, prepares the patch — and stops to ask a human before the pull request. Built on the TrueForge agent harness.",
  keywords: [
    "SENTINEL",
    "CVE",
    "supply chain",
    "dependency triage",
    "TrueForge",
    "MCP",
    "WebMCP",
    "Daytona",
    "OSV",
    "security agent",
  ],
  openGraph: {
    title: "SENTINEL — Autonomous Supply-Chain CVE Strike Team",
    description:
      "Everything up to the pull request is autonomous. The pull request itself is not — it stops and asks a human.",
    type: "website",
  },
  other: {
    // Discovery hints for crawlers and agent runtimes that read the head.
    "mcp-endpoint": "/api/mcp",
  },
  // Machine-readable pointer at the tool endpoint for anything that reads
  // metadata instead of documentation. llms.txt is linked from <head> below,
  // because Next's `alternates` has no slot for a plain text/plain resource.
  alternates: {
    types: {
      "application/json": [{ url: "/api/mcp" }],
    },
  },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} ${mono.variable}`}>
      <head>
        {WEBMCP_ORIGIN_TRIAL.length > 0 ? (
          <meta http-equiv="origin-trial" content={WEBMCP_ORIGIN_TRIAL} />
        ) : null}
        {/* Two links an agent can find without fetching anything else: the text
            digest of this site, and the plain-language pointer to the bridge. */}
        <link rel="alternate" type="text/plain" href="/llms.txt" title="SENTINEL agent digest" />
        <link rel="llms" href="/llms.txt" />
      </head>
      <body>
        <Aurora />
        <div className="backdrop" aria-hidden />
        <MotionRoot />
        <WebMcpBoot />
        {children}
      </body>
    </html>
  );
}
