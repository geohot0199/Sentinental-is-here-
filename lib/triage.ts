/**
 * Triage orchestration: plan + patch, ported from src/server/scanner.ts.
 * Pure functions — no I/O — so the client pipeline and the API route run
 * identical code.
 */
import { classifyBump, severityRankSafe } from "./semverBridge";
import type { AdvisoryMatch } from "./advisories";
import { resolveSafeVersion, sortMatches } from "./advisories";

export interface PlanEntry {
  readonly packageName: string;
  readonly installedVersion: string;
  readonly targetVersion: string | null;
  readonly worstSeverity: string;
  readonly advisoryCount: number;
  readonly bump: string;
}

export interface PatchResult {
  readonly path: string;
  readonly content: string | null;
  readonly applied: readonly string[];
  readonly skipped: readonly string[];
}

/** Collapse matches into one safe target version per package, worst first. */
export function buildPlan(matches: readonly AdvisoryMatch[]): PlanEntry[] {
  const byPackage = new Map<string, AdvisoryMatch[]>();
  for (const match of matches) {
    const bucket = byPackage.get(match.packageName) ?? [];
    bucket.push(match);
    byPackage.set(match.packageName, bucket);
  }

  const plan = [...byPackage.entries()].map(([packageName, entries]) => {
    const installedVersion = entries[0]?.installedVersion ?? "unknown";
    const targetVersion = resolveSafeVersion(entries);
    const worstSeverity =
      entries.map((e) => e.advisory.severity).sort((a, b) => severityRankSafe(b) - severityRankSafe(a))[0] ?? "unknown";
    return {
      packageName,
      installedVersion,
      targetVersion,
      worstSeverity,
      advisoryCount: entries.length,
      bump: targetVersion === null ? "unknown" : classifyBump(installedVersion, targetVersion),
    };
  });

  plan.sort((a, b) => severityRankSafe(b.worstSeverity) - severityRankSafe(a.worstSeverity));
  return plan;
}

/** Regenerate package.json with the plan applied, range operators preserved. */
export function buildPatch(manifestRaw: string, plan: readonly PlanEntry[]): PatchResult {
  const applied: string[] = [];
  const skipped: string[] = [];

  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(manifestRaw) as Record<string, unknown>;
  } catch {
    return { path: "package.json", content: null, applied, skipped: ["package.json is not valid JSON."] };
  }

  const sections = ["dependencies", "devDependencies", "optionalDependencies"] as const;

  for (const entry of plan) {
    if (entry.targetVersion === null) {
      skipped.push(`${entry.packageName}: no published fix`);
      continue;
    }
    let found = false;
    for (const section of sections) {
      const record = pkg[section];
      if (typeof record !== "object" || record === null) continue;
      const table = record as Record<string, string>;
      const current = table[entry.packageName];
      if (current === undefined) continue;
      const prefix = /^[\^~]/.exec(current)?.[0] ?? "";
      table[entry.packageName] = `${prefix}${entry.targetVersion}`;
      applied.push(`${entry.packageName}: ${current} → ${prefix}${entry.targetVersion} (${section})`);
      found = true;
      break;
    }
    if (!found) skipped.push(`${entry.packageName}: transitive, not in package.json`);
  }

  // npm's own formatting, so the diff is the change and nothing else.
  const content = applied.length > 0 ? `${JSON.stringify(pkg, null, 2)}\n` : null;
  return { path: "package.json", content, applied, skipped };
}

export { sortMatches };
