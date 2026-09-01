/**
 * SENTINEL — remote MCP server (the wire half).
 *
 * Written as a pure `handleRpc()` function rather than a route handler so the
 * conformance suite can exercise the exact code the deployment runs, without a
 * browser, a framework or a network. `app/api/mcp/route.ts` is a thin adapter.
 *
 * Protocol: MCP 2026-07-28 "stateless Streamable HTTP".
 *   · no initialize handshake, no Mcp-Session-Id, no GET stream
 *   · every request carries version/identity in params._meta
 *   · Mcp-Method / Mcp-Name routing headers are required and must match the body
 *   · list results carry resultType, ttlMs and cacheScope
 * Legacy clients (2025-11-25 and earlier) are served too, because that is what
 * most deployed MCP clients still speak: an `initialize` handshake is answered
 * in the old shape, and requests without _meta are treated as the negotiated
 * legacy version rather than rejected.
 */
import { lookupAdvisories, type AdvisoryMatch } from "./advisories";
import { buildPatch, buildPlan, type PlanEntry } from "./triage";
import { classifyBump } from "./semverBridge";
import { scanManifest } from "./manifest";
import { GitHubClient, parseRepo, remediationBranchName } from "./github";
import { redactDeep } from "./redact";
import { PASSAGES, searchPassages } from "./docs-corpus";
import { AGENT_INSTRUCTIONS, SENTINEL_TOOLS, SITE_TOOLS, toMcpTool, type ToolSpec } from "./tool-catalog";

import { validateInput } from "./webmcp-core";
import { WEBMCP_TOOLS_CATALOG } from "./engines.js";

export { AGENT_INSTRUCTIONS };
export { PROTOCOL_SUPPORTED as SUPPORTED_PROTOCOL_VERSIONS };

export const SERVER_INFO = {
  name: "sentinel-web",
  title: "SENTINEL",
  version: "1.0.0",
  description: "Autonomous supply-chain CVE strike team — web console, agent bridge and OMNI-LAB.",
  websiteUrl: "https://github.com/geohot0199/sentinental",
};

export const MODERN_VERSION = "2026-07-28";
export const PROTOCOL_SUPPORTED = [MODERN_VERSION, "2025-11-25", "2025-06-18", "2025-03-26"];
const LIST_TTL_MS = 300_000;

/** Agent-facing tools: everything the server can execute. Page-only tools are
 *  deliberately absent, so an agent is never handed a tool that cannot run. */
export function serverToolSpecs(env: NodeJS.ProcessEnv = process.env): ToolSpec[] {
  const writesAllowed = env.SENTINEL_ALLOW_REMOTE_WRITES === "true";
  return [...SENTINEL_TOOLS, ...SITE_TOOLS].filter(
    (spec) => spec.execution !== "page" && (writesAllowed || !spec.annotations.destructiveHint),
  );
}

export function labToolSpecs(): ToolSpec[] {
  return WEBMCP_TOOLS_CATALOG.map((tool: {
    name: string;
    module: string;
    description: string;
    inputSchema: Record<string, unknown>;
  }) => ({
    name: tool.name,
    title: tool.name.replace(/_/g, " "),
    description: tool.description,
    inputSchema: tool.inputSchema as ToolSpec["inputSchema"],
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    execution: "both" as const,
    group: "labs" as const,
  }));
}

export function toolList(env: NodeJS.ProcessEnv = process.env) {
  const tools = [...serverToolSpecs(env), ...labToolSpecs()];
  // Deterministic order: the spec asks for it, and a stable list keeps the
  // client's prompt cache warm.
  return tools
    .slice()
    .sort((a, b) => groupRank(a.group) - groupRank(b.group) || a.name.localeCompare(b.name))
    .map(toMcpTool);
}

function groupRank(group: ToolSpec["group"]): number {
  return group === "sentinel" ? 0 : group === "site" ? 1 : 2;
}

/* ------------------------------------------------------------------ plumbing */

export type RpcContext = {
  url: string;
  method: string;
  headers: Record<string, string>;
  bodyText: string;
  env?: NodeJS.ProcessEnv;
};

export type RpcReply = {
  status: number;
  headers: Record<string, string>;
  body: string | null;
};

type JsonRpcId = string | number | null;

const JSONRPC = {
  parseError: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internalError: -32603,
  headerMismatch: -32020,
  unsupportedProtocolVersion: -32022,
} as const;

const BASE_HEADERS: Record<string, string> = {
  "content-type": "application/json",
  "cache-control": "no-store",
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, authorization, mcp-protocol-version, mcp-method, mcp-name, mcp-param-name, last-event-id",
  "access-control-allow-methods": "POST, GET, OPTIONS, DELETE",
  "access-control-expose-headers": "mcp-protocol-version, www-authenticate",
};

function reply(status: number, body: unknown, extra: Record<string, string> = {}): RpcReply {
  return {
    status,
    headers: { ...BASE_HEADERS, ...extra },
    body: body === null || body === undefined ? null : JSON.stringify(body),
  };
}

function errorReply(status: number, id: JsonRpcId, code: number, message: string, data?: unknown): RpcReply {
  return reply(status, { jsonrpc: "2.0", id, error: { code, message, ...(data === undefined ? {} : { data }) } });
}

function okReply(id: JsonRpcId, result: Record<string, unknown>, negotiated: string, extra: Record<string, string> = {}): RpcReply {
  return reply(
    200,
    {
      jsonrpc: "2.0",
      id,
      result: {
        // resultType is required from 2026-07-28; legacy clients ignore it.
        resultType: "complete",
        ...result,
        _meta: {
          ...(result._meta as Record<string, unknown> | undefined),
          "io.modelcontextprotocol/serverInfo": {
            name: SERVER_INFO.name,
            title: SERVER_INFO.title,
            version: SERVER_INFO.version,
          },
        },
      },
    },
    { "mcp-protocol-version": negotiated, ...extra },
  );
}

/** `=?base64?...?=` sentinel encoding used for header values that are not ASCII-safe. */
function decodeHeaderSentinel(value: string): string {
  const match = /^=\?base64\?(.*)\?=$/.exec(value);
  if (match === null) return value;
  try {
    return Buffer.from(match[1], "base64").toString("utf8");
  } catch {
    return value;
  }
}

const header = (ctx: RpcContext, name: string): string | null => {
  const value = ctx.headers[name.toLowerCase()];
  return typeof value === "string" && value.length > 0 ? value : null;
};

/** Origin allow-list: same-origin, no Origin (server-to-server), plus extras. */
export function originAllowed(ctx: RpcContext): boolean {
  const origin = header(ctx, "origin");
  if (origin === null) return true;
  const self = new URL(ctx.url).origin;
  if (origin === self || origin === "null") return true;
  const allow = (ctx.env?.SENTINEL_MCP_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  // Agent hosts that legitimately run this page inside their own UI.
  const defaults = [
    "https://chatgpt.com",
    "https://chat.openai.com",
    "https://claude.ai",
    "https://www.claude.ai",
    "https://mcp-remote.local",
  ];
  const patterns = [...defaults, ...allow];
  return patterns.some((pattern) => {
    if (pattern.includes("*")) {
      const rx = new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);
      return rx.test(origin);
    }
    return origin === pattern;
  });
}

export function authRequired(env: NodeJS.ProcessEnv): boolean {
  return typeof env.SENTINEL_MCP_TOKEN === "string" && env.SENTINEL_MCP_TOKEN.length > 0;
}

function tokenAcceptable(ctx: RpcContext, env: NodeJS.ProcessEnv): boolean {
  if (!authRequired(env)) return true;
  const authorization = header(ctx, "authorization") ?? "";
  const expected = env.SENTINEL_MCP_TOKEN ?? "";
  if (!/^bearer\s+/i.test(authorization)) return false;
  const supplied = authorization.replace(/^bearer\s+/i, "").trim();
  if (supplied.length === 0 || expected.length === 0) return false;
  // Constant-time-ish compare; token lengths are public anyway.
  if (supplied.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < supplied.length; i += 1) diff |= supplied.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

/* -------------------------------------------------------------------- the RPC */

export async function handleRpc(ctx: RpcContext): Promise<RpcReply> {
  const env = ctx.env ?? process.env;

  if (ctx.method !== "POST") {
    return errorReply(405, null, JSONRPC.invalidRequest, "The MCP endpoint accepts POST only. Use GET for the human-readable connection card.");
  }
  if (!originAllowed(ctx)) {
    return errorReply(403, null, JSONRPC.invalidRequest, "Origin is not allowed. Add it to SENTINEL_MCP_ALLOWED_ORIGINS if this is your own client.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(ctx.bodyText);
  } catch {
    return errorReply(400, null, JSONRPC.parseError, "Request body is not valid JSON.");
  }
  if (Array.isArray(parsed)) {
    return errorReply(400, null, JSONRPC.invalidRequest, "Batched JSON-RPC requests are not supported by this protocol revision.");
  }
  if (typeof parsed !== "object" || parsed === null) {
    return errorReply(400, null, JSONRPC.parseError, "Request body must be a JSON-RPC object.");
  }

  const request = parsed as {
    jsonrpc?: string;
    id?: JsonRpcId;
    method?: string;
    params?: Record<string, unknown>;
  };
  const id: JsonRpcId = request.id ?? null;
  const rpcMethod = typeof request.method === "string" ? request.method : "";
  const params = (request.params ?? {}) as Record<string, unknown>;

  if (request.jsonrpc !== "2.0" || rpcMethod.length === 0) {
    return errorReply(400, id, JSONRPC.invalidRequest, "Expected a JSON-RPC 2.0 request with a method.");
  }

  /* ---------------- version + era ---------------- */
  const meta = (params._meta ?? {}) as Record<string, unknown>;
  const metaVersion = typeof meta["io.modelcontextprotocol/protocolVersion"] === "string"
    ? (meta["io.modelcontextprotocol/protocolVersion"] as string)
    : null;
  const headerVersion = header(ctx, "mcp-protocol-version");
  const requestedVersion = metaVersion ?? headerVersion ?? (rpcMethod === "initialize" ? String(params.protocolVersion ?? "") : "");
  const isModern = metaVersion !== null || (headerVersion !== null && rpcMethod !== "initialize");

  if (requestedVersion.length > 0 && !PROTOCOL_SUPPORTED.includes(requestedVersion)) {
    // A recognized modern error, so legacy clients can tell "wrong version"
    // from "wrong era" and fall back correctly.
    return errorReply(400, id, JSONRPC.unsupportedProtocolVersion, "Unsupported protocol version", {
      supported: PROTOCOL_SUPPORTED,
      requested: requestedVersion,
    });
  }
  const negotiated = requestedVersion.length > 0 ? requestedVersion : PROTOCOL_SUPPORTED[PROTOCOL_SUPPORTED.length - 1];

  /* ---------------- notifications ----------------
   * A notification has no id and no response, so the routing headers are
   * optional — but if a client sends them they still have to agree, or a proxy
   * would be routing on a lie. */
  if (request.id === undefined) {
    const isNotification = rpcMethod.startsWith("notifications/");
    const announced = header(ctx, "mcp-method");
    if (announced !== null && announced !== rpcMethod) {
      return errorReply(400, null, JSONRPC.headerMismatch, `Header mismatch: Mcp-Method '${announced}' does not match body method '${rpcMethod}'.`);
    }
    if (isNotification) {
      return { status: 202, headers: { ...BASE_HEADERS, "content-type": "text/plain" }, body: null };
    }
    return errorReply(400, null, JSONRPC.methodNotFound, `Unknown notification '${rpcMethod}'.`);
  }

  /* ---------------- header/body agreement (required from 2026-07-28) ------ */
  if (negotiated === MODERN_VERSION) {
    const headerMethod = header(ctx, "mcp-method");
    if (headerMethod === null) {
      return errorReply(400, id, JSONRPC.headerMismatch, "Header mismatch: required Mcp-Method header is missing.");
    }
    if (headerMethod !== rpcMethod) {
      return errorReply(400, id, JSONRPC.headerMismatch, `Header mismatch: Mcp-Method '${headerMethod}' does not match body method '${rpcMethod}'.`);
    }
    // The name a proxy routes on: the tool for tools/call, the prompt for
    // prompts/get, and for resources/read either the resource's name or its
    // uri, since clients legitimately address a resource both ways.
    const targetName = ((): string | null => {
      if (rpcMethod === "tools/call") return String(params.name ?? "");
      if (rpcMethod === "prompts/get") return String(params.name ?? "");
      if (rpcMethod === "resources/read") {
        const uri = String(params.uri ?? "");
        const named = resourceByName(uri);
        // A client may route on the uri it is reading or on the resource's
        // declared name; both are accepted, an unrelated value is not.
        return named === null ? uri : `${uri}\u0000${named}`;
      }
      return null;
    })();
    if (targetName !== null) {
      const headerName = header(ctx, "mcp-name");
      if (headerName === null) {
        return errorReply(400, id, JSONRPC.headerMismatch, `Header mismatch: required Mcp-Name header is missing for '${rpcMethod}'.`);
      }
      const decoded = decodeHeaderSentinel(headerName);
      const accepted = targetName.split("\u0000");
      if (!accepted.includes(decoded)) {
        return errorReply(400, id, JSONRPC.headerMismatch, `Header mismatch: Mcp-Name '${decoded}' does not match body value '${accepted[0]}'.`);
      }
    }
    if (isModern && headerVersion !== null && metaVersion !== null && headerVersion !== metaVersion) {
      return errorReply(400, id, JSONRPC.headerMismatch, `Header mismatch: MCP-Protocol-Version '${headerVersion}' does not match _meta '${metaVersion}'.`);
    }
  }

  /* ---------------- auth (reads are public; calls are not, when configured) */
  const needsToken = rpcMethod === "tools/call" || rpcMethod === "prompts/get";
  if (needsToken && !tokenAcceptable(ctx, env)) {
    return reply(
      401,
      {
        jsonrpc: "2.0",
        id,
        error: {
          code: JSONRPC.invalidRequest,
          message: "This deployment requires a bearer token. Send 'Authorization: Bearer <SENTINEL_MCP_TOKEN>'.",
          data: { authMode: "bearer" },
        },
      },
      { "www-authenticate": 'Bearer realm="sentinel-mcp", error_description="missing or invalid bearer token"' },
    );
  }

  switch (rpcMethod) {
    /* ---------------------------- discovery ---------------------------- */
    case "server/discover": {
      return okReply(id, {
        supportedVersions: PROTOCOL_SUPPORTED,
        capabilities: {
          tools: { listChanged: false },
          resources: { listChanged: false },
          prompts: { listChanged: false },
          extensions: {},
        },
        serverInfo: SERVER_INFO,
        instructions: AGENT_INSTRUCTIONS,
        ttlMs: 3_600_000,
        cacheScope: "public",
      }, negotiated);
    }

    /* ---------------------- legacy handshake --------------------------- */
    case "initialize": {
      const clientVersion = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
      const version = PROTOCOL_SUPPORTED.includes(clientVersion) ? clientVersion : "2025-11-25";
      return reply(
        200,
        {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: version,
            capabilities: {
              tools: { listChanged: false },
              resources: { listChanged: false },
              prompts: { listChanged: false },
            },
            serverInfo: { name: SERVER_INFO.name, title: SERVER_INFO.title, version: SERVER_INFO.version },
            instructions: AGENT_INSTRUCTIONS,
          },
        },
        { "mcp-protocol-version": version },
      );
    }

    case "ping":
      return okReply(id, {}, negotiated);

    /* ------------------------------ tools ------------------------------ */
    case "tools/list": {
      return okReply(
        id,
        {
          tools: toolList(env),
          nextCursor: null,
          ttlMs: LIST_TTL_MS,
          cacheScope: "public",
        },
        negotiated,
      );
    }

    case "tools/call": {
      const name = typeof params.name === "string" ? params.name : "";
      if (name.length === 0) {
        return errorReply(400, id, JSONRPC.invalidParams, "tools/call requires params.name.");
      }
      return await callTool(name, params, ctx, id, negotiated, env);
    }

    /* --------------------------- resources ----------------------------- */
    case "resources/list": {
      return okReply(
        id,
        { resources: resourceEntries(), nextCursor: null, ttlMs: LIST_TTL_MS, cacheScope: "public" },
        negotiated,
      );
    }

    case "resources/templates/list": {
      return okReply(id, { resourceTemplates: [], nextCursor: null, ttlMs: LIST_TTL_MS, cacheScope: "public" }, negotiated);
    }

    case "resources/read": {
      const uri = typeof params.uri === "string" ? params.uri : "";
      const content = readResource(uri, env);
      if (content === null) {
        return errorReply(400, id, JSONRPC.invalidParams, `Unknown resource: ${uri}`);
      }
      return okReply(id, { contents: [content], ttlMs: LIST_TTL_MS, cacheScope: "public" }, negotiated);
    }

    /* ----------------------------- prompts ----------------------------- */
    case "prompts/list": {
      return okReply(
        id,
        {
          prompts: [
            {
              name: "triage_repository",
              title: "Triage a repository",
              description: "Run the SENTINEL stages against a public repository and stop at the pull request.",
              arguments: [
                { name: "repo", description: "owner/repo", required: true },
                { name: "branch", description: "Branch to read; defaults to the default branch", required: false },
              ],
            },
            {
              name: "explain_finding",
              title: "Explain a finding to a human",
              description: "Turn one advisory match into a short, honest write-up with the blast radius and the verification status.",
              arguments: [
                { name: "packageName", description: "npm package name", required: true },
                { name: "installedVersion", description: "Installed version", required: true },
              ],
            },
          ],
          nextCursor: null,
          ttlMs: LIST_TTL_MS,
          cacheScope: "public",
        },
        negotiated,
      );
    }

    case "prompts/get": {
      const name = typeof params.name === "string" ? params.name : "";
      const args = (params.arguments ?? {}) as Record<string, string>;
      const prompt = buildPrompt(name, args);
      if (prompt === null) {
        return errorReply(400, id, JSONRPC.invalidParams, `Unknown prompt: ${name}`);
      }
      return okReply(id, prompt, negotiated);
    }

    case "logging/setLevel":
    case "completion/complete":
      return errorReply(404, id, JSONRPC.methodNotFound, `Method '${rpcMethod}' is not implemented by this server.`);

    default:
      return errorReply(404, id, JSONRPC.methodNotFound, `Method '${rpcMethod}' is not implemented by this server.`);
  }
}

/* ------------------------------------------------------------ resource bodies */

function readResource(uri: string, env: NodeJS.ProcessEnv) {
  if (uri === "sentinel://tools") {
    return { uri, mimeType: "application/json", text: JSON.stringify({ tools: toolList(env), instructions: AGENT_INSTRUCTIONS }, null, 2) };
  }
  if (uri === "sentinel://status") {
    return { uri, mimeType: "application/json", text: JSON.stringify(projectStatus(env), null, 2) };
  }
  if (uri === "sentinel://docs") {
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(PASSAGES.map((p) => ({ uri: `sentinel://docs/${p.id}`, title: p.title, kind: p.kind })), null, 2),
    };
  }
  if (uri.startsWith("sentinel://docs/")) {
    const id = uri.slice("sentinel://docs/".length);
    const passage = PASSAGES.find((p) => p.id === id);
    if (passage === undefined) return null;
    return { uri, mimeType: "text/markdown", text: `# ${passage.title}\n\n${passage.text}\n` };
  }
  return null;
}

function buildPrompt(name: string, args: Record<string, string>) {
  if (name === "triage_repository") {
    const repo = args.repo ?? "owner/repo";
    const branch = args.branch ? ` on branch ${args.branch}` : "";
    return {
      description: "Triage a repository with the SENTINEL stages.",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Triage ${repo}${branch} for supply-chain CVEs.`,
              "",
              "1. fetch_repository_manifest to read package.json and the lockfile.",
              "2. scan_dependencies on that manifest text.",
              "3. lookup_advisories for each dependency, using the installed version.",
              "4. summarise_triage the matches, then assess_blast_radius for each entry.",
              "5. propose_patch and show the diff.",
              "6. STOP. Show the exact pull request title and body you would open and wait for the human to approve.",
              "   Do not call open_pull_request on your own initiative; it will refuse without their verbatim confirmation.",
              "Report any patch as UNVERIFIED unless a sandbox actually ran the test suite.",
            ].join("\n"),
          },
        },
      ],
    };
  }
  if (name === "explain_finding") {
    return {
      description: "Explain one advisory match in plain language.",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Explain the exposure of ${args.packageName ?? "a package"}@${args.installedVersion ?? "an unknown version"} in three sentences: what the advisory is, whether the installed version is genuinely in the affected range, and what the safe target version is. Say explicitly whether the fix was verified in a sandbox or is UNVERIFIED.`,
          },
        },
      ],
    };
  }
  return null;
}

/* ------------------------------------------------------------ tool execution */

async function callTool(
  name: string,
  params: Record<string, unknown>,
  ctx: RpcContext,
  id: JsonRpcId,
  negotiated: string,
  env: NodeJS.ProcessEnv,
): Promise<RpcReply> {
  const args = (params.arguments ?? {}) as Record<string, unknown>;
  const spec = [...SENTINEL_TOOLS, ...SITE_TOOLS].find((tool) => tool.name === name);
  const labTool = WEBMCP_TOOLS_CATALOG.find((tool: { name: string }) => tool.name === name);

  if (spec === undefined && labTool === undefined) {
    return errorReply(404, id, JSONRPC.methodNotFound, `Unknown tool: ${name}`);
  }

  if (spec !== undefined) {
    const problems = validateInput(spec.inputSchema, args);
    if (problems.length > 0) {
      return toolError(id, negotiated, `Invalid input for ${name}: ${problems.join("; ")}`, {
        expected: spec.inputSchema,
      });
    }
  }
  if (spec?.execution === "page") {
    return toolError(id, negotiated, `${name} is an in-page tool: it can only run in a browser tab with a registered WebMCP context.`);
  }

  try {
    const payload = spec !== undefined
      ? await executeSentinel(name, args, ctx, env)
      : await (labTool as { execute: (input: Record<string, unknown>) => unknown }).execute(args);

    const safe = redactDeep(payload);
    return okReply(
      id,
      {
        content: [{ type: "text", text: typeof safe === "string" ? safe : JSON.stringify(safe, null, 2) }],
        structuredContent: safe,
        isError: false,
      },
      negotiated,
    );
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return toolError(id, negotiated, `${name} failed: ${redactSafe(message)}`, {
      hint: hintFor(message),
    });
  }
}

function toolError(id: JsonRpcId, negotiated: string, text: string, structured?: unknown): RpcReply {
  return okReply(id, {
    content: [{ type: "text", text }],
    isError: true,
    ...(structured === undefined ? {} : { structuredContent: structured }),
  }, negotiated);
}

function redactSafe(value: string): string {
  return redactDeep(value) as string;
}

function hintFor(message: string): string {
  if (/not configured/i.test(message)) return "Set the named environment variable on the server, or add a key in the console's Keys station.";
  if (/kill switch/i.test(message)) return "Writes are refused by design. Set SENTINEL_ALLOW_REMOTE_WRITES=true only when a human has approved this exact change.";
  if (/confirmation/i.test(message)) return "Ask the human for the exact confirmation string named in the tool description. Never invent one.";
  if (/UNVERIFIED/i.test(message)) return "A Daytona sandbox key (DAYTONA_API_KEY) turns UNVERIFIED into a real install-and-test run.";
  if (/needs GITHUB_TOKEN/i.test(message)) return "This deployment is read-only by configuration. Supply a token server-side, or use the console's vault, then retry.";
  if (/fetch failed|ECONNREFUSED|ETIMEDOUT|ENOTFOUND/i.test(message)) return "The server could not reach GitHub from here. Check outbound network and GITHUB_TOKEN; nothing was written.";
  if (/rate limit|403|401/.test(message)) return "GitHub refused the credential. Check the token's scopes and that it can see this repository.";
  return "Read the tool's inputSchema with tools/list and retry with valid arguments.";
}

async function executeSentinel(name: string, args: Record<string, unknown>, ctx: RpcContext, env: NodeJS.ProcessEnv): Promise<unknown> {
  const str = (key: string): string => (typeof args[key] === "string" ? (args[key] as string) : "");

  switch (name) {
    case "get_project_status":
      return projectStatus(env);

    case "scan_dependencies": {
      const scan = scanManifest(str("manifest"), (args.lockfile as string) ?? null, (args.lockfileName as string) ?? null);
      return {
        ecosystem: scan.ecosystem,
        projectName: scan.projectName,
        dependencyCount: scan.dependencies.length,
        dependencies: scan.dependencies.map((dep) => ({
          name: dep.name,
          version: dep.version,
          declaredRange: dep.declaredRange,
          scope: dep.scope,
          // `resolved` is the honest flag: false means the version is a declared
          // range, not something a lockfile pinned, so advisory matching is a guess.
          resolvedFromLockfile: dep.resolved,
        })),
        warnings: scan.warnings,
      };
    }

    case "fetch_repository_manifest": {
      const ref = parseRepo(str("repo"));
      const client = new GitHubClient(env.GITHUB_TOKEN ?? null, false);
      const branch = str("branch") || null;
      const repoMeta = await client.getRepo(ref);
      const manifest = await client.getFile(ref, "package.json", branch ?? repoMeta.defaultBranch);
      if (manifest === null) {
        return { repo: `${ref.owner}/${ref.repo}`, manifest: null, warning: "No package.json at the repository root — this tool reads root manifests only." };
      }
      let lockfile: string | null = null;
      let lockfileName: string | null = null;
      for (const candidate of ["package-lock.json", "yarn.lock", "pnpm-lock.yaml"]) {
        const text = await client.getFile(ref, candidate, branch ?? repoMeta.defaultBranch);
        if (text !== null) {
          lockfile = text;
          lockfileName = candidate;
          break;
        }
      }
      return { repo: `${ref.owner}/${ref.repo}`, branch: branch ?? repoMeta.defaultBranch, manifest, lockfileName, lockfileBytes: lockfile?.length ?? 0, lockfile };
    }

    case "lookup_advisories": {
      const result = await lookupAdvisories(str("packageName"), str("installedVersion"), str("ecosystem") || "npm", env.GITHUB_TOKEN ?? null);
      return {
        packageName: str("packageName"),
        installedVersion: str("installedVersion"),
        source: result.source,
        warnings: result.warnings,
        matchCount: result.matches.length,
        matches: result.matches.slice(0, 12),
        truncated: result.matches.length > 12,
      };
    }

    case "assess_blast_radius": {
      const bump = classifyBump(str("installedVersion"), str("targetVersion"));
      const dependents = typeof args.dependents === "number" ? args.dependents : null;
      const risk = bump === "major" ? "high" : bump === "minor" ? "medium" : bump === "patch" ? "low" : "unknown";
      return {
        installedVersion: str("installedVersion"),
        targetVersion: str("targetVersion"),
        bump,
        risk,
        dependents,
        recommendation:
          risk === "high"
            ? "Breaking change — expect to touch call sites; do not apply blind."
            : risk === "medium"
              ? "Minor bump — usually safe, but run the tests."
              : risk === "low"
                ? "Patch bump — mechanically safe."
                : "Versions are not semver-comparable; assess by hand.",
      };
    }

    case "summarise_triage": {
      const matches = Array.isArray(args.matches) ? (args.matches as AdvisoryMatch[]) : [];
      return { plan: buildPlan(matches), entryCount: matches.length };
    }

    case "propose_patch": {
      const plan = Array.isArray(args.plan) ? (args.plan as PlanEntry[]) : [];
      if (plan.length === 0) {
        throw new Error("summarise_triage returned no plan entries; pass a non-empty plan built from real matches.");
      }
      const patch = buildPatch(str("manifest"), plan);
      return { ...patch, verification: "UNVERIFIED — no sandbox was run for this patch." };
    }

    case "open_pull_request": {
      assertWriteApproval(env, str("confirm"), "I approve opening a pull request", "open_pull_request");
      // Say so before the network does: "fetch failed" tells an agent nothing,
      // "GITHUB_TOKEN is not configured" tells it exactly what to fix.
      if (!env.GITHUB_TOKEN) {
        throw new Error("open_pull_request needs GITHUB_TOKEN on the server. Add it to the environment (or the console's Keys station) and retry — no write was attempted.");
      }
      const ref = parseRepo(str("repo"));
      const client = new GitHubClient(env.GITHUB_TOKEN ?? null, true);
      const repoMeta = await client.getRepo(ref);
      const branch = typeof args.branch === "string" && args.branch.length > 0 ? args.branch : remediationBranchName(str("title"));
      const manifest = str("manifest");
      await client.createBranch(ref, branch, repoMeta.defaultBranch);
      await client.putFile(ref, "package.json", manifest, `chore(deps): ${str("title")}`, branch);
      const pullRequest = await client.createPullRequest(ref, {
        title: str("title"),
        body: str("body") || "Opened by SENTINEL from the agent bridge, after explicit human approval.",
        head: branch,
        base: repoMeta.defaultBranch,
      });
      return { ...pullRequest, branch, verification: "UNVERIFIED — no sandbox run was attached to this change." };
    }

    case "merge_pull_request": {
      assertWriteApproval(env, str("confirm"), "I approve merging this pull request", "merge_pull_request");
      if (!env.GITHUB_TOKEN) {
        throw new Error("merge_pull_request needs GITHUB_TOKEN on the server. No merge was attempted.");
      }
      const ref = parseRepo(str("repo"));
      const number = Number(args.number);
      if (!Number.isInteger(number) || number <= 0) throw new Error("number must be a positive integer pull request number.");
      const client = new GitHubClient(env.GITHUB_TOKEN ?? null, true);
      return await client.mergePullRequest(ref, number);
    }

    case "list_tool_catalog": {
      const group = typeof args.group === "string" ? args.group : null;
      const specs = [...SENTINEL_TOOLS, ...SITE_TOOLS, ...labToolSpecs()].filter((spec) => group === null || spec.group === group);
      return {
        count: specs.length,
        endpoint: `${new URL(ctx.url).origin}/api/mcp`,
        protocolVersions: PROTOCOL_SUPPORTED,
        instructions: AGENT_INSTRUCTIONS,
        tools: specs.map((spec) => ({ ...toMcpTool(spec), execution: spec.execution })),
      };
    }

    case "search_docs":
      return {
        query: str("query"),
        hits: searchPassages(str("query"), typeof args.limit === "number" ? args.limit : 6),
      };

    case "fetch_docs": {
      const passage = PASSAGES.find((p) => p.id === str("id"));
      if (passage === undefined) {
        return { error: `no passage with id '${str("id")}'`, available: PASSAGES.map((p) => p.id) };
      }
      return { ...passage, text: passage.text };
    }

    default:
      throw new Error(`No server-side implementation for '${name}'.`);
  }
}

function assertWriteApproval(env: NodeJS.ProcessEnv, confirm: string, expected: string, tool: string): void {
  if (env.SENTINEL_ALLOW_REMOTE_WRITES !== "true") {
    throw new Error(
      `${tool} refused: the server-side kill switch is not enabled. Set SENTINEL_ALLOW_REMOTE_WRITES=true only when a human has approved this exact change.`,
    );
  }
  if (confirm !== expected) {
    throw new Error(
      `${tool} refused: 'confirm' must be exactly "${expected}". Denial is the default for anything else, including an empty value.`,
    );
  }
  if (typeof env.GITHUB_TOKEN !== "string" || env.GITHUB_TOKEN.length === 0) {
    throw new Error(`${tool} is not configured: no GITHUB_TOKEN on the server. Add one in the deployment's environment, or supply a token in the browser vault and use the console.`);
  }
}

function projectStatus(env: NodeJS.ProcessEnv) {
  const model = env.OPENAI_API_KEY ? "openai" : env.ANTHROPIC_API_KEY ? "anthropic" : env.GEMINI_API_KEY ? "google-gemini" : null;
  return {
    serverTime: new Date().toISOString(),
    model,
    github: typeof env.GITHUB_TOKEN === "string" && env.GITHUB_TOKEN.length > 0,
    sandbox: typeof env.DAYTONA_API_KEY === "string" && env.DAYTONA_API_KEY.length > 0,
    harnessUrl: env.TRUEFORGE_URL ?? null,
    remoteWrites: env.SENTINEL_ALLOW_REMOTE_WRITES === undefined ? true : env.SENTINEL_ALLOW_REMOTE_WRITES !== "false",
    // The bridge is stricter than the human UI: an agent only gets write tools
    // when the operator has opted in explicitly.
    bridgeWrites: env.SENTINEL_ALLOW_REMOTE_WRITES === "true",
    bridgeAuth: authRequired(env) ? "bearer" : "none",
    advisorySource: "GitHub Advisory Database (OSV fallback)",
    webmcpSurface: "document.modelContext (navigator.modelContext alias)",
    mcpEndpoint: "/api/mcp",
  };
}

/**
 * The declared resources. One list feeds `resources/list` and the Mcp-Name
 * check below, so a client can never be told a name the server would reject.
 */
export function resourceEntries(): { uri: string; name: string; title?: string; description: string; mimeType: string }[] {
  return [
    {
      uri: "sentinel://tools",
      name: "Tool contract",
      title: "Every tool, schema and annotation",
      description: "The same JSON the WebMCP surface registers, for agents that prefer a static read.",
      mimeType: "application/json",
    },
    {
      uri: "sentinel://status",
      name: "Capability report",
      title: "What this deployment can do",
      description: "Booleans and names only — never a key.",
      mimeType: "application/json",
    },
    {
      uri: "sentinel://docs",
      name: "Documentation index",
      title: "Documentation passages",
      description: "One uri per passage under sentinel://docs/<id>.",
      mimeType: "application/json",
    },
    ...PASSAGES.map((passage) => ({
      uri: `sentinel://docs/${passage.id}`,
      name: passage.title,
      description: passage.text.slice(0, 160),
      mimeType: "text/markdown" as const,
    })),
  ];
}

/** Resolve either addressing style of a resource to its declared name. */
function resourceByName(key: string): string | null {
  for (const entry of resourceEntries()) {
    if (entry.uri === key || entry.name === key) return entry.name;
  }
  return null;
}

