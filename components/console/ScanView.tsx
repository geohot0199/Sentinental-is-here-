"use client";

/**
 * The scan station — live dependency triage.
 *
 * Real data path: manifest parse (client) → /api/advisories (GitHub Advisory
 * Database with OSV fallback, proxied) → plan → patch. Advisory summaries are
 * upstream data and render as text only, never as markup.
 */
import { useCallback, useRef, useState } from "react";
import { Btn, Tilt, Reveal } from "@/components/interactive";
import { scanManifest, type Dependency } from "@/lib/manifest";
import { buildPatch, buildPlan, type PlanEntry, type PatchResult } from "@/lib/triage";
import type { AdvisoryMatch } from "@/lib/advisories";
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
    devDependencies: {
      vitest: "^1.0.0",
    },
  },
  null,
  2,
);

const OWN_MANIFEST = JSON.stringify(
  {
    name: "sentinel-strike-team",
    version: "1.0.0",
    dependencies: {
      "@hono/node-server": "^1.13.7",
      "@modelcontextprotocol/sdk": "^1.0.4",
      hono: "^4.6.14",
      zod: "^3.24.1",
    },
  },
  null,
  2,
);

type ScanStage = "inventory" | "triage" | "plan" | "patch" | "done";
const SCAN_STAGES: { id: ScanStage; label: string; hint: string }[] = [
  { id: "inventory", label: "Inventory", hint: "resolve installed versions" },
  { id: "triage", label: "Triage", hint: "match advisory ranges" },
  { id: "plan", label: "Plan", hint: "one safe target per package" },
  { id: "patch", label: "Patch", hint: "regenerate package.json" },
  { id: "done", label: "Report", hint: "what a human needs to decide" },
];

interface ScanResult {
  projectName: string | null;
  total: number;
  resolved: number;
  warnings: readonly string[];
  matches: (AdvisoryMatch & { scope?: string })[];
  plan: PlanEntry[];
  patch: PatchResult;
}

function SevChip({ severity }: { severity: string }) {
  const cls =
    severity === "critical" ? "sev-critical"
    : severity === "high" ? "sev-high"
    : severity === "moderate" ? "sev-moderate"
    : severity === "low" ? "sev-low"
    : "sev-unknown";
  return <span className={`sev ${cls}`}>{severity}</span>;
}

function diffLines(before: string, after: string): { line: string; kind: "same" | "add" | "del" }[] {
  const a = before.split("\n");
  const b = after.split("\n");
  const out: { line: string; kind: "same" | "add" | "del" }[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      out.push({ line: a[i], kind: "same" });
      i += 1;
      j += 1;
    } else {
      // naive lookahead: deletion then insertion
      const nextMatch = b.findIndex((line, index) => index > j && line === a[i]);
      if (i < a.length && (j >= b.length || (nextMatch === -1 && a[i] !== b[j]))) {
        out.push({ line: a[i], kind: "del" });
        i += 1;
      } else if (j < b.length) {
        out.push({ line: b[j], kind: "add" });
        j += 1;
      } else {
        i += 1;
      }
    }
  }
  return out;
}

export default function ScanView({ context }: { context: ConsoleContext }) {
  const { vault, server, push } = context;
  const [mode, setMode] = useState<"manifest" | "repo">("manifest");
  const [manifest, setManifest] = useState("");
  const [repo, setRepo] = useState(vault.SENTINEL_TARGET_REPO);
  const [phase, setPhase] = useState<"idle" | "running" | "done" | "error">("idle");
  const [stageState, setStageState] = useState<Record<ScanStage, "pending" | "active" | "done">>({
    inventory: "pending", triage: "pending", plan: "pending", patch: "pending", done: "pending",
  });
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);

  const log = useCallback((line: string) => {
    const node = transcriptRef.current;
    if (node === null) return;
    const div = document.createElement("div");
    div.className = "term-line";
    const who = document.createElement("span");
    who.className = "who";
    const text = document.createElement("span");
    text.className = "term-narration";
    text.textContent = line; // upstream data — textContent only
    div.append(who, text);
    node.appendChild(div);
    node.scrollTop = node.scrollHeight;
  }, []);

  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  const runScan = async () => {
    setPhase("running");
    setError(null);
    setResult(null);
    setCopied(false);
    setStageState({ inventory: "pending", triage: "pending", plan: "pending", patch: "pending", done: "pending" });
    if (transcriptRef.current !== null) transcriptRef.current.textContent = "";
    const stages: ScanStage[] = ["inventory", "triage", "plan", "patch", "done"];

    const advance = async (index: number, message?: string) => {
      const id = stages[index];
      setStageState((current) => ({ ...current, [id]: "active" }));
      if (message !== undefined) log(message);
      await sleep(id === "triage" ? 260 : 420);
      setStageState((current) => ({ ...current, [id]: "done" }));
    };

    try {
      // ---------------------------------------------------- inventory
      let manifestRaw = manifest;
      let lockRaw: string | null = null;
      if (mode === "repo") {
        if (!vault.GITHUB_TOKEN) {
          throw new Error("Reading a repository needs a GITHUB_TOKEN — add one in the key vault, or paste the manifest instead.");
        }
        log(`Reading ${repo} from GitHub…`);
        const response = await fetch("/api/github", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "repo", repo, token: vault.GITHUB_TOKEN }),
        });
        const data = (await response.json()) as { packageJson?: string | null; lockfile?: string | null; defaultBranch?: string; error?: string };
        if (!response.ok || data.packageJson == null) {
          throw new Error(String(data.error ?? `Could not read package.json from ${repo}.`));
        }
        manifestRaw = data.packageJson;
        lockRaw = data.lockfile ?? null;
      }
      if (manifestRaw.trim().length === 0) {
        throw new Error("Paste a package.json (or load a sample) first.");
      }

      await advance(0, "Reading the manifest…");
      const inventory = scanManifest(manifestRaw, lockRaw, lockRaw === null ? null : "package-lock.json");
      for (const warning of inventory.warnings) log(warning);
      log(`${inventory.dependencies.length} dependencies inventoried — ${inventory.dependencies.filter((d: Dependency) => d.resolved).length} resolved to exact versions.`);

      if (inventory.dependencies.length === 0) {
        setResult({
          projectName: inventory.projectName, total: 0, resolved: 0, warnings: inventory.warnings,
          matches: [], plan: [], patch: { path: "package.json", content: null, applied: [], skipped: [] },
        });
        await advance(4, "No dependencies to triage.");
        setPhase("done");
        return;
      }

      // ------------------------------------------------------- triage
      await advance(1, "Querying the GitHub Advisory Database (OSV fallback)…");
      const response = await fetch("/api/advisories", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          packages: inventory.dependencies.map((d) => ({ name: d.name, version: d.version })),
          ecosystem: "npm",
          githubToken: vault.GITHUB_TOKEN || undefined,
        }),
      });
      const data = (await response.json()) as {
        results?: { name: string; version: string; matches: AdvisoryMatch[]; warnings: string[] }[];
        error?: string;
      };
      if (!response.ok) throw new Error(String(data.error ?? "Advisory lookup failed."));

      const matches: (AdvisoryMatch & { scope?: string })[] = [];
      for (const entry of data.results ?? []) {
        const dep = inventory.dependencies.find((d) => d.name === entry.name);
        for (const match of entry.matches) matches.push({ ...match, scope: dep?.scope });
        log(`${entry.name}@${entry.version} — ${entry.matches.length === 0 ? "clean" : `${entry.matches.length} match(es)`}`);
      }
      log(`Triage complete: ${matches.length} genuine match(es) across ${new Set(matches.map((m) => m.packageName)).size} package(s).`);

      // --------------------------------------------------------- plan
      const plan = buildPlan(matches);
      await advance(2, "Collapsing to one safe target version per package…");
      for (const item of plan) {
        log(`${item.packageName}: ${item.installedVersion} → ${item.targetVersion ?? "no published fix"} (${item.worstSeverity})`);
      }

      // -------------------------------------------------------- patch
      const patch = buildPatch(manifestRaw, plan);
      await advance(3, "Regenerating package.json, range operators preserved…");
      for (const applied of patch.applied) log(applied);

      // ---------------------------------------------------------- done
      await advance(4, matches.length === 0 ? "Scan complete. No advisories match the versions in use." : `Scan complete. ${matches.length} advisory match(es).`);
      setResult({
        projectName: inventory.projectName,
        total: inventory.dependencies.length,
        resolved: inventory.dependencies.filter((d) => d.resolved).length,
        warnings: inventory.warnings,
        matches,
        plan,
        patch,
      });
      setPhase("done");
      if (matches.length > 0) push(`${matches.length} advisory match(es) found — review before anything is proposed.`, "alert");
      else push("Clean. No advisory ranges match what you ship.", "ok");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Scan failed.";
      setError(message);
      setPhase("error");
      log(`error: ${message}`);
      push(message, "warn");
    }
  };

  const copyPatch = async () => {
    if (result?.patch.content == null) return;
    try {
      await navigator.clipboard.writeText(result.patch.content);
      setCopied(true);
      push("Patched package.json copied to clipboard.", "ok");
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      push("Clipboard blocked by the browser.", "warn");
    }
  };

  return (
    <div className="grid-2" style={{ gridTemplateColumns: "minmax(300px, 5fr) minmax(280px, 4fr)", gap: 22 }}>
      {/* ------------------------------------------------ left: input */}
      <div>
        <div className="panel brackets" style={{ padding: 24 }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h3 className="display" style={{ fontSize: 18, margin: 0 }}>Target</h3>
            <div className="tabs" style={{ padding: 3 }}>
              <button className="tab" data-active={mode === "manifest"} style={{ padding: "6px 13px", fontSize: 12 }} onClick={() => setMode("manifest")}>Manifest</button>
              <button className="tab" data-active={mode === "repo"} style={{ padding: "6px 13px", fontSize: 12 }} onClick={() => setMode("repo")}>owner/repo</button>
            </div>
          </div>

          {mode === "manifest" ? (
            <>
              <textarea
                className="textarea mono"
                placeholder="{ … paste package.json … }"
                value={manifest}
                onChange={(event) => setManifest(event.target.value)}
                spellCheck={false}
                style={{ minHeight: 200 }}
              />
              <div className="row" style={{ margin: "14px 0 0" }}>
                <Btn variant="ghost" style={{ padding: "9px 15px", fontSize: 12.5 }} onClick={() => setManifest(SAMPLE_MANIFEST)}>Load vulnerable sample</Btn>
                <Btn variant="ghost" style={{ padding: "9px 15px", fontSize: 12.5 }} onClick={() => setManifest(OWN_MANIFEST)}>Load own manifest</Btn>
              </div>
              <p className="faint small" style={{ margin: "12px 0 0", lineHeight: 1.6 }}>
                The vulnerable sample ships known CVEs in lodash, minimist, axios, node-fetch and handlebars — real
                advisory data comes back for them.
              </p>
            </>
          ) : (
            <>
              <div className="field">
                <label>Repository</label>
                <input
                  className="input"
                  placeholder="owner/name"
                  value={repo}
                  onChange={(event) => setRepo(event.target.value)}
                />
              </div>
              <p className="faint small" style={{ margin: "12px 0 0", lineHeight: 1.6 }}>
                Reads package.json and the lockfile from GitHub through this app's proxy — the token from your vault
                ({vault.GITHUB_TOKEN ? "configured" : "not configured"}) is used for the request only.
              </p>
            </>
          )}

          <div className="row" style={{ margin: "20px 0 0", alignItems: "center" }}>
            <Btn variant="primary" onClick={runScan} disabled={phase === "running"} style={{ padding: "13px 24px" }}>
              {phase === "running" ? "Scanning…" : "Run scan ⬡"}
            </Btn>
            {server !== null && (
              <span className="chip">{server.advisorySource}</span>
            )}
          </div>
          {error !== null && (
            <div className="term term-error" style={{ marginTop: 16, padding: "12px 16px" }}>{error}</div>
          )}
        </div>

        {/* transcript */}
        <div className="panel sweep" style={{ padding: 18, marginTop: 20 }}>
          <span className="kicker">Transcript</span>
          <div className="term" ref={transcriptRef} style={{ marginTop: 12, minHeight: 140, maxHeight: 300, overflowY: "auto" }}>
            <div className="term-line">
              <span className="who">sentinel</span>
              <span className="term-narration">{phase === "idle" ? "Awaiting target. Nothing has been scanned yet." : ""}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ----------------------------------------------- right: stages */}
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div className="panel" style={{ padding: 22 }}>
          <span className="kicker">Pipeline</span>
          <div className="rail" style={{ marginTop: 14 }}>
            {SCAN_STAGES.map((stage) => {
              const state = stageState[stage.id];
              return (
                <div key={stage.id} className={`rail-node ${state === "active" ? "active" : state === "done" ? "done" : ""}`}>
                  <span className="rail-dot">{state === "done" ? "✓" : stage.id === "done" ? "◈" : SCAN_STAGES.findIndex((s) => s.id === stage.id) + 1}</span>
                  <span>
                    <span className="rail-label">{stage.label}</span>
                    <span className="faint small" style={{ display: "block" }}>{stage.hint}</span>
                  </span>
                  <span className="rail-tool">{state === "active" ? "running" : state === "done" ? "done" : "—"}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* stats */}
        {result !== null && (
          <Reveal>
            <div className="panel" style={{ padding: 22 }}>
              <span className="kicker">Inventory</span>
              <div className="row" style={{ gap: 10, margin: "14px 0 0" }}>
                <span className="chip">{result.projectName ?? "project"}</span>
                <span className="chip chip-solid">{result.matches.length} matches</span>
                <span className="chip">{result.total} deps</span>
                <span className="chip">{result.resolved} resolved</span>
              </div>
            </div>
          </Reveal>
        )}
      </div>

      {/* ------------------------------------------------- full width */}
      {result !== null && result.matches.length > 0 && (
        <div style={{ gridColumn: "1 / -1" }}>
          <Reveal>
            <span className="kicker">Advisory matches — worst first</span>
            <div className="grid-2" style={{ marginTop: 16 }}>
              {result.matches.map((match, index) => (
                <Tilt key={`${match.packageName}-${match.advisory.id}`} strength={5}>
                  <div className="panel brackets" style={{ padding: 20, height: "100%" }}>
                    <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                      <strong className="mono" style={{ fontSize: 15, color: "#fff" }}>{match.packageName}@{match.installedVersion}</strong>
                      <SevChip severity={match.advisory.severity} />
                    </div>
                    <div className="row" style={{ gap: 8, margin: "10px 0 0" }}>
                      <span className="chip">{match.advisory.id}</span>
                      {match.advisory.cve !== null && <span className="chip">{match.advisory.cve}</span>}
                      {match.advisory.cvssScore !== null && <span className="chip">CVSS {match.advisory.cvssScore}</span>}
                      <span className="chip">{match.advisory.source}</span>
                      {match.scope !== undefined && <span className="chip">{match.scope}</span>}
                    </div>
                    <p className="muted small" style={{ margin: "12px 0 0", lineHeight: 1.7 }}>{match.advisory.summary}</p>
                    <hr className="divider" style={{ margin: "14px 0" }} />
                    <div className="mono faint" style={{ fontSize: 11.5, lineHeight: 1.9 }}>
                      <div>vulnerable range · {match.advisory.vulnerableRange}</div>
                      <div>
                        first patched · {match.advisory.firstPatchedVersion ?? "none published"}
                        {match.bump !== "unknown" && ` · ${match.bump} bump`}
                      </div>
                    </div>
                    <a className="link mono small" style={{ marginTop: 10, display: "inline-block" }} href={match.advisory.url} target="_blank" rel="noreferrer">
                      {match.advisory.id} ↗
                    </a>
                  </div>
                </Tilt>
              ))}
            </div>
          </Reveal>

          {/* plan */}
          <Reveal>
            <div className="panel" style={{ padding: 22, marginTop: 22 }}>
              <span className="kicker">Remediation plan — one safe target per package</span>
              <div style={{ overflowX: "auto", marginTop: 14 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr className="mono faint" style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase" }}>
                      <th style={{ textAlign: "left", padding: "10px 12px" }}>Package</th>
                      <th style={{ textAlign: "left", padding: "10px 12px" }}>Installed</th>
                      <th style={{ textAlign: "left", padding: "10px 12px" }}>Target</th>
                      <th style={{ textAlign: "left", padding: "10px 12px" }}>Bump</th>
                      <th style={{ textAlign: "left", padding: "10px 12px" }}>Worst</th>
                      <th style={{ textAlign: "left", padding: "10px 12px" }}>Advisories</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.plan.map((item) => (
                      <tr key={item.packageName} style={{ borderTop: "1px solid var(--line)" }}>
                        <td className="mono" style={{ padding: "10px 12px", color: "#fff" }}>{item.packageName}</td>
                        <td className="mono muted" style={{ padding: "10px 12px" }}>{item.installedVersion}</td>
                        <td className="mono" style={{ padding: "10px 12px" }}>{item.targetVersion ?? <span className="faint">no published fix</span>}</td>
                        <td className="mono muted" style={{ padding: "10px 12px" }}>{item.bump}</td>
                        <td style={{ padding: "10px 12px" }}><SevChip severity={item.worstSeverity} /></td>
                        <td className="mono muted" style={{ padding: "10px 12px" }}>{item.advisoryCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Reveal>

          {/* patch */}
          {result.patch.content !== null && (
            <Reveal>
              <div className="panel" style={{ padding: 22, marginTop: 22 }}>
                <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                  <span className="kicker">Patched package.json — nothing has been written anywhere</span>
                  <Btn style={{ padding: "9px 16px", fontSize: 12.5 }} onClick={copyPatch}>
                    {copied ? "Copied ✓" : "Copy patch"}
                  </Btn>
                </div>
                <div className="code-block" style={{ marginTop: 14 }}>
                  <pre>
                    {diffLines(manifest, result.patch.content).map((line, index) => (
                      <span
                        key={index}
                        style={{
                          display: "block",
                          color: line.kind === "add" ? "#fff" : line.kind === "del" ? "var(--ink-faint)" : "var(--ink-dim)",
                          background: line.kind === "add" ? "rgba(255,255,255,0.09)" : line.kind === "del" ? "rgba(255,255,255,0.03)" : undefined,
                          textDecoration: line.kind === "del" ? "line-through" : undefined,
                        }}
                      >
                        {line.kind === "add" ? "+ " : line.kind === "del" ? "- " : "  "}
                        {line.line}
                      </span>
                    ))}
                  </pre>
                </div>
                <p className="faint small" style={{ margin: "12px 0 0" }}>
                  {result.patch.applied.length} upgrade(s) applied, range operators preserved. Opening a pull request
                  with this patch happens in the Agent cockpit — behind the approval gate.
                </p>
              </div>
            </Reveal>
          )}
        </div>
      )}
    </div>
  );
}
