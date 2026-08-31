"use client";

/**
 * The agent cockpit — the eight-stage SENTINEL mission, end to end.
 *
 * A real TrueForge harness is probed through the server; when none answers,
 * the bundled scripted model drives the same tools over the same data — the
 * transcript records actual tool output, never a scripted reply. The mission
 * ends at open_pull_request: the turn stops, the gate asks a human, denial is
 * the default.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Btn, Tilt, Reveal } from "@/components/interactive";
import { runMission, STAGES, type MissionSummary, type TranscriptEntry, type ApprovalRequest } from "@/lib/agent/pipeline";
import type { ConsoleContext } from "@/app/app/page";

const SAMPLE_MANIFEST = JSON.stringify(
  {
    name: "vulnerable-sample",
    version: "1.0.0",
    dependencies: {
      lodash: "4.17.11",
      minimist: "1.2.0",
      axios: "0.21.0",
      "node-fetch": "2.6.0",
      handlebars: "4.0.0",
    },
  },
  null,
  2,
);

function TranscriptLine({ entry }: { entry: TranscriptEntry }) {
  const stamp = new Date(entry.at).toLocaleTimeString("en-GB", { hour12: false });
  if (entry.kind === "approval") {
    return (
      <div className="term-line">
        <span className="who">{stamp}</span>
        <span className="term-approval">approval required: open_pull_request · destructive</span>
      </div>
    );
  }
  const cls =
    entry.kind === "tool-call" ? "term-call"
    : entry.kind === "tool-result" ? "term-result"
    : entry.kind === "tool-error" ? "term-error"
    : entry.kind === "subagent" ? "term-sub"
    : entry.kind === "report" ? "term-report"
    : "term-narration";
  return (
    <div className="term-line">
      <span className="who">{stamp}</span>
      <span className={cls} style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
        {entry.text}
        {entry.detail !== undefined && entry.detail.length > 0 && (
          <span className="faint" style={{ display: "block", marginTop: 4, fontSize: 11 }}>↳ {entry.detail}</span>
        )}
      </span>
    </div>
  );
}

function ApprovalGate({
  request,
  onDecision,
}: {
  request: ApprovalRequest;
  onDecision: (approved: boolean) => void;
}) {
  const [reason, setReason] = useState("");

  // Escape denies. Denial is the default for every input it cannot interpret.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDecision(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDecision]);

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 300,
        background: "rgba(0,0,0,0.78)", backdropFilter: "blur(8px)",
        display: "grid", placeItems: "center", padding: 20,
        animation: "rise 0.3s ease both",
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Approval required"
    >
      <div className="panel brackets" style={{ maxWidth: 640, width: "100%", padding: 30, boxShadow: "0 0 80px rgba(255,255,255,0.14)" }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <span className="kicker">The turn ends here</span>
          <span className="sev sev-critical">destructiveHint</span>
        </div>
        <h3 className="display" style={{ fontSize: 24, margin: "14px 0 6px" }}>
          approval required: {request.toolName}
        </h3>
        <p className="muted small" style={{ margin: "0 0 16px", lineHeight: 1.7 }}>
          {request.summary} Nothing happens until a person decides. Denial is the default — Escape denies too.
        </p>
        <div className="code-block" style={{ margin: "0 0 18px" }}>
          <pre>{JSON.stringify({ toolCallId: request.toolCallId, name: request.toolName, args: request.args }, null, 2)}</pre>
        </div>
        <div className="field" style={{ marginBottom: 18 }}>
          <label>Reason (optional — recorded with the denial)</label>
          <input
            className="input"
            autoFocus
            placeholder="why deny (or why approve)"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onDecision(false);
            }}
          />
        </div>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <Btn variant="ghost" onClick={() => onDecision(false)}>Deny (default)</Btn>
          <Btn variant="primary" onClick={() => onDecision(true)}>Approve — open the pull request</Btn>
        </div>
      </div>
    </div>
  );
}

export default function AgentCockpit({ context }: { context: ConsoleContext }) {
  const { vault, server, push } = context;
  const [mode, setMode] = useState<"repo" | "manifest">(vault.SENTINEL_TARGET_REPO ? "repo" : "manifest");
  const [repo, setRepo] = useState(vault.SENTINEL_TARGET_REPO);
  const [manifest, setManifest] = useState("");
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");
  const [harnessMode, setHarnessMode] = useState<{ reachable: boolean; detail: string } | null>(null);
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [stageState, setStageState] = useState<Record<string, "pending" | "active" | "done" | "skipped">>({});
  const [approval, setApproval] = useState<ApprovalRequest | null>(null);
  const [summary, setSummary] = useState<MissionSummary | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const approvalResolver = useRef<((value: { approved: boolean; reason?: string }) => void) | null>(null);

  // Probe the harness once on mount.
  useEffect(() => {
    fetch("/api/harness", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: vault.TRUEFORGE_URL || undefined }),
    })
      .then((response) => response.json())
      .then((data: { reachable?: boolean; detail?: string }) =>
        setHarnessMode({ reachable: data.reachable === true, detail: String(data.detail ?? "") }),
      )
      .catch(() => setHarnessMode({ reachable: false, detail: "Harness probe failed; scripted model active." }));
  }, [vault.TRUEFORGE_URL]);

  useEffect(() => {
    const node = transcriptRef.current;
    if (node !== null) node.scrollTop = node.scrollHeight;
  }, [entries]);

  const launch = useCallback(async () => {
    setPhase("running");
    setEntries([]);
    setSummary(null);
    setStageState({});
    const fresh: Record<string, "pending" | "active" | "done" | "skipped"> = {};
    for (const stage of STAGES) fresh[stage.id] = "pending";
    setStageState(fresh);

    const result = await runMission(
      {
        source: mode,
        repo: repo.trim(),
        manifestRaw: manifest,
        vault,
        serverRemoteWrites: server === null ? null : server.remoteWrites,
      },
      {
        onEntry: (entry) => setEntries((current) => [...current, entry]),
        onStage: (stage, state) =>
          setStageState((current) => ({ ...current, [stage]: state === "active" ? "active" : state })),
        requestApproval: (request) =>
          new Promise((resolve) => {
            approvalResolver.current = resolve;
            setApproval(request);
          }),
      },
    );
    setSummary(result);
    setPhase("done");
    if (result.ended === "proposed") push(`Pull request #${result.pullRequest?.number} opened — by explicit human consent.`, "ok");
    if (result.ended === "denied") push("The operator denied the pull request. Nothing was written.", "warn");
  }, [mode, repo, manifest, vault, server, push]);

  const decide = useCallback((approved: boolean) => {
    const resolve = approvalResolver.current;
    if (resolve === null) return;
    approvalResolver.current = null;
    setApproval(null);
    resolve({ approved, reason: approved ? undefined : "The operator denied this action at the console." });
  }, []);

  return (
    <div className="grid-2" style={{ gridTemplateColumns: "minmax(300px, 5fr) minmax(280px, 4fr)", gap: 22 }}>
      {/* ------------------------------------------------ left column */}
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div className="panel brackets" style={{ padding: 24 }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h3 className="display" style={{ fontSize: 18, margin: 0 }}>Mission target</h3>
            <span className={`chip ${harnessMode?.reachable === true ? "chip-solid" : ""}`}>
              {harnessMode === null ? "probing harness…" : harnessMode.reachable ? "TrueForge harness" : "scripted model"}
            </span>
          </div>

          <div className="tabs" style={{ padding: 3, marginBottom: 14 }}>
            <button className="tab" data-active={mode === "repo"} style={{ padding: "7px 14px", fontSize: 12 }} onClick={() => setMode("repo")}>owner/repo</button>
            <button className="tab" data-active={mode === "manifest"} style={{ padding: "7px 14px", fontSize: 12 }} onClick={() => setMode("manifest")}>manifest</button>
          </div>

          {mode === "repo" ? (
            <div className="field">
              <label>Repository</label>
              <input className="input" placeholder="owner/name" value={repo} onChange={(event) => setRepo(event.target.value)} />
              <span className="faint small" style={{ fontFamily: "var(--font-body)" }}>
                Full mission: read from GitHub → triage live advisories → patch → verify (Daytona) → approval gate → pull request.
              </span>
            </div>
          ) : (
            <>
              <textarea
                className="textarea mono"
                placeholder="{ … paste package.json … }"
                value={manifest}
                onChange={(event) => setManifest(event.target.value)}
                spellCheck={false}
                style={{ minHeight: 150 }}
              />
              <Btn variant="ghost" style={{ padding: "9px 15px", fontSize: 12.5, marginTop: 12 }} onClick={() => setManifest(SAMPLE_MANIFEST)}>
                Load vulnerable sample
              </Btn>
            </>
          )}

          <div className="row" style={{ margin: "20px 0 0", alignItems: "center" }}>
            <Btn variant="primary" onClick={launch} disabled={phase === "running"} style={{ padding: "13px 24px" }}>
              {phase === "running" ? "Mission running…" : "Launch mission ⌘"}
            </Btn>
            <span className="chip">{vault.SENTINEL_ALLOW_REMOTE_WRITES ? "writes permitted (gated)" : "kill switch: read-only"}</span>
          </div>

          {harnessMode !== null && !harnessMode.reachable && (
            <p className="faint small" style={{ margin: "14px 0 0", lineHeight: 1.7 }}>{harnessMode.detail}</p>
          )}
        </div>

        {/* summary card */}
        {summary !== null && (
          <Reveal>
            <Tilt strength={4}>
              <div className="panel brackets" style={{ padding: 24 }}>
                <span className="kicker">
                  Mission {summary.ended === "proposed" ? "complete — pull request opened"
                    : summary.ended === "denied" ? "complete — denied at the gate"
                    : summary.ended === "error" ? "failed" : "complete"}
                </span>
                <div className="row" style={{ gap: 9, margin: "14px 0 0" }}>
                  <span className="chip">{summary.scanned} scanned</span>
                  <span className="chip chip-solid">{summary.matched} matched</span>
                  <span className="chip">{summary.plan.length} in plan</span>
                  <span className={`chip ${summary.verified ? "chip-glow" : ""}`}>{summary.verified ? "verified" : "unverified"}</span>
                </div>
                {summary.pullRequest !== null && (
                  <a className="link mono" style={{ display: "inline-block", marginTop: 14 }} href={summary.pullRequest.url} target="_blank" rel="noreferrer">
                    pull request #{summary.pullRequest.number} · branch {summary.pullRequest.branch} ↗
                  </a>
                )}
                {summary.error !== undefined && (
                  <p className="small" style={{ color: "#fff", margin: "12px 0 0" }}>{summary.error}</p>
                )}
              </div>
            </Tilt>
          </Reveal>
        )}
      </div>

      {/* --------------------------------------------- right: stages */}
      <div className="panel" style={{ padding: 22, alignSelf: "start" }}>
        <span className="kicker">Eight stages · the last one is yours</span>
        <div className="rail" style={{ marginTop: 14 }}>
          {STAGES.map((stage, index) => {
            const state = stageState[stage.id] ?? "pending";
            return (
              <div key={stage.id} className={`rail-node ${state === "active" ? "active" : state === "done" ? "done" : state === "skipped" ? "skipped" : ""}`}>
                <span className="rail-dot">{state === "done" ? "✓" : state === "skipped" ? "—" : String(index + 1).padStart(2, "0")}</span>
                <span>
                  <span className="rail-label">{stage.label}</span>
                  <span className="rail-tool" style={{ display: "block" }}>{stage.tool}</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* --------------------------------------------- full-width term */}
      <div style={{ gridColumn: "1 / -1" }}>
        <div className="panel sweep" style={{ padding: 20 }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span className="kicker">Transcript — a record of actual tool output</span>
            {phase === "running" && <span className="chip chip-glow"><span className="dot" style={{ width: 6, height: 6 }} /> working</span>}
          </div>
          <div className="term" ref={transcriptRef} style={{ minHeight: 320, maxHeight: 520, overflowY: "auto" }}>
            {entries.length === 0 ? (
              <div className="term-line">
                <span className="who">sentinel</span>
                <span className="term-narration">
                  {phase === "idle" ? "Awaiting mission. Everything up to the pull request is autonomous — the pull request itself is not." : ""}
                </span>
              </div>
            ) : (
              entries.map((entry) => <TranscriptLine key={entry.id} entry={entry} />)
            )}
            {phase === "running" && <div className="term-line"><span className="who" /><span className="cursor-blink" /></div>}
          </div>
        </div>
      </div>

      {approval !== null && <ApprovalGate request={approval} onDecision={decide} />}
    </div>
  );
}
