import { NextResponse } from "next/server";
import { lookupAdvisories, sortMatches, type AdvisoryMatch } from "@/lib/advisories";
import { buildPatch, buildPlan } from "@/lib/triage";
import { scanManifest, isValidPackageName } from "@/lib/manifest";
import { toSentinelError } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_PACKAGES = 60;

/**
 * The batch scan endpoint — the web twin of the console's POST /api/scans.
 *
 * POST { manifest: "<package.json text>", lockfile?: string, githubToken? }
 * Runs the same pipeline the agent runs: inventory → triage → plan → patch.
 * Results are real: GitHub Advisory Database with an OSV fallback.
 */
export async function POST(request: Request) {
  let body: { manifest?: unknown; lockfile?: unknown; githubToken?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  if (typeof body.manifest !== "string" || body.manifest.length === 0) {
    return NextResponse.json({ error: "manifest (package.json text) is required." }, { status: 400 });
  }
  if (body.manifest.length > 512 * 1024) {
    return NextResponse.json({ error: "Manifest exceeds the 512 KiB cap." }, { status: 413 });
  }

  const githubToken =
    typeof body.githubToken === "string" && body.githubToken.length > 0 ? body.githubToken : null;

  try {
    // ------------------------------------------------------- 01 inventory
    const inventory = scanManifest(
      body.manifest,
      typeof body.lockfile === "string" && body.lockfile.length > 0 ? body.lockfile : null,
      typeof body.lockfile === "string" ? "package-lock.json" : null,
    );

    if (inventory.dependencies.length === 0) {
      return NextResponse.json({
        ok: true,
        projectName: inventory.projectName,
        inventory: { total: 0, resolved: 0, warnings: inventory.warnings },
        matches: [],
        plan: [],
        patch: { path: "package.json", content: null, applied: [], skipped: [] },
        summary: "No dependencies to triage.",
      });
    }

    // -------------------------------------------------------- 02 triage
    const queue = inventory.dependencies.filter((d) => isValidPackageName(d.name)).slice(0, MAX_PACKAGES);
    const settled = await Promise.allSettled(
      queue.map(async (dep) => {
        const result = await lookupAdvisories(dep.name, dep.version, "npm", githubToken);
        return result.matches.map((match) => ({
          ...match,
          scope: dep.scope,
          resolved: dep.resolved,
        }));
      }),
    );

    const matches: (AdvisoryMatch & { scope?: string; resolved?: boolean })[] = [];
    const warnings = [...inventory.warnings];
    for (const outcome of settled) {
      if (outcome.status === "fulfilled") matches.push(...outcome.value);
      else warnings.push(`Triage failed for one package: ${String(outcome.reason)}`);
    }
    const sorted = sortMatches(matches);

    // --------------------------------------------------------- 03 plan
    const plan = buildPlan(sorted);

    // -------------------------------------------------------- 04 patch
    const patch = buildPatch(body.manifest, plan);

    return NextResponse.json({
      ok: true,
      projectName: inventory.projectName,
      inventory: {
        total: inventory.dependencies.length,
        resolved: inventory.dependencies.filter((d) => d.resolved).length,
        warnings,
      },
      matches: sorted,
      plan,
      patch,
      summary:
        sorted.length === 0
          ? "Scan complete. No advisories match the versions in use."
          : `Scan complete. ${sorted.length} advisory match(es) across ${plan.length} package(s).`,
    });
  } catch (cause) {
    const error = toSentinelError(cause);
    return NextResponse.json(
      { error: error.message, remedy: error.remedy ?? null, code: error.code },
      { status: 400 },
    );
  }
}
