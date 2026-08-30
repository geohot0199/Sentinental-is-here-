import { NextResponse } from "next/server";
import { httpRequest } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * TrueForge harness probe.
 *
 * The agent cockpit prefers a real harness (TRUEFORGE_URL, or one supplied
 * per-request from the vault). A harness running on the operator's machine is
 * probed through this server-side route so browser CORS never blocks the
 * attempt; when no harness answers, the cockpit falls back to the bundled
 * scripted model — same tools, same approval gate, zero spend.
 *
 * POST { url? }  → { reachable, detail, mode }
 */
export async function POST(request: Request) {
  let body: { url?: unknown } = {};
  try {
    body = (await request.json()) as { url?: unknown };
  } catch {
    body = {};
  }

  const candidate =
    typeof body.url === "string" && body.url.length > 0
      ? body.url
      : process.env.TRUEFORGE_URL ?? "http://127.0.0.1:8790";

  // Only http(s) harness URLs, please.
  if (!/^https?:\/\//i.test(candidate)) {
    return NextResponse.json({ reachable: false, mode: "demo", detail: "Harness URL must start with http:// or https://" });
  }

  // A short timeout: the probe must not hold the serverless function open.
  try {
    const result = await httpRequest(new URL("/health", candidate).toString(), {
      timeoutMs: 4_000,
      retries: 0,
    });
    return NextResponse.json({
      reachable: result.ok,
      mode: result.ok ? "harness" : "demo",
      url: candidate,
      status: result.status,
      detail: result.ok
        ? "TrueForge harness answered /health. The cockpit will drive it."
        : `Harness replied HTTP ${result.status}; falling back to the scripted model.`,
    });
  } catch (cause) {
    return NextResponse.json({
      reachable: false,
      mode: "demo",
      url: candidate,
      detail:
        cause instanceof Error && cause.message.length > 0
          ? `Harness unreachable (${cause.message}). Running the bundled scripted model — same tools, same gate, zero spend.`
          : "Harness unreachable. Running the bundled scripted model.",
    });
  }
}
