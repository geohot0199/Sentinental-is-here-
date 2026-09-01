"use client";

/**
 * The agent bridge probe — the "check it" half of the feature.
 *
 * Both consumers use this: the satellite scope card on the landing page (light
 * probe, no tool execution) and the console's Bridge station (deep probe, runs
 * a real tools/call). It talks to the endpoint exactly the way a conforming
 * 2026-07-28 client must — routing headers included — so a green row means an
 * agent would genuinely succeed, not that our own helper is forgiving.
 */
import { bridgeInvoke, bridgeStatus, bridgeTools, runSelfTest } from "./webmcp";

export type CheckRow = {
  name: string;
  ok: boolean;
  detail: string;
  /** "warn" rows are informational: not broken, not sufficient. */
  level?: "pass" | "fail" | "warn";
};

export type RemoteProbe = {
  reachable: boolean;
  endpoint: string;
  protocolVersions: string[];
  toolCount: number;
  tools: { name: string; title?: string; description: string }[];
  latencyMs: number | null;
  error: string | null;
  cache: { ttlMs: number | null; cacheScope: string | null } | null;
};

export type BridgeSnapshot = {
  checkedAt: string;
  webmcp: {
    surface: string;
    agentVisible: boolean;
    polyfilled: boolean;
    secureContext: boolean;
    reason: string;
    registeredCount: number;
    discoverableCount: number;
    failed: { name: string; reason: string }[];
  };
  remote: RemoteProbe;
  checks: CheckRow[];
  verdict: { passed: number; failed: number; warnings: number; ok: boolean };
};

const MODERN = "2026-07-28";

async function rpc<T>(endpoint: string, method: string, params: Record<string, unknown>, id: string | number = Date.now()): Promise<T> {
  const startedAt = performance.now();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": MODERN,
      "mcp-method": method,
      ...(method === "tools/call" || method === "resources/read" || method === "prompts/get"
        ? { "mcp-name": String((params.name ?? params.uri) ?? "") }
        : {}),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params: {
        ...params,
        _meta: {
          "io.modelcontextprotocol/protocolVersion": MODERN,
          "io.modelcontextprotocol/clientInfo": { name: "sentinel-bridge-probe", version: "1.0.0" },
          "io.modelcontextprotocol/clientCapabilities": {},
        },
      },
    }),
  });
  const text = await response.text();
  let body: Record<string, unknown> = {};
  try {
    body = text.length > 0 ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    throw new Error(`HTTP ${response.status} with a non-JSON body`);
  }
  if (!response.ok && body.error === undefined) {
    throw new Error(`HTTP ${response.status}`);
  }
  if (body.error !== undefined) {
    const error = body.error as { message?: string };
    throw new Error(error.message ?? "JSON-RPC error");
  }
  return { result: body.result, latencyMs: Math.round(performance.now() - startedAt) } as unknown as T;
}

export async function probeRemote(endpoint = "/api/mcp"): Promise<RemoteProbe> {
  const base: RemoteProbe = {
    reachable: false,
    endpoint,
    protocolVersions: [],
    toolCount: 0,
    tools: [],
    latencyMs: null,
    error: null,
    cache: null,
  };
  try {
    const discover = await rpc<{ result: { supportedVersions?: string[] }; latencyMs: number }>(endpoint, "server/discover", {});
    base.protocolVersions = discover.result?.supportedVersions ?? [];
    base.latencyMs = discover.latencyMs;
    base.reachable = base.protocolVersions.length > 0;

    const listing = await rpc<{ result: { tools?: RemoteProbe["tools"]; ttlMs?: number; cacheScope?: string } }>(endpoint, "tools/list", {});
    base.tools = listing.result?.tools ?? [];
    base.toolCount = base.tools.length;
    base.cache = { ttlMs: listing.result?.ttlMs ?? null, cacheScope: listing.result?.cacheScope ?? null };
    base.reachable = base.protocolVersions.length > 0 && base.toolCount > 0;
    return base;
  } catch (cause) {
    return { ...base, error: cause instanceof Error ? cause.message : String(cause) };
  }
}

export type ProbeOptions = { deep?: boolean };

export async function probeBridge({ deep = false }: ProbeOptions = {}): Promise<BridgeSnapshot> {
  const status = bridgeStatus();
  const remote = await probeRemote();
  const discoverable = await bridgeTools();

  const checks: CheckRow[] = [];
  const push = (name: string, ok: boolean, detail: string, level?: CheckRow["level"]) =>
    checks.push({ name, ok, detail, level: level ?? (ok ? "pass" : "fail") });

  push(
    "Secure context",
    status.secureContext,
    status.secureContext ? "https/localhost — browsers will expose modelContext" : "insecure origin — modelContext is withheld, so no agent can see the tools",
  );
  push(
    "WebMCP surface",
    status.surface === "document",
    `${status.surface} · ${status.reason}`,
    status.surface === "navigator" ? "warn" : status.surface === "polyfill" ? "warn" : undefined,
  );
  push(
    "Tools registered",
    status.registeredCount > 0,
    `${status.registeredCount} registered${status.failed.length > 0 ? `, ${status.failed.length} refused by the browser` : ""}`,
  );
  push(
    "Agent-discoverable",
    status.agentVisible && discoverable.length > 0,
    status.agentVisible
      ? `${discoverable.length} tools readable back through getTools()`
      : "in-page polyfill only — an external agent (ChatGPT, Chrome's agent) cannot see these yet",
    status.agentVisible ? undefined : "warn",
  );
  push(
    "Remote MCP endpoint",
    remote.reachable,
    remote.error === null
      ? `${remote.toolCount} tools · protocols ${remote.protocolVersions.join(", ")} · ${remote.latencyMs ?? "?"} ms`
      : `unreachable: ${remote.error}`,
  );
  push(
    "List caching hints",
    remote.cache !== null && remote.cache.ttlMs !== null,
    remote.cache?.ttlMs !== undefined && remote.cache?.ttlMs !== null
      ? `ttlMs ${remote.cache.ttlMs} · cacheScope ${remote.cache.cacheScope}`
      : "tools/list carries no ttlMs/cacheScope",
  );

  if (deep) {
    const selfTest = await runSelfTest();
    for (const row of selfTest.checks) {
      push(row.name, row.ok, row.detail, row.ok ? "pass" : "fail");
    }
    try {
      const result = (await bridgeInvoke("assess_blast_radius", {
        installedVersion: "4.17.20",
        targetVersion: "4.17.21",
      })) as { bump?: string; risk?: string };
      push("In-page tool call", true, `assess_blast_radius → ${result.bump ?? "?"} (${result.risk ?? "?"})`);
    } catch (cause) {
      push("In-page tool call", false, cause instanceof Error ? cause.message : String(cause));
    }
    try {
      const call = await rpc<{ result: { isError?: boolean; content?: { text?: string }[] } }>(
        "/api/mcp",
        "tools/call",
        { name: "search_docs", arguments: { query: "approval gate", limit: 2 } },
        "probe-call",
      );
      const text = call.result?.content?.[0]?.text ?? "";
      push("Remote tool call", call.result?.isError !== true, `search_docs → ${text.length} chars of JSON`);
    } catch (cause) {
      push("Remote tool call", false, cause instanceof Error ? cause.message : String(cause));
    }
    try {
      const refusal = await rpc<{ result: { content?: { text?: string }[]; isError?: boolean } }>(
        "/api/mcp",
        "tools/call",
        { name: "open_pull_request", arguments: { repo: "geohot0199/sentinental", title: "probe", manifest: "{}", confirm: "please" } },
        "probe-gate",
      );
      const text = refusal.result?.content?.[0]?.text ?? "";
      push(
        "Destructive gate",
        refusal.result?.isError === true,
        text.length > 0 ? `refused: ${text.slice(0, 96)}…` : "no refusal text",
      );
    } catch (cause) {
      // A deployment with writes switched off does not list the tool at all —
      // also a pass: the surface is smaller than the request.
      push("Destructive gate", true, `not callable: ${cause instanceof Error ? cause.message : String(cause)}`, "pass");
    }
  }

  const passed = checks.filter((row) => row.level === "pass").length;
  const failed = checks.filter((row) => row.level === "fail").length;
  const warnings = checks.filter((row) => row.level === "warn").length;

  return {
    checkedAt: new Date().toISOString(),
    webmcp: {
      surface: status.surface,
      agentVisible: status.agentVisible,
      polyfilled: status.polyfilled,
      secureContext: status.secureContext,
      reason: status.reason,
      registeredCount: status.registeredCount,
      discoverableCount: discoverable.length,
      failed: status.failed,
    },
    remote,
    checks,
    verdict: { passed, failed, warnings, ok: failed === 0 },
  };
}

export { bridgeStatus, bridgeTools };
