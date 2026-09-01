"use client";

/**
 * SENTINEL — the WebMCP half of the agent bridge.
 *
 * Registers this site's tools on the browser's model context so an agent that
 * is *driving the page* (ChatGPT's built-in browser, Chrome's origin-trial
 * build, any WebMCP client) gets the same contract a remote MCP client gets
 * from `POST /api/mcp`. Registration is:
 *
 *   · on the canonical `document.modelContext`, falling back to the
 *     deprecated `navigator.modelContext` alias, and finally to a spec-shaped
 *     in-page polyfill — with the surface reported honestly, because a
 *     polyfill is NOT visible to an external agent;
 *   · through `registerTool(tool, { signal })`, the real spec signature, with
 *     `title`, `inputSchema` and `annotations`, so the harness can see which
 *     tools are read-only before it decides to trust anything;
 *   · idempotent, so React re-renders and StrictMode double-effects are safe.
 *
 * The page-side domain tools call this site's own API routes, so an agent gets
 * live advisory data without ever seeing a key.
 */
import {
  AGENT_INSTRUCTIONS,
  SENTINEL_TOOLS,
  SITE_TOOLS,
  type ToolSpec,
} from "./tool-catalog";
import {
  installPolyfill,
  invokeTool,
  listTools,
  registerTools,
  resolveSurface,
  stringifyResult,
  type ModelContextLike,
  type RegisteredTool,
  type SurfaceKind,
  type ToolDefinition,
} from "./webmcp-core";
import { WEBMCP_TOOLS_CATALOG } from "./engines.js";
import { scanManifest } from "./manifest";
import { buildPatch, buildPlan } from "./triage";
import { classifyBump } from "./semverBridge";
import { loadVault } from "./keys";

export { BreachLab, BioSynth, ChronoForensic, MetaLoop, ZkEscrow, WEBMCP_TOOLS_CATALOG } from "./engines.js";
export { AGENT_INSTRUCTIONS };

export type BridgeStatus = {
  surface: SurfaceKind;
  agentVisible: boolean;
  polyfilled: boolean;
  secureContext: boolean;
  reason: string;
  registered: string[];
  failed: { name: string; reason: string }[];
  registeredCount: number;
  catalogCount: number;
  lastBootMs: number;
};

let booted = false;
let status: BridgeStatus = {
  surface: "none",
  agentVisible: false,
  polyfilled: false,
  secureContext: false,
  reason: "not booted",
  registered: [],
  failed: [],
  registeredCount: 0,
  catalogCount: 0,
  lastBootMs: 0,
};
let context: ModelContextLike | null = null;
const abort = new AbortController();

/* ------------------------------------------------------ page-side executions */

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await response.text();
  let data: unknown = {};
  try {
    data = text.length > 0 ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${path} returned a non-JSON response (HTTP ${response.status}).`);
  }
  if (!response.ok) {
    const message = (data as { error?: string }).error ?? `HTTP ${response.status}`;
    throw new Error(message);
  }
  return data as T;
}

/**
 * The page implementations. Read-only work runs live against this site's own
 * routes or its pure engines — the browser never talks to GitHub or OSV
 * directly, so a token never leaves for a third-party origin. Anything
 * irreversible is not offered in a tab at all: an agent that wants a pull
 * request has to go through the human, in the console.
 */
function pageExecution(spec: ToolSpec): ToolDefinition["execute"] | null {
  switch (spec.name) {
    case "get_project_status":
      return async () => await api("/api/status");

    case "scan_dependencies":
      return async (input) => {
        const scan = scanManifest(
          String(input.manifest ?? ""),
          typeof input.lockfile === "string" && input.lockfile.length > 0 ? input.lockfile : null,
          typeof input.lockfileName === "string" ? input.lockfileName : null,
        );
        return {
          ecosystem: scan.ecosystem,
          projectName: scan.projectName,
          dependencyCount: scan.dependencies.length,
          dependencies: scan.dependencies.map((dep) => ({
            name: dep.name,
            declaredRange: dep.declaredRange,
            installedVersion: dep.version,
            environment: dep.scope,
            resolved: dep.resolved,
          })),
          warnings: scan.warnings,
        };
      };

    case "fetch_repository_manifest":
      return async (input) => {
        const vault = loadVault();
        const body = await api<Record<string, unknown>>("/api/github", {
          method: "POST",
          body: JSON.stringify({ action: "repo", repo: input.repo, token: vault.GITHUB_TOKEN ?? null }),
        });
        return {
          repo: body.repo,
          defaultBranch: body.defaultBranch,
          manifest: body.packageJson,
          lockfile: body.lockfile,
          lockfileName: body.lockfileName,
        };
      };

    case "lookup_advisories":
      return async (input) => {
        const vault = loadVault();
        const batch = await api<{ results?: Record<string, unknown>[] }>("/api/advisories", {
          method: "POST",
          body: JSON.stringify({
            packages: [{ name: String(input.packageName), version: String(input.installedVersion) }],
            ecosystem: input.ecosystem ?? "npm",
            githubToken: vault.GITHUB_TOKEN ?? null,
          }),
        });
        const first = batch.results?.[0] ?? {};
        const matches = Array.isArray(first.matches) ? (first.matches as Record<string, unknown>[]) : [];
        return { ...first, matchCount: matches.length, matches: matches.slice(0, 12) };
      };

    case "assess_blast_radius":
      return async (input) => {
        const installed = String(input.installedVersion ?? "");
        const target = String(input.targetVersion ?? "");
        const bump = classifyBump(installed, target);
        const risk = bump === "major" ? "high" : bump === "minor" ? "medium" : bump === "patch" ? "low" : "unknown";
        return {
          installedVersion: installed,
          targetVersion: target,
          bump,
          risk,
          dependents: typeof input.dependents === "number" ? input.dependents : null,
          recommendation:
            risk === "high"
              ? "Breaking change — expect to touch call sites; do not apply blind."
              : risk === "medium"
                ? "Minor bump — usually safe, but run the tests."
                : risk === "low"
                  ? "Patch bump — mechanically safe."
                  : "Versions are not semver-comparable; assess by hand.",
        };
      };

    case "summarise_triage":
      return async (input) => {
        const matches = Array.isArray(input.matches) ? (input.matches as Parameters<typeof buildPlan>[0]) : [];
        return { plan: buildPlan(matches), entryCount: matches.length };
      };

    case "propose_patch":
      return async (input) => {
        const plan = Array.isArray(input.plan) ? (input.plan as Parameters<typeof buildPatch>[1]) : [];
        if (plan.length === 0) {
          throw new Error("plan must not be empty — run summarise_triage first.");
        }
        return { ...buildPatch(String(input.manifest ?? ""), plan), verification: "UNVERIFIED — no sandbox was run for this patch." };
      };

    case "list_tool_catalog":
      return async (input) => {
        const group = typeof input.group === "string" ? input.group : null;
        const tools = [...SENTINEL_TOOLS, ...SITE_TOOLS, ...WEBMCP_TOOLS_CATALOG].filter(
          (tool) => group === null || ("module" in tool ? tool.module === group : (tool as ToolSpec).group === group),
        );
        return {
          count: tools.length,
          surface: status.surface,
          agentVisible: status.agentVisible,
          instructions: AGENT_INSTRUCTIONS,
          remote: { endpoint: `${window.location.origin}/api/mcp`, transport: "Streamable HTTP" },
          tools: tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            annotations: "annotations" in tool ? (tool as ToolSpec).annotations : { readOnlyHint: true },
          })),
        };
      };

    case "search_docs":
      return async (input) =>
        await api(`/api/docs?q=${encodeURIComponent(String(input.query ?? ""))}&limit=${encodeURIComponent(String(input.limit ?? 6))}`);

    case "fetch_docs":
      return async (input) => await api(`/api/docs?id=${encodeURIComponent(String(input.id ?? ""))}`);

    case "navigate_console":
      return async (input) => {
        const station = String(input.station ?? "deck");
        window.dispatchEvent(new CustomEvent("sentinel:navigate-station", { detail: { station } }));
        return { ok: true, station };
      };

    default:
      return null;
  }
}

/* ------------------------------------------------------------------ the boot */

function buildDefinitions(): ToolDefinition[] {
  const lab: ToolDefinition[] = WEBMCP_TOOLS_CATALOG.map(
    (tool: { name: string; description: string; inputSchema: Record<string, unknown>; execute: ToolDefinition["execute"] }) => ({
      name: tool.name,
      title: tool.name.replace(/_/g, " "),
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
      execute: tool.execute,
    }),
  );

  const site: ToolDefinition[] = [...SENTINEL_TOOLS, ...SITE_TOOLS]
    // Destructive tools are never registered in a tab. The gate is a human.
    .filter((spec) => spec.annotations.destructiveHint !== true && spec.execution !== "server")
    .map((spec) => {
      const execute = pageExecution(spec);
      return execute === null
        ? null
        : ({
            name: spec.name,
            title: spec.title,
            description: spec.description,
            inputSchema: spec.inputSchema,
            annotations: { ...spec.annotations, untrustedContentHint: true },
            execute,
          } as ToolDefinition);
    })
    .filter((tool): tool is ToolDefinition => tool !== null);

  return [...site, ...lab];
}

/**
 * Boot the bridge. Safe to call repeatedly; only the first call registers.
 * `registerAllWebMCPTools` from the previous implementation stayed for
 * compatibility with the Labs console.
 */
export async function bootWebMcp(): Promise<BridgeStatus> {
  if (booted) return status;
  const startedAt = performance.now();
  const doc = document as unknown as Record<string, unknown>;
  const nav = navigator as unknown as Record<string, unknown>;

  // Probe first: once a polyfill is installed we could no longer tell a real
  // browser surface from our own, and that distinction is the whole report.
  const surface = resolveSurface(doc, nav, { allowPolyfill: false });
  const polyfilled = surface.context === null ? installPolyfill(doc, nav) : false;
  context = surface.context ?? (doc.modelContext as ModelContextLike | undefined ?? null);

  const result = await registerTools(context as ModelContextLike, buildDefinitions(), { signal: abort.signal });

  status = {
    surface: polyfilled ? "polyfill" : surface.kind === "none" ? "none" : surface.kind,
    agentVisible: !polyfilled && surface.agentVisible,
    polyfilled,
    secureContext: window.isSecureContext,
    reason: polyfilled
      ? "no native modelContext in this browser — tools are registered on the in-page polyfill"
      : surface.reason,
    registered: result.registered,
    failed: result.failed,
    registeredCount: result.registered.length,
    catalogCount: WEBMCP_TOOLS_CATALOG.length,
    lastBootMs: Math.round(performance.now() - startedAt),
  };
  booted = true;

  // A machine-readable clue on the root element, for agents that read the DOM
  // before they read the model context, and for the console chip.
  document.documentElement.dataset.webmcp = status.surface;
  document.documentElement.dataset.webmcpTools = String(status.registeredCount);

  // Boot and handle go together: anything that can reach the bridge from the
  // console can reach it from an in-page agent, with no extra wiring.
  exposeBridgeHandle();

  return status;
}

/** Synchronous snapshot for components that render before the async boot lands. */
export function bridgeStatus(): BridgeStatus {
  return status;
}

export function bridgeContext(): ModelContextLike | null {
  return context;
}

export async function bridgeTools(): Promise<RegisteredTool[]> {
  return await listTools(context);
}

export async function bridgeInvoke(name: string, input: Record<string, unknown> = {}): Promise<unknown> {
  return await invokeTool(context, name, input);
}

/** Tear down every registration (AbortController → the spec's own mechanism). */
export function teardownWebMcp(): void {
  abort.abort();
  booted = false;
  context = null;
  status = { ...status, registered: [], registeredCount: 0, reason: "torn down" };
  delete document.documentElement.dataset.webmcp;
}

/* ------------------------------------------------------------- debug handle */

declare global {
  interface Window {
    SENTINEL_MCP?: {
      status: () => BridgeStatus;
      tools: () => Promise<RegisteredTool[]>;
      call: (name: string, args?: Record<string, unknown>) => Promise<unknown>;
      /** Round-trip check an agent or a human can run from the console. */
      selfTest: () => Promise<{ ok: boolean; checks: { name: string; ok: boolean; detail: string }[] }>;
      instructions: string;
      stringify: typeof stringifyResult;
    };
  }
}

export function exposeBridgeHandle(): void {
  if (typeof window === "undefined") return;
  // `window` in a browser, `globalThis` in a headless harness: same handle, so
  // the conformance script can drive the page bridge without a DOM.
  const host = (typeof window === "undefined" ? globalThis : window) as { SENTINEL_MCP?: unknown };
  host.SENTINEL_MCP = {
    status: bridgeStatus,
    tools: bridgeTools,
    call: bridgeInvoke,
    instructions: AGENT_INSTRUCTIONS,
    stringify: stringifyResult,
    selfTest: runSelfTest,
  };
}

/**
 * The self-test the Bridge station runs. Everything is asserted through the
 * model context itself — not against our own map — so a green check means an
 * agent would really see these tools.
 */
export async function runSelfTest(): Promise<{ ok: boolean; checks: { name: string; ok: boolean; detail: string }[] }> {
  const checks: { name: string; ok: boolean; detail: string }[] = [];
  const add = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });

  add("secure context", status.secureContext, window.isSecureContext ? "https or localhost — WebMCP is allowed" : "insecure context: browsers withhold modelContext");
  add("native surface", status.surface !== "polyfill" && status.surface !== "none", `${status.surface}: ${status.reason}`);

  const tools = await listTools(context);
  add("tools discoverable", tools.length > 0, `${tools.length} tool(s) readable through getTools()`);
  add("catalog registered", status.registeredCount > 0, `${status.registeredCount}/${SENTINEL_TOOLS.length + SITE_TOOLS.length + WEBMCP_TOOLS_CATALOG.length} registered${status.failed.length > 0 ? `, ${status.failed.length} refused` : ""}`);

  const annotated = tools.filter((tool) => typeof tool.description === "string" && tool.description.length > 0 && tool.inputSchema !== undefined);
  add("schemas complete", annotated.length === tools.length && tools.length > 0, `${annotated.length}/${tools.length} with description + inputSchema`);

  try {
    const result = await bridgeInvoke("biosynth_load_pdb_structure", {});
    const text = typeof result === "string" ? result : stringifyResult(result);
    add("round trip", text.length > 0, "biosynth_load_pdb_structure returned a payload through the model context");
  } catch (cause) {
    add("round trip", false, cause instanceof Error ? cause.message : String(cause));
  }

  try {
    await bridgeInvoke("biosynth_mutate_residue", { nonsenseArgument: 1 });
    add("input validation", false, "an unknown argument was accepted — the schema is not being enforced");
  } catch {
    add("input validation", true, "unknown arguments are rejected before execute runs");
  }

  try {
    await bridgeInvoke("open_pull_request", { repo: "x/y", title: "t", manifest: "{}", confirm: "yes" });
    add("destructive tools absent", false, "a write tool was callable from the page — it must not be registered there");
  } catch {
    add("destructive tools absent", true, "no irreversible tool is callable from a tab");
  }

  try {
    const response = await fetch("/api/mcp", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "server/discover", params: { _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28" } } }) });
    const body = (await response.json()) as { result?: { supportedVersions?: string[] } };
    const versions = body.result?.supportedVersions ?? [];
    add("remote bridge reachable", response.ok && versions.length > 0, `POST /api/mcp → ${versions.join(", ") || "no versions"}`);
  } catch (cause) {
    add("remote bridge reachable", false, cause instanceof Error ? cause.message : String(cause));
  }

  return { ok: checks.every((check) => check.ok), checks };
}

/* --------------------------------------------------- compatibility surface */

/**
 * Kept for the OMNI-LAB console, which predates the bridge rewrite: the same
 * catalogue, the same invocation path (always through the model context, never
 * around it), plus status getters for the chips.
 */
export const webmcp = {
  boot: bootWebMcp,
  status: bridgeStatus,
  get polyfilled(): boolean {
    return status.polyfilled;
  },
  get surface(): SurfaceKind {
    return status.surface;
  },
  get agentVisible(): boolean {
    return status.agentVisible;
  },
  get registeredCount(): number {
    return status.registeredCount;
  },
  get toolNames(): string[] {
    return status.registered;
  },
  get catalog() {
    return WEBMCP_TOOLS_CATALOG;
  },
  /** Invoke a registered tool by name; always resolves through modelContext. */
  invoke: async (name: string, input: unknown) => await bridgeInvoke(name, (input ?? {}) as Record<string, unknown>),
  byModule: (module: string) => WEBMCP_TOOLS_CATALOG.filter((tool: { module: string }) => tool.module === module),
};
