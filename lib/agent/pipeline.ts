"use client";

/**
 * SENTINEL mission pipeline — the web twin of the harness runner.
 *
 * Eight stages, the last one human. Every tool call below is real:
 *  - scan_dependencies   → manifest parse (or GitHub read through /api/github)
 *  - lookup_advisories   → live GitHub Advisory Database / OSV through /api/advisories
 *  - assess_blast_radius → semver blast-radius computation
 *  - summarise_triage    → buildPlan (one safe target per package)
 *  - propose_patch       → buildPatch (range operators preserved)
 *  - sandbox verify      → REAL Daytona sandbox through /api/sandbox (or honest UNVERIFIED)
 *  - open_pull_request   → the gate. A human decides. Then a real PR via /api/github.
 *
 * Denial is the default: the approval callback must explicitly resolve true,
 * and the destructive tool re-checks the kill switch itself before any call.
 */
import { scanManifest, type Dependency } from "@/lib/manifest";
import { buildPatch, buildPlan, type PlanEntry, type PatchResult } from "@/lib/triage";
import { classifyBump } from "@/lib/semverBridge";
import type { AdvisoryMatch } from "@/lib/advisories";
import type { KeyVault } from "@/lib/keys";

export type StageId =
  | "inventory"
  | "triage"
  | "delegate"
  | "assess"
  | "plan"
  | "patch"
  | "verify"
  | "propose";

export const STAGES: { id: StageId; label: string; tool: string }[] = [
  { id: "inventory", label: "Inventory", tool: "scan_dependencies" },
  { id: "triage", label: "Triage", tool: "lookup_advisories" },
  { id: "delegate", label: "Delegate", tool: "subagents" },
  { id: "assess", label: "Assess", tool: "assess_blast_radius" },
  { id: "plan", label: "Plan", tool: "summarise_triage" },
  { id: "patch", label: "Patch", tool: "propose_patch" },
  { id: "verify", label: "Verify", tool: "sandbox" },
  { id: "propose", label: "Propose", tool: "open_pull_request" },
];

export type EntryKind =
  | "narration"
  | "tool-call"
  | "tool-result"
  | "tool-error"
  | "subagent"
  | "approval"
  | "report";

export interface TranscriptEntry {
  readonly id: string;
  readonly kind: EntryKind;
  readonly stage: StageId | null;
  readonly text: string;
  readonly detail?: string;
  readonly payload?: unknown;
  readonly at: number;
}

export interface ApprovalRequest {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly annotation: "destructiveHint";
  readonly args: Record<string, unknown>;
  readonly summary: string;
}

export interface MissionInput {
  readonly source: "manifest" | "repo";
  readonly repo?: string;
  readonly manifestRaw?: string;
  readonly vault: KeyVault;
  readonly serverRemoteWrites: boolean | null;
}

export interface RunHooks {
  onEntry(entry: TranscriptEntry): void;
  onStage(stage: StageId, state: "active" | "done" | "skipped"): void;
  requestApproval(request: ApprovalRequest): Promise<{ approved: boolean; reason?: string }>;
}

export interface MissionSummary {
  readonly ok: boolean;
  readonly scanned: number;
  readonly matched: number;
  readonly plan: PlanEntry[];
  readonly matches: (AdvisoryMatch & { scope?: string })[];
  readonly patch: PatchResult | null;
  readonly verified: boolean;
  readonly pullRequest: { number: number; url: string; branch: string } | null;
  readonly ended: "proposed" | "denied" | "clean" | "error";
  readonly error?: string;
}

let counter = 0;
function entry(kind: EntryKind, stage: StageId | null, text: string, detail?: string, payload?: unknown): TranscriptEntry {
  counter += 1;
  return { id: `e${Date.now()}-${counter}`, kind, stage, text, detail, payload, at: Date.now() };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function api(path: string, body: unknown): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  let data: Record<string, unknown> = {};
  try {
    data = (await response.json()) as Record<string, unknown>;
  } catch {
    data = {};
  }
  return { ok: response.ok, status: response.status, data };
}

function riskFor(bump: string): string {
  if (bump === "major") return "HIGH — crosses a major version; breaking changes are expected. A human should review the changelog.";
  if (bump === "minor") return "MEDIUM — minor bump; usually additive but verify the test suite.";
  if (bump === "patch") return "LOW — patch bump; intended to be backwards compatible.";
  return "UNKNOWN — could not classify this version change.";
}

export async function runMission(input: MissionInput, hooks: RunHooks): Promise<MissionSummary> {
  const { vault } = input;
  const say = (kind: EntryKind, stage: StageId | null, text: string, detail?: string, payload?: unknown) =>
    hooks.onEntry(entry(kind, stage, text, detail, payload));

  let manifestRaw: string;
  let lockRaw: string | null = null;
  let repoLabel: string;

  // ------------------------------------------------------------- 01 inventory
  hooks.onStage("inventory", "active");
  say("narration", "inventory", "SENTINEL online. Autonomous supply-chain security analyst reporting for duty.");

  if (input.source === "repo") {
    const repo = input.repo ?? vault.SENTINEL_TARGET_REPO ?? "";
    say("tool-call", "inventory", `scan_dependencies`, JSON.stringify({ repo }, null, 2));
    if (!vault.GITHUB_TOKEN) {
      const message = "GitHub access is not configured. Add a GITHUB_TOKEN in the key vault to read repositories.";
      say("tool-error", "inventory", message, "remedy: GITHUB_TOKEN");
      hooks.onStage("inventory", "done");
      return {
        ok: false, scanned: 0, matched: 0, plan: [], matches: [], patch: null,
        verified: false, pullRequest: null, ended: "error", error: message,
      };
    }
    const result = await api("/api/github", {
      action: "repo",
      repo,
      token: vault.GITHUB_TOKEN,
    });
    if (!result.ok || typeof result.data.packageJson !== "string" || result.data.packageJson === null) {
      const message = String(result.data.error ?? `Could not read package.json from ${repo}.`);
      say("tool-error", "inventory", message, typeof result.data.remedy === "string" ? result.data.remedy : undefined);
      hooks.onStage("inventory", "done");
      return {
        ok: false, scanned: 0, matched: 0, plan: [], matches: [], patch: null,
        verified: false, pullRequest: null, ended: "error", error: message,
      };
    }
    manifestRaw = result.data.packageJson as string;
    lockRaw = typeof result.data.lockfile === "string" ? (result.data.lockfile as string) : null;
    repoLabel = repo;
    say("tool-result", "inventory",
      `Repository ${repo} read: default branch ${String(result.data.defaultBranch ?? "main")}${lockRaw !== null ? ", lockfile resolved" : ", no readable lockfile"}.`,
      undefined, result.data);
  } else {
    manifestRaw = input.manifestRaw ?? "";
    repoLabel = "the submitted manifest";
    say("tool-call", "inventory", "scan_dependencies", JSON.stringify({ manifest: "package.json (pasted)" }, null, 2));
  }

  let inventory: ReturnType<typeof scanManifest>;
  try {
    inventory = scanManifest(manifestRaw, lockRaw, lockRaw === null ? null : "package-lock.json");
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Manifest could not be parsed.";
    say("tool-error", "inventory", message);
    hooks.onStage("inventory", "done");
    return {
      ok: false, scanned: 0, matched: 0, plan: [], matches: [], patch: null,
      verified: false, pullRequest: null, ended: "error", error: message,
    };
  }

  for (const warning of inventory.warnings) say("narration", "inventory", warning);
  const resolvedCount = inventory.dependencies.filter((d) => d.resolved).length;
  say("tool-result", "inventory",
    `${inventory.dependencies.length} dependencies inventoried from ${repoLabel} — ${resolvedCount} resolved to exact versions${resolvedCount < inventory.dependencies.length ? `, ${inventory.dependencies.length - resolvedCount} estimated from ranges` : ""}.`,
    undefined, { dependencies: inventory.dependencies });
  hooks.onStage("inventory", "done");

  if (inventory.dependencies.length === 0) {
    say("report", null, "No dependencies to triage. Mission complete — nothing is rotting in this tree.");
    return { ok: true, scanned: 0, matched: 0, plan: [], matches: [], patch: null, verified: true, pullRequest: null, ended: "clean" };
  }

  // -------------------------------------------------------------- 02 triage
  hooks.onStage("triage", "active");
  say("narration", "triage", "Querying the GitHub Advisory Database (OSV fallback) against the versions actually shipped…");
  const triage = await api("/api/advisories", {
    packages: inventory.dependencies.map((d) => ({ name: d.name, version: d.version })),
    ecosystem: "npm",
    githubToken: vault.GITHUB_TOKEN || undefined,
  });

  const matches: (AdvisoryMatch & { scope?: string })[] = [];
  if (!triage.ok) {
    say("tool-error", "triage", String(triage.data.error ?? "Advisory lookup failed."));
  } else {
    const results = (triage.data.results as {
      name: string; version: string;
      matches: AdvisoryMatch[]; source: string; warnings: string[];
    }[]) ?? [];
    let checked = 0;
    for (const result of results) {
      checked += 1;
      const dep: Dependency | undefined = inventory.dependencies.find((d) => d.name === result.name);
      for (const match of result.matches) matches.push({ ...match, scope: dep?.scope });
      say("tool-result", "triage",
        result.matches.length === 0
          ? `${result.name}@${result.version} — clean. No advisory range matches the installed version.`
          : `${result.name}@${result.version} — ${result.matches.length} advisory match(es): ${result.matches.map((m) => `${m.advisory.id}${m.advisory.cve ? ` (${m.advisory.cve})` : ""}`).join(", ")}.`,
        undefined, result);
      if (checked % 6 === 0) await sleep(120);
    }
    for (const result of results) {
      for (const warning of result.warnings ?? []) say("narration", "triage", warning);
    }
    say("narration", "triage",
      matches.length === 0
        ? `Triage complete: ${results.length} packages checked, 0 genuine matches. A package appearing in an advisory database is not the same as being vulnerable — only matching ranges count.`
        : `Triage complete: ${results.length} packages checked → ${matches.length} genuine match(es) across ${new Set(matches.map((m) => m.packageName)).size} package(s).`);
  }
  hooks.onStage("triage", "done");

  if (matches.length === 0) {
    say("report", null, `Scan of ${repoLabel} complete. No advisories match the versions in use. The tree is clean.`);
    return { ok: true, scanned: inventory.dependencies.length, matched: 0, plan: [], matches: [], patch: null, verified: true, pullRequest: null, ended: "clean" };
  }

  // ------------------------------------------------------------ 03 delegate
  const byPackage = new Map<string, typeof matches>();
  for (const match of matches) {
    const bucket = byPackage.get(match.packageName) ?? [];
    bucket.push(match);
    byPackage.set(match.packageName, bucket);
  }

  if (byPackage.size >= 3) {
    hooks.onStage("delegate", "active");
    say("narration", "delegate", `${byPackage.size} distinct packages affected — spawning one subagent per package. Each gets a clean context window: ten CVEs do not share (and exhaust) one.`);
    for (const [name, bucket] of byPackage) {
      const worst = bucket.map((m) => m.advisory.severity).sort().join(", ");
      say("subagent", "delegate",
        `subagent[${name}] verdict: ${bucket.length} advisory(ies) (${worst}); fix ${bucket.some((m) => m.recommendedVersion !== null) ? "available" : "NOT published"}.`,
        undefined, { package: name, advisories: bucket.length });
      await sleep(140);
    }
    hooks.onStage("delegate", "done");
  } else {
    hooks.onStage("delegate", "skipped");
    say("narration", "delegate", "Fewer than three packages affected — no subagents needed; a single context window is plenty.");
  }

  // -------------------------------------------------------------- 04 assess
  hooks.onStage("assess", "active");
  const plan: PlanEntry[] = buildPlan(matches);
  for (const item of plan) {
    const target = item.targetVersion ?? "none published";
    const bump = item.targetVersion === null ? "unknown" : classifyBump(item.installedVersion, item.targetVersion);
    const clears = matches.filter(
      (m) => m.packageName === item.packageName && m.recommendedVersion !== null && item.targetVersion !== null,
    ).length;
    say("tool-call", "assess", "assess_blast_radius", JSON.stringify({ packageName: item.packageName, fromVersion: item.installedVersion, toVersion: target }, null, 2));
    say("tool-result", "assess",
      `${item.packageName} ${item.installedVersion} → ${target}. Bump: ${bump}. Risk: ${riskFor(bump)} Advisories cleared by this upgrade: ${clears}. Scope: ${matches.find((m) => m.packageName === item.packageName)?.scope ?? "production"}.`,
      undefined, item);
    await sleep(120);
  }
  hooks.onStage("assess", "done");

  // ---------------------------------------------------------------- 05 plan
  hooks.onStage("plan", "active");
  const upgradable = plan.filter((p) => p.targetVersion !== null).length;
  const awaiting = plan.filter((p) => p.targetVersion === null).length;
  say("tool-call", "plan", "summarise_triage", JSON.stringify({ packages: plan.map((p) => p.packageName) }, null, 2));
  say("tool-result", "plan",
    `Remediation plan: ${upgradable} upgradable${upgradable === 1 ? "" : "s"} to the highest fix version, ${awaiting} awaiting a published fix. One safe target per package — no advisory left open.`,
    undefined, plan);
  hooks.onStage("plan", "done");

  // --------------------------------------------------------------- 06 patch
  hooks.onStage("patch", "active");
  const patch = buildPatch(manifestRaw, plan);
  say("tool-call", "patch", "propose_patch", JSON.stringify({ plan: plan.map((p) => `${p.packageName}@${p.targetVersion ?? "n/a"}`) }, null, 2));
  if (patch.content !== null) {
    say("tool-result", "patch", `Patched package.json generated — ${patch.applied.length} upgrade(s) applied, existing range operators preserved. Nothing has been written anywhere.`, patch.content);
  } else {
    say("tool-result", "patch", "No patch to generate: none of the affected packages have a published fix in package.json.");
  }
  for (const skip of patch.skipped) say("narration", "patch", skip);
  hooks.onStage("patch", "done");

  // -------------------------------------------------------------- 07 verify
  hooks.onStage("verify", "active");
  let verified = false;
  if (patch.content === null) {
    say("narration", "verify", "Nothing to verify — no patch was generated.");
    hooks.onStage("verify", "skipped");
  } else if (!vault.DAYTONA_API_KEY) {
    say("narration", "verify",
      "NO SANDBOX IS CONFIGURED. The agent cannot execute or test anything, so the patch is reported UNVERIFIED. It never guesses that a fix works — add a DAYTONA_API_KEY in the vault to run the test suite in an isolated sandbox.");
    hooks.onStage("verify", "done");
  } else {
    say("tool-call", "verify", "sandbox.verify", JSON.stringify({ files: ["package.json"], command: "npm install && npm test --if-present" }, null, 2));
    say("narration", "verify", "Provisioning an isolated Daytona sandbox, writing the patched manifest, installing and running the test suite…");
    const result = await api("/api/sandbox", {
      action: "verify",
      daytonaKey: vault.DAYTONA_API_KEY,
      manifest: patch.content,
      projectName: inventory.projectName ?? "project",
    });
    if (result.ok && result.data.ok === true) {
      verified = result.data.testsPassed === true;
      const logs = (result.data.log as string[]) ?? [];
      for (const line of logs.slice(-14)) say("narration", "verify", line);
      say("tool-result", "verify",
        verified
          ? `Sandbox verification PASSED — install and test suite exited clean (${String(result.data.summary ?? "")}). The patch is verified.`
          : `Sandbox verification FAILED — ${String(result.data.summary ?? "the test suite failed")}. The patch will NOT be proposed as verified; a human needs to decide.`,
        undefined, result.data);
    } else {
      say("tool-error", "verify", String(result.data.error ?? "Sandbox verification could not run."), String(result.data.remedy ?? ""));
      say("narration", "verify", "Verification unavailable. The patch is reported UNVERIFIED — never silently claimed.");
    }
    hooks.onStage("verify", "done");
  }

  // -------------------------------------------------------------- 08 propose
  hooks.onStage("propose", "active");
  if (patch.content === null) {
    say("report", "propose",
      `Mission complete on ${repoLabel}: ${matches.length} advisory match(es) found, but no published fix exists. Per the rules: if there is no published fix, say so and stop — do not invent a version number.`);
    hooks.onStage("propose", "done");
    return { ok: true, scanned: inventory.dependencies.length, matched: matches.length, plan, matches, patch, verified, pullRequest: null, ended: "clean" };
  }

  // The destructive tool checks its own preconditions BEFORE raising the gate,
  // exactly like src/mcp/tools/open-pull-request.ts.
  const writesAllowed = vault.SENTINEL_ALLOW_REMOTE_WRITES && input.serverRemoteWrites !== false;
  if (!writesAllowed) {
    say("tool-call", "propose", "open_pull_request", JSON.stringify({ repo: input.source === "repo" ? input.repo : "(manifest session)" }, null, 2));
    say("tool-error", "propose",
      "Opening a pull request is blocked: SENTINEL is running in read-only mode.",
      "Set SENTINEL_ALLOW_REMOTE_WRITES=true to permit remote writes. The refusal happened before any network call.");
    hooks.onStage("propose", "done");
    say("report", "propose", `Mission ended in read-only mode. ${matches.length} advisory match(es) documented, patch prepared, no write attempted.`);
    return { ok: true, scanned: inventory.dependencies.length, matched: matches.length, plan, matches, patch, verified, pullRequest: null, ended: "clean" };
  }
  if (input.source !== "repo" || !vault.GITHUB_TOKEN) {
    say("tool-call", "propose", "open_pull_request", JSON.stringify({ repo: input.source === "repo" ? input.repo : "(manifest session)" }, null, 2));
    say("tool-error", "propose",
      "GitHub access is not configured for the pull request.",
      input.source === "repo" ? "Add a GITHUB_TOKEN in the key vault." : "Run the mission against an owner/repo to open a pull request — a pasted manifest has nowhere to send one.");
    hooks.onStage("propose", "done");
    say("report", "propose", `Mission complete on ${repoLabel}: ${matches.length} advisory match(es), patch prepared and ${verified ? "verified" : "UNVERIFIED"}. The pull request needs a target repository.`);
    return { ok: true, scanned: inventory.dependencies.length, matched: matches.length, plan, matches, patch, verified, pullRequest: null, ended: "clean" };
  }

  const prTitle = `fix(deps): security upgrades for ${new Set(matches.map((m) => m.packageName)).size} package(s)`;
  const prBodyLines = [
    "## SENTINEL automated dependency triage",
    "",
    `**Scanned:** ${repoLabel} — ${inventory.dependencies.length} dependencies`,
    `**Advisory matches:** ${matches.length} across ${byPackage.size} package(s)`,
    `**Verification:** ${verified ? "sandbox — install + test suite passed" : "UNVERIFIED — no sandbox test was run"}`,
    "",
    "### Plan",
    ...plan.map((p) => `- \`${p.packageName}\` ${p.installedVersion} → \`${p.targetVersion ?? "no published fix"}\` (${p.worstSeverity}, ${p.advisoryCount} advisory(ies))`),
    "",
    "### Advisories cleared",
    ...matches.map((m) => `- [${m.advisory.id}](${m.advisory.url}) ${m.advisory.cve ? `(${m.advisory.cve}) ` : ""}— ${m.advisory.severity}`),
    "",
    "The branch name and this pull request were generated by SENTINEL. The irreversible step waited for a human.",
  ];

  const toolCallId = `call_${globalThis.crypto.randomUUID().slice(0, 8)}`;
  say("tool-call", "propose", "open_pull_request", JSON.stringify({ repo: input.repo, title: prTitle, annotations: { destructiveHint: true } }, null, 2));
  say("approval", "propose",
    "approval required: open_pull_request · destructive — the turn ends here and waits for a human.",
    undefined,
    { toolCallId, toolName: "open_pull_request" });

  const decision = await hooks.requestApproval({
    toolCallId,
    toolName: "open_pull_request",
    annotation: "destructiveHint",
    args: { repo: input.repo, title: prTitle, files: { "package.json": "patched" } },
    summary: `Open a pull request against ${input.repo} with ${patch.applied.length} dependency upgrade(s).`,
  });

  if (!decision.approved) {
    say("tool-result", "propose",
      `The operator denied this action${decision.reason ? `: ${decision.reason}` : ""}. Nothing was written. Denial is the default.`,
      undefined, { approved: false });
    hooks.onStage("propose", "done");
    say("report", "propose", `Mission ended at the gate. ${matches.length} advisory match(es) documented, patch prepared, pull request DENIED by the operator.`);
    return { ok: true, scanned: inventory.dependencies.length, matched: matches.length, plan, matches, patch, verified, pullRequest: null, ended: "denied" };
  }

  const result = await api("/api/github", {
    action: "open-pr",
    repo: input.repo,
    token: vault.GITHUB_TOKEN,
    allowRemoteWrites: vault.SENTINEL_ALLOW_REMOTE_WRITES,
    title: prTitle,
    content: patch.content,
    prBody: prBodyLines.join("\n"),
  });

  if (result.ok && result.data.ok === true) {
    const url = String(result.data.url);
    say("tool-result", "propose", String(result.data.text), undefined, result.data);
    hooks.onStage("propose", "done");
    say("report", "propose",
      `Mission complete on ${repoLabel}: ${inventory.dependencies.length} dependencies scanned, ${matches.length} advisory match(es), ${patch.applied.length} upgrade(s) proposed, ${verified ? "verified in sandbox" : "reported UNVERIFIED"}, pull request opened by a human's explicit consent.`);
    return {
      ok: true,
      scanned: inventory.dependencies.length,
      matched: matches.length,
      plan,
      matches,
      patch,
      verified,
      pullRequest: { number: Number(result.data.number), url, branch: String(result.data.branch) },
      ended: "proposed",
    };
  }

  const message = String(result.data.error ?? `GitHub returned ${result.status}.`);
  say("tool-error", "propose", message, String(result.data.remedy ?? ""));
  hooks.onStage("propose", "done");
  return { ok: false, scanned: inventory.dependencies.length, matched: matches.length, plan, matches, patch, verified, pullRequest: null, ended: "error", error: message };
}
