import { NextResponse } from "next/server";
import { lookupAdvisories } from "@/lib/advisories";

export const dynamic = "force-dynamic";

/**
 * Live advisory triage, proxied so the browser never talks to an upstream
 * directly. Works with no credentials at all (public GitHub Advisory data with
 * an OSV fallback); a token from the vault raises the rate limit.
 *
 * POST { packages: [{ name, version }], ecosystem?, githubToken? }
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const input = body as {
    packages?: unknown;
    ecosystem?: unknown;
    githubToken?: unknown;
  };

  const packages = Array.isArray(input.packages) ? (input.packages as unknown[]) : [];

  if (packages.length === 0) {
    return NextResponse.json({ error: "packages must be a non-empty array." }, { status: 400 });
  }
  if (packages.length > 60) {
    return NextResponse.json(
      { error: "Too many packages in one batch (limit 60). Split the scan." },
      { status: 413 },
    );
  }

  const ecosystem = typeof input.ecosystem === "string" && input.ecosystem.length > 0 ? input.ecosystem : "npm";
  const githubToken =
    typeof input.githubToken === "string" && input.githubToken.length > 0 ? input.githubToken : null;

  // Reject malformed entries before any upstream call.
  const cleaned: { name: string; version: string }[] = [];
  for (const entry of packages) {
    const record = entry as { name?: unknown; version?: unknown };
    if (typeof record.name !== "string" || typeof record.version !== "string") continue;
    if (record.name.trim().length === 0 || record.name.length > 214) continue;
    cleaned.push({ name: record.name, version: record.version });
  }
  if (cleaned.length === 0) {
    return NextResponse.json({ error: "No valid package entries." }, { status: 400 });
  }

  const settled = await Promise.allSettled(
    cleaned.map(async (pkg) => {
      const result = await lookupAdvisories(pkg.name, pkg.version, ecosystem, githubToken);
      return { name: pkg.name, version: pkg.version, ...result };
    }),
  );

  const results = settled.map((outcome, index) => {
    if (outcome.status === "fulfilled") return outcome.value;
    return {
      name: cleaned[index].name,
      version: cleaned[index].version,
      matches: [],
      source: "none" as const,
      warnings: [`Lookup failed: ${String(outcome.reason)}`],
    };
  });

  return NextResponse.json({
    ecosystem,
    advisorySource: "GitHub Advisory Database (OSV fallback)",
    results,
  });
}
