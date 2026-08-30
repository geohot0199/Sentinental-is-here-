"use client";

/**
 * The command deck — the console's `GET /api/status` view: booleans and names
 * only, merged from the browser vault and the server environment.
 */
import { useEffect, useState } from "react";
import { Btn, Tilt, Reveal } from "@/components/interactive";
import { describeCapabilities } from "@/lib/keys";
import type { ConsoleContext } from "@/app/app/page";

function StatusCard({
  title,
  on,
  onLabel,
  offLabel,
  children,
}: {
  title: string;
  on: boolean;
  onLabel: string;
  offLabel: string;
  children?: React.ReactNode;
}) {
  return (
    <Tilt strength={6}>
      <div className="panel brackets" style={{ padding: 22, height: "100%" }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <h3 className="display" style={{ fontSize: 15, margin: 0, letterSpacing: "0.04em" }}>{title}</h3>
          <span className={`chip ${on ? "chip-solid" : ""}`}>{on ? onLabel : offLabel}</span>
        </div>
        <div style={{ marginTop: 12 }}>{children}</div>
      </div>
    </Tilt>
  );
}

export default function Deck({ context, onNavigate }: { context: ConsoleContext; onNavigate: (tab: "scan" | "agent" | "keys") => void }) {
  const { vault, server } = context;
  const capabilities = describeCapabilities(vault, server === null ? null : server.remoteWrites);
  const [health, setHealth] = useState<{ ok: boolean; uptime: number } | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((response) => response.json())
      .then((data) => setHealth(data))
      .catch(() => setHealth(null));
  }, []);

  return (
    <div>
      <div className="grid-3">
        <Reveal>
          <StatusCard title="MODEL" on={capabilities.model !== null} onLabel={capabilities.model ?? "ready"} offLabel="scripted model">
            <p className="muted small" style={{ margin: 0, lineHeight: 1.7 }}>
              {capabilities.model === null
                ? "No provider key. The bundled scripted model runs the full path — real advisory data, real tools, real approval gate — without spending anything."
                : `Provider ${capabilities.model}${vault.MODEL_ID ? ` · ${vault.MODEL_ID}` : " · mid-tier model from the harness catalog"}.`}
            </p>
          </StatusCard>
        </Reveal>

        <Reveal delay={60}>
          <StatusCard title="GITHUB" on={capabilities.github} onLabel="token set" offLabel="public data only">
            <p className="muted small" style={{ margin: 0, lineHeight: 1.7 }}>
              {capabilities.github
                ? `Token loaded${capabilities.targetRepo ? ` · default target ${capabilities.targetRepo}` : ""}. Repositories can be read and pull requests opened — behind the gate.`
                : "Advisory triage works without a token; private repos and pull requests need one."}
            </p>
          </StatusCard>
        </Reveal>

        <Reveal delay={120}>
          <StatusCard title="SANDBOX" on={capabilities.sandbox} onLabel="Daytona ready" offLabel="patches unverified">
            <p className="muted small" style={{ margin: 0, lineHeight: 1.7 }}>
              {capabilities.sandbox
                ? "Daytona key present. The verify stage provisions an isolated sandbox, installs dependencies and runs the test suite for real."
                : "No sandbox key. Every patch is reported UNVERIFIED — never silently claimed."}
            </p>
          </StatusCard>
        </Reveal>

        <Reveal delay={180}>
          <StatusCard title="REMOTE WRITES" on={capabilities.remoteWrites} onLabel="permitted" offLabel="kill switch ON">
            <p className="muted small" style={{ margin: 0, lineHeight: 1.7 }}>
              {capabilities.remoteWrites
                ? "Destructive tools may write — but only after the approval gate asks a human, every time."
                : "Destructive tools refuse before any network call, regardless of what the model or the approval UI says."}
            </p>
          </StatusCard>
        </Reveal>

        <Reveal delay={240}>
          <StatusCard title="HARNESS" on={(server?.harnessUrl ?? vault.TRUEFORGE_URL) !== null && (server?.harnessUrl ?? vault.TRUEFORGE_URL) !== ""} onLabel="url configured" offLabel="scripted fallback">
            <p className="muted small" style={{ margin: 0, lineHeight: 1.7 }}>
              TrueForge runs the agent loop, subagents, approvals and session state. The cockpit probes it through
              the server; unreachable means the scripted model takes over — same tools, same gate.
            </p>
          </StatusCard>
        </Reveal>

        <Reveal delay={300}>
          <StatusCard title="ADVISORY SOURCE" on onLabel="live" offLabel="">
            <p className="muted small" style={{ margin: 0, lineHeight: 1.7 }}>
              {server?.advisorySource ?? "GitHub Advisory Database (OSV fallback)"} — live queries, no key required.
            </p>
          </StatusCard>
        </Reveal>
      </div>

      {/* notes + health */}
      <div className="grid-2" style={{ marginTop: 20 }}>
        <Reveal>
          <div className="panel" style={{ padding: 24, height: "100%" }}>
            <span className="kicker">Operator notes</span>
            <ul className="muted small" style={{ margin: "14px 0 0", paddingLeft: 18, lineHeight: 1.9 }}>
              {capabilities.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        </Reveal>
        <Reveal delay={80}>
          <div className="panel" style={{ padding: 24, height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 18 }}>
            <div>
              <span className="kicker">Server</span>
              <div className="row" style={{ gap: 10, marginTop: 14 }}>
                <span className="chip chip-glow"><span className="dot" style={{ width: 6, height: 6 }} /> {health?.ok === true ? "healthy" : "checking…"}</span>
                <span className="chip">uptime {health?.uptime ?? 0}s</span>
                <span className="chip">{server?.serverKillSwitch === "off" ? "kill switch OFF" : "kill switch on"}</span>
              </div>
              <p className="muted small" style={{ lineHeight: 1.7, marginTop: 14 }}>
                The browser never talks to an upstream directly — every credentialed call is proxied through this
                app's own API routes, and keys are used per-request, never stored server-side.
              </p>
            </div>
            <div className="row">
              <Btn variant="primary" onClick={() => onNavigate("scan")}>Run a scan ⬡</Btn>
              <Btn onClick={() => onNavigate("agent")}>Launch a mission ⌘</Btn>
              <Btn variant="ghost" onClick={() => onNavigate("keys")}>Insert keys ⚿</Btn>
            </div>
          </div>
        </Reveal>
      </div>
    </div>
  );
}
