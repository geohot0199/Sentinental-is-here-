"use client";

/**
 * Satellite scope — the card that sits beside the console demo on the landing
 * page. It replaced the old "live scope" radar: no sweep, no contacts, no
 * target lock. The moving part is a constellation, and the numbers are real:
 * they are read from the browser's model context and from the MCP endpoint, so
 * what a visitor sees here is what an agent would see.
 */
import { useEffect, useState } from "react";
import { probeRemote, type RemoteProbe } from "@/lib/agent-bridge";
import { bridgeStatus, bridgeTools } from "@/lib/webmcp";

export default function SatScope() {
  const [remote, setRemote] = useState<RemoteProbe | null>(null);
  const [local, setLocal] = useState<{ surface: string; count: number; agentVisible: boolean } | null>(null);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      const [probe, tools] = await Promise.all([probeRemote(), bridgeTools()]);
      if (!alive) return;
      setRemote(probe);
      const status = bridgeStatus();
      setLocal({ surface: status.surface, count: tools.length, agentVisible: status.agentVisible });
    };
    void run();
    const timer = window.setInterval(() => void run(), 30_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  const status = local === null ? "reading…" : local.agentVisible ? "agent-visible" : "in-page only";
  const dotClass = remote?.reachable ? "dot" : "dot dot-red";

  return (
    <div className="panel brackets pad-md scope-card" style={{ borderRadius: "calc(var(--radius) - 1px)" }}>
      <div className="h-row">
        <span className="kicker">Constellation</span>
        <span className="row" style={{ gap: 6, alignItems: "center" }}>
          <span className={dotClass} />
          <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-faint)" }}>{status}</span>
        </span>
      </div>

      <div className="scope-stage" aria-hidden="true">
        <span className="scope-ring r1" />
        <span className="scope-ring r2" />
        <span className="scope-ring r3" />
        <span className="scope-earth" />
        <span className="scope-arm a1"><i /></span>
        <span className="scope-arm a2"><i /></span>
        <span className="scope-arm a3"><i /></span>
      </div>

      <div className="scope-telemetry">
        <div className="scope-row">
          <span>tools in page</span>
          <b>{local === null ? "—" : local.count}</b>
        </div>
        <div className="scope-row">
          <span>tools over MCP</span>
          <b>{remote === null ? "—" : remote.toolCount}</b>
        </div>
        <div className="scope-row">
          <span>protocol</span>
          <b>{remote === null || remote.protocolVersions.length === 0 ? "—" : remote.protocolVersions[0]}</b>
        </div>
        <div className="scope-row">
          <span>round trip</span>
          <b>{remote?.latencyMs === null || remote === null ? "—" : `${remote.latencyMs} ms`}</b>
        </div>
      </div>

      <p className="muted small" style={{ margin: 0, lineHeight: 1.6 }}>
        Same tools, two doors: <code className="mono">document.modelContext</code> for an agent inside your browser,{" "}
        <code className="mono">POST /api/mcp</code> for one outside it.
      </p>
    </div>
  );
}
