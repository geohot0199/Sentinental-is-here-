import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daytona sandbox integration — the real verify stage.
 *
 * POST { action: "check",  daytonaKey }        → validate the key
 * POST { action: "verify", daytonaKey, manifest, projectName }
 *   → create sandbox (node image) → write patched package.json →
 *     npm install → npm test --if-present → destroy sandbox → real logs.
 *
 * Without a key the agent is instructed to report every patch as UNVERIFIED —
 * it never guesses that a fix works. Keys are used for this request only.
 */

const DAYTONA_API = "https://app.daytona.io/api";
const DAYTONA_TOOLBOX = "https://proxy.app.daytona.io/toolbox";

async function daytona(
  path: string,
  key: string,
  init: { method?: string; body?: unknown } = {},
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch(path.startsWith("http") ? path : `${DAYTONA_API}${path}`, {
      method: init.method ?? "GET",
      headers: {
        authorization: `Bearer ${key}`,
        ...(init.body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
    });
    let data: Record<string, unknown> = {};
    const text = await response.text();
    if (text.length > 0) {
      try {
        data = JSON.parse(text) as Record<string, unknown>;
      } catch {
        data = { raw: text.slice(0, 2000) };
      }
    }
    return { ok: response.ok, status: response.status, data };
  } catch (cause) {
    // Network failure, DNS, TLS, timeout — surface it as a typed failure the
    // UI can show, never an unhandled 500.
    const detail = cause instanceof Error ? cause.message : "network error";
    return { ok: false, status: 0, data: { error: `Daytona is unreachable: ${detail}` } };
  } finally {
    clearTimeout(timer);
  }
}

function b64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function POST(request: Request) {
  let body: { action?: unknown; daytonaKey?: unknown; manifest?: unknown; projectName?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action : "";
  const key = typeof body.daytonaKey === "string" && body.daytonaKey.length > 0 ? body.daytonaKey : null;
  if (key === null) {
    return NextResponse.json(
      { error: "Sandbox access is not configured.", remedy: "Add a DAYTONA_API_KEY in the key vault. Free tier: https://daytona.io" },
      { status: 400 },
    );
  }

  if (action === "check") {
    const result = await daytona("/user", key);
    if (result.ok) {
      const email = typeof result.data.email === "string" ? result.data.email : null;
      return NextResponse.json({ ok: true, mode: "daytona", detail: `Daytona key accepted${email ? ` for ${email}` : ""}.` });
    }
    const reason =
      typeof result.data.error === "string"
        ? result.data.error
        : `Daytona rejected the key (HTTP ${result.status}).`;
    return NextResponse.json({
      ok: false,
      detail: `${reason} Without a sandbox key, every patch is reported UNVERIFIED.`,
    });
  }

  if (action === "verify") {
    const manifest = typeof body.manifest === "string" ? body.manifest : null;
    if (manifest === null) {
      return NextResponse.json({ error: "manifest (patched package.json) is required." }, { status: 400 });
    }
    const projectName = typeof body.projectName === "string" && body.projectName.length > 0 ? body.projectName : "project";
    const log: string[] = [];

    // 1. Create the sandbox on a node image.
    const created = await daytona("/sandbox", key, { method: "POST", body: { image: "node:22" } });
    if (!created.ok) {
      return NextResponse.json({
        error: `Could not create a Daytona sandbox (HTTP ${created.status}).`,
        remedy: "Check the DAYTONA_API_KEY, or run the mission without a sandbox — the patch will be reported UNVERIFIED.",
      });
    }
    const sandboxId = typeof created.data.id === "string" ? created.data.id : null;
    if (sandboxId === null) {
      return NextResponse.json({ error: "Daytona did not return a sandbox id." }, { status: 502 });
    }
    log.push(`sandbox ${sandboxId.slice(0, 12)}… created on node:22`);

    const execute = async (command: string): Promise<{ exitCode: number; output: string }> => {
      const result = await daytona(
        `${DAYTONA_TOOLBOX}/${sandboxId}/process/execute`,
        key,
        { method: "POST", body: { command, cwd: "/home/daytona", timeout: 45 } },
      );
      const exitCode = typeof result.data.exitCode === "number" ? result.data.exitCode : result.ok ? 0 : 1;
      const output =
        typeof result.data.result === "string" ? result.data.result
        : typeof result.data.stdout === "string" ? result.data.stdout
        : result.ok ? "" : JSON.stringify(result.data).slice(0, 500);
      return { exitCode, output };
    };

    try {
      // 2. Write the patched package.json.
      const write = await execute(`printf '%s' '${b64(manifest)}' | base64 -d > /home/daytona/package.json && echo written`);
      if (write.exitCode !== 0) {
        return NextResponse.json({ ok: false, error: `Could not write package.json into the sandbox: ${write.output.slice(0, 300)}` });
      }
      log.push("patched package.json written to /home/daytona");

      // 3. Install dependencies (scripts ignored — the point is resolution, not side effects).
      log.push("npm install (this runs for real inside the sandbox)…");
      const install = await execute(
        "cd /home/daytona && npm install --no-audit --no-fund --ignore-scripts 2>&1 | tail -n 6",
      );
      log.push(...install.output.split("\n").filter((line) => line.trim().length > 0).slice(-6));
      if (install.exitCode !== 0) {
        return NextResponse.json({
          ok: true,
          testsPassed: false,
          log,
          summary: "npm install FAILED inside the sandbox — the patch does not resolve.",
        });
      }
      log.push("npm install exited clean");

      // 4. Run the test suite if one exists.
      const test = await execute(
        "cd /home/daytona && (npm test --if-present 2>&1 | tail -n 12) || true",
      );
      const testLines = test.output.split("\n").filter((line) => line.trim().length > 0);
      log.push(...testLines.slice(-12));

      const hasTestScript = /^"test"/m.test(manifest) || /"test"\s*:/.test(manifest);
      const passed = test.exitCode === 0 && (!hasTestScript || !/FAIL|failing|ERR/i.test(test.output));
      return NextResponse.json({
        ok: true,
        testsPassed: passed,
        log,
        summary: passed
          ? hasTestScript
            ? "install + test suite exited clean"
            : "install exited clean (no test script declared)"
          : "the test suite failed inside the sandbox",
      });
    } finally {
      // 5. Destroy the sandbox — never leave compute running on the operator's quota.
      await daytona(`/sandbox/${sandboxId}`, key, { method: "DELETE" }).catch(() => undefined);
    }
  }

  return NextResponse.json({ error: `Unknown action "${action}".` }, { status: 400 });
}
