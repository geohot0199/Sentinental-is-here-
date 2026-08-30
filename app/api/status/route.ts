import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Capability report — the web-app twin of the console's `GET /api/status`.
 * Booleans and names only: never a key, never a URL with credentials.
 * The browser merges this with its local key vault to render the command deck.
 */
export async function GET() {
  const model =
    process.env.OPENAI_API_KEY ? "openai"
    : process.env.ANTHROPIC_API_KEY ? "anthropic"
    : process.env.GEMINI_API_KEY ? "google-gemini"
    : null;

  const envWrites = process.env.SENTINEL_ALLOW_REMOTE_WRITES;
  const notes: string[] = [];

  if (model === null) {
    notes.push("No server-side model key. The browser vault can supply one, or run the keyless demo.");
  }
  if (process.env.DAYTONA_API_KEY === undefined) {
    notes.push("No sandbox key on the server. Patch verification runs in demo mode and reports UNVERIFIED.");
  }
  if (process.env.GITHUB_TOKEN === undefined) {
    notes.push("No server-side GitHub token. Scans use public advisory data; add a token in the vault for private repos and pull requests.");
  }

  return NextResponse.json({
    serverTime: new Date().toISOString(),
    model,
    github: process.env.GITHUB_TOKEN !== undefined,
    sandbox: process.env.DAYTONA_API_KEY !== undefined,
    remoteWrites: envWrites === undefined ? true : envWrites !== "false",
    harnessUrl: process.env.TRUEFORGE_URL ?? null,
    // When the server kill switch is off it overrides anything the browser says.
    serverKillSwitch: envWrites === "false" ? "off" : "on",
    advisorySource: "GitHub Advisory Database (OSV fallback)",
    notes,
  });
}
