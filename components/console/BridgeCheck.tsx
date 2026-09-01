"use client";

/**
 * Live bridge conformance check — the button that answers "can an agent
 * actually use this site?" instead of asserting it in a paragraph.
 *
 * It runs the same probe the console's Bridge station uses: the browser's
 * model context is read back through `getTools()`, a real tool is invoked
 * through the context, and the MCP endpoint is exercised with conforming
 * 2026-07-28 headers. Anything that fails says why.
 */
import { useCallback, useState } from "react";
import { Btn } from "@/components/interactive";
import { probeBridge, type BridgeSnapshot } from "@/lib/agent-bridge";

export default function BridgeCheck({ autoStart = false, deep = true }: { autoStart?: boolean; deep?: boolean }) {
  const [snapshot, setSnapshot] = useState<BridgeSnapshot | null>(null);
  const [running, setRunning] = useState(autoStart);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      setSnapshot(await probeBridge({ deep }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRunning(false);
    }
  }, [deep]);

  const verdict = snapshot?.verdict;

  return (
    <div className="panel brackets pad-md" style={{ marginTop: 26 }}>
      <div className="h-row" style={{ alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div className="row" style={{ gap: 12, alignItems: "center" }}>
          <span className="kicker">Live check</span>
          {verdict !== undefined ? (
            <span className={`chip ${verdict.ok ? "chip-green" : "chip-red"}`}>
              {verdict.ok ? "bridge healthy" : `${verdict.failed} failing`}
              {verdict.warnings > 0 ? ` · ${verdict.warnings} note${verdict.warnings === 1 ? "" : "s"}` : ""}
            </span>
          ) : null}
        </div>
        <Btn className="btn-md" onClick={() => void run()} disabled={running}>
          {running ? "checking…" : snapshot === null ? "Run the check" : "Run again"}
        </Btn>
      </div>

      {error !== null ? (
        <p className="small" style={{ color: "var(--ink)", marginTop: 14 }}>
          The check itself failed: {error}
        </p>
      ) : null}

      {snapshot === null && !running ? (
        <p className="muted small" style={{ margin: "14px 0 0", lineHeight: 1.7 }}>
          Nothing has been probed yet. The check is read-only: it calls{" "}
          <code className="mono">server/discover</code> and <code className="mono">tools/list</code>, invokes one
          safe tool through <code className="mono">document.modelContext</code>, and confirms that the destructive
          tools refuse. It never opens a pull request.
        </p>
      ) : null}

      {running && snapshot === null ? (
        <div style={{ marginTop: 16, display: "grid", gap: 8 }}>
          {[0, 1, 2, 3].map((index) => (
            <div className="skeleton" key={index} style={{ height: 30 }} />
          ))}
        </div>
      ) : null}

      {snapshot !== null ? (
        <>
          <div className="bridge-rows" style={{ marginTop: 16 }}>
            {snapshot.checks.map((row, index) => (
              <div className="bridge-row" key={`${row.name}-${index}`} data-state={row.level ?? (row.ok ? "pass" : "fail")}>
                <span className="bridge-mark" aria-hidden>
                  {row.level === "warn" ? "!" : row.ok ? "✓" : "×"}
                </span>
                <span className="bridge-name mono">{row.name}</span>
                <span className="bridge-detail">{row.detail}</span>
              </div>
            ))}
          </div>
          <p className="faint small" style={{ margin: "14px 0 0", fontFamily: "var(--font-mono)", fontSize: 11 }}>
            {snapshot.remote.toolCount} tools over MCP · {snapshot.webmcp.registeredCount} registered in-page ·{" "}
            {snapshot.webmcp.surface} surface · probed {new Date(snapshot.checkedAt).toLocaleTimeString()}
          </p>
        </>
      ) : null}
    </div>
  );
}
