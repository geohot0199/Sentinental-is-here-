import { NextResponse } from "next/server";
import { httpJson } from "@/lib/http";

export const dynamic = "force-dynamic";

interface RegistryDoc {
  "dist-tags"?: Record<string, string>;
  versions?: Record<string, { deprecated?: string }>;
}

/**
 * npm registry lookup for the Plan stage — the highest fix version per
 * package, cross-checked against what the registry actually publishes.
 * GET /api/registry?package=lodash
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const name = url.searchParams.get("package") ?? "";
  if (name.length === 0 || name.length > 214 || !/^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(name)) {
    return NextResponse.json({ error: "Invalid package name." }, { status: 400 });
  }

  try {
    const doc = await httpJson<RegistryDoc>(`https://registry.npmjs.org/${encodeURIComponent(name).replace("%40", "@")}`, {
      timeoutMs: 12_000,
      retries: 1,
      headers: { accept: "application/vnd.npm.install-v1+json" },
    });
    const latest = doc["dist-tags"]?.latest ?? null;
    return NextResponse.json({ name, latest, distTags: doc["dist-tags"] ?? {} });
  } catch (cause) {
    return NextResponse.json(
      { error: `Registry lookup failed: ${cause instanceof Error ? cause.message : "unknown"}` },
      { status: 502 },
    );
  }
}
