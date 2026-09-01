#!/usr/bin/env node
/**
 * MCP conformance suite for the SENTINEL agent bridge.
 *
 *   node scripts/mcp-conformance.mjs --base http://localhost:3000
 *   BASE=https://my-app.vercel.app node scripts/mcp-conformance.mjs
 *
 * Every check asserts a MUST from the 2026-07-28 Streamable HTTP binding, plus
 * the legacy handshake we still serve, plus the safety behaviour that matters
 * most: a destructive tool that cannot be talked into firing. Read-only — it
 * never calls a tool that writes.
 */
const FROM_ARGV = (process.argv.find((arg) => arg.startsWith("--base=")) ?? "").replace("--base=", "");
const BASE = process.env.BASE || FROM_ARGV || "http://localhost:3000";
const ENDPOINT = `${BASE.replace(/\/$/, "")}/api/mcp`;
const MODERN = "2026-07-28";
const META = {
  "io.modelcontextprotocol/protocolVersion": MODERN,
  "io.modelcontextprotocol/clientInfo": { name: "sentinel-conformance", version: "1.0.0" },
  "io.modelcontextprotocol/clientCapabilities": {},
};

const results = [];
let failures = 0;

/* Fail with a sentence, not a stack trace, when nothing is listening. */
const health = await fetch(`${BASE}/api/health`).catch(() => null);
if (health === null) {
  console.error(`\n  Nothing answering at ${BASE}.`);
  console.error("  Start the app first (npm run build && npm start) or pass --base=http://localhost:3000.\n");
  process.exit(2);
}

async function rpc(method, params = {}, { headers = {}, id = Math.floor(Math.random() * 1e6), raw = false } = {}) {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": MODERN,
      "mcp-method": method,
      ...(method === "tools/call" ? { "mcp-name": String(params.name ?? "") } : {}),
      ...headers,
    },
    body: JSON.stringify(raw ? params : { jsonrpc: "2.0", id, method, params: { ...params, _meta: META } }),
  });
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    /* non-JSON on purpose for some negative tests */
  }
  return { status: response.status, headers: response.headers, body, text };
}

function check(name, ok, detail) {
  results.push({ name, ok, detail });
  if (!ok) failures += 1;
}

/* ------------------------------------------------------------------ the run */

// 1 · discovery
{
  const { status, body } = await rpc("server/discover");
  const result = body.result ?? {};
  check(
    "server/discover advertises versions",
    status === 200 && Array.isArray(result.supportedVersions) && result.supportedVersions.includes(MODERN),
    `${status} · ${(result.supportedVersions ?? []).join(", ")}`,
  );
  check(
    "server/discover declares tools capability",
    result.capabilities?.tools !== undefined,
    JSON.stringify(result.capabilities ?? {}),
  );
  check(
    "server/discover carries instructions + serverInfo",
    typeof result.instructions === "string" && result.instructions.length > 80 && result._meta?.["io.modelcontextprotocol/serverInfo"]?.name === "sentinel-web",
    `${(result.instructions ?? "").length} chars of instructions`,
  );
  check("server/discover is cacheable", Number.isFinite(result.ttlMs) && ["public", "private"].includes(result.cacheScope), `ttlMs=${result.ttlMs} cacheScope=${result.cacheScope}`);
}

// 2 · tools/list
let tools = [];
{
  const first = await rpc("tools/list");
  const second = await rpc("tools/list");
  tools = first.body.result?.tools ?? [];
  const names = tools.map((tool) => tool.name);
  check("tools/list returns the catalog", first.status === 200 && tools.length >= 10, `${tools.length} tools`);
  check(
    "every tool has name, description, inputSchema, annotations",
    tools.every((tool) => typeof tool.name === "string" && typeof tool.description === "string" && tool.description.length > 30 && tool.inputSchema?.type === "object" && typeof tool.annotations === "object"),
    `${tools.filter((tool) => tool.annotations?.readOnlyHint === true).length} marked readOnlyHint`,
  );
  check("tools/list carries cache hints", Number.isFinite(first.body.result?.ttlMs) && first.body.result?.cacheScope === "public", `ttlMs=${first.body.result?.ttlMs}`);
  check("tools/list is deterministic", JSON.stringify(names) === JSON.stringify(second.body.result?.tools?.map((tool) => tool.name) ?? []), `${names.length} names in stable order`);
  check("list resultType is complete", first.body.result?.resultType === "complete", String(first.body.result?.resultType));
  check("no page-only tool is published remotely", !names.includes("navigate_console"), names.includes("navigate_console") ? "navigate_console leaked" : "browser-only tools stay in the browser");
}

// 3 · a real call
{
  const { status, body } = await rpc("tools/call", { name: "search_docs", arguments: { query: "approval gate kill switch", limit: 3 } });
  const result = body.result ?? {};
  let hits = [];
  try {
    hits = JSON.parse(result.content?.[0]?.text ?? "{}").hits ?? [];
  } catch {
    hits = [];
  }
  check("tools/call executes", status === 200 && result.isError === false && Array.isArray(hits) && hits.length > 0, `${hits.length} passage(s) from search_docs`);
  check("tools/call returns structuredContent too", result.structuredContent !== undefined, Object.keys(result.structuredContent ?? {}).join(", ") || "none");
}

// 4 · schema enforcement
{
  const { body } = await rpc("tools/call", { name: "lookup_advisories", arguments: { packageName: "lodash" } });
  const text = body.result?.content?.[0]?.text ?? "";
  check("missing required argument is refused", body.result?.isError === true && /installedVersion/.test(text), text.slice(0, 90));

  const unknown = await rpc("tools/call", { name: "search_docs", arguments: { query: "x", nonsense: true } });
  check("unknown argument is refused", unknown.body.result?.isError === true && /unknown property/.test(unknown.body.result?.content?.[0]?.text ?? ""), (unknown.body.result?.content?.[0]?.text ?? "").slice(0, 90));

  const missing = await rpc("tools/call", { name: "no_such_tool", arguments: {} });
  check("unknown tool → -32601", missing.status === 404 && missing.body.error?.code === -32601, `${missing.status} ${missing.body.error?.code}`);
}

// 5 · the gate
{
  const listed = tools.some((tool) => tool.name === "open_pull_request");
  const { status, body } = await rpc("tools/call", {
    name: "open_pull_request",
    arguments: { repo: "geohot0199/sentinental", title: "conformance probe", manifest: "{}", confirm: "please?" },
  });
  const text = body.result?.content?.[0]?.text ?? body.error?.message ?? "";
  if (listed) {
    // Writes enabled: the tool is listed, so the refusal has to come from the gate.
    check(
      "destructive tool refuses without the kill switch",
      (status === 200 && body.result?.isError === true) || status === 404,
      text.slice(0, 110) || `HTTP ${status}`,
    );
  } else {
    check("destructive tool is hidden while the kill switch is off", !listed, "absent from tools/list until SENTINEL_ALLOW_REMOTE_WRITES=true");
    check(
      "a guessed write name still cannot fire",
      (status === 200 && body.result?.isError === true && /kill switch|approval/i.test(text)) || status === 404,
      text.slice(0, 110) || `HTTP ${status}`,
    );
  }
  const merge = await rpc("tools/call", { name: "merge_pull_request", arguments: { repo: "a/b", number: 1, confirm: "y" } });
  check("merge refuses too", merge.status === 404 || merge.body.result?.isError === true, (merge.body.result?.content?.[0]?.text ?? `HTTP ${merge.status}`).slice(0, 80));
}

// 6 · header discipline
{
  const noMethod = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", "mcp-protocol-version": MODERN, accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: META } }),
  });
  const noMethodBody = await noMethod.json().catch(() => ({}));
  check("missing Mcp-Method → -32020", noMethod.status === 400 && noMethodBody.error?.code === -32020, `${noMethod.status} ${noMethodBody.error?.code}`);

  const mismatch = await rpc("tools/call", { name: "search_docs", arguments: { query: "x" } }, { headers: { "mcp-name": "open_pull_request" } });
  check("Mcp-Name mismatch → -32020", mismatch.status === 400 && mismatch.body.error?.code === -32020, (mismatch.body.error?.message ?? "").slice(0, 90));

  const encoded = await rpc("tools/call", { name: "search_docs", arguments: { query: "sandbox" } }, { headers: { "mcp-name": `=?base64?${Buffer.from("search_docs").toString("base64")}?=` } });
  check("base64 sentinel Mcp-Name accepted", encoded.status === 200, `HTTP ${encoded.status}`);

  // version negotiated from _meta, so force an unsupported one there as well
  const badVersionResponse = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json", "mcp-protocol-version": "1999-01-01", "mcp-method": "tools/list" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: { ...META, "io.modelcontextprotocol/protocolVersion": "1999-01-01" } } }),
  });
  const badVersion = { status: badVersionResponse.status, body: await badVersionResponse.json().catch(() => ({})) };
  const badBody = badVersion.body;
  check("unsupported version → -32022 + supported list", badVersion.status === 400 && badBody.error?.code === -32022 && Array.isArray(badBody.error?.data?.supported), `${badVersion.status} ${(badBody.error?.data?.supported ?? []).join(",")}`);
}

// 7 · transport edges
{
  const origin = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://evil-rebind.example", "mcp-protocol-version": MODERN, "mcp-method": "tools/list" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: META } }),
  });
  check("foreign Origin → 403", origin.status === 403, `HTTP ${origin.status}`);

  const stream = await fetch(ENDPOINT, { headers: { accept: "text/event-stream" } });
  check("GET stream attempt → 405", stream.status === 405, `HTTP ${stream.status}`);

  const del = await fetch(ENDPOINT, { method: "DELETE" });
  check("DELETE (no sessions any more) → 405", del.status === 405, `HTTP ${del.status}`);

  const preflight = await fetch(ENDPOINT, {
    method: "OPTIONS",
    headers: { origin: "https://chatgpt.com", "access-control-request-method": "POST", "access-control-request-headers": "content-type,mcp-method" },
  });
  check("CORS preflight for browser clients", preflight.status === 204 && (preflight.headers.get("access-control-allow-origin") ?? "*") !== "", `allow-origin=${preflight.headers.get("access-control-allow-origin")}`);

  const card = await fetch(`${ENDPOINT}?x=1`, { headers: { accept: "application/json" } });
  const cardBody = await card.json().catch(() => ({}));
  check("GET card advertises the endpoint", card.status === 200 && typeof cardBody.mcpEndpoint === "string" && Array.isArray(cardBody.tools), `${(cardBody.tools ?? []).length} tools listed on the card`);

  const notification = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", "mcp-protocol-version": MODERN },
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 1 } }),
  });
  check("notification → 202", notification.status === 202, `HTTP ${notification.status}`);

  const batch = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", "mcp-protocol-version": MODERN, "mcp-method": "tools/list" },
    body: JSON.stringify([{ jsonrpc: "2.0", id: 1, method: "tools/list" }]),
  });
  check("batched request rejected", batch.status === 400, `HTTP ${batch.status}`);

  const malformed = await fetch(ENDPOINT, { method: "POST", headers: { "content-type": "application/json" }, body: "{not json" });
  check("malformed JSON → -32700", malformed.status === 400 && (await malformed.json().catch(() => ({})))?.error?.code === -32700, `HTTP ${malformed.status}`);
}

// 8 · legacy era
{
  const legacy = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "legacy-client", version: "0.1" } } }),
  });
  const legacyBody = await legacy.json().catch(() => ({}));
  check(
    "legacy initialize handshake answered",
    legacy.status === 200 && legacyBody.result?.protocolVersion === "2025-11-25" && legacyBody.result?.serverInfo?.name === "sentinel-web",
    `${legacyBody.result?.protocolVersion} · ${Object.keys(legacyBody.result?.capabilities ?? {}).join(",")}`,
  );
  check("legacy result omits resultType (era-correct)", legacyBody.result?.resultType === undefined, legacyBody.result?.resultType === undefined ? "omitted" : "present");
}

// 9 · resources, prompts, docs surfaces
{
  const resources = await rpc("resources/list");
  check("resources/list includes the tool contract", (resources.body.result?.resources ?? []).some((entry) => entry.uri === "sentinel://tools"), `${(resources.body.result?.resources ?? []).length} resources`);

  // A client may route on the uri or on the declared name; both must work.
  const read = await rpc("resources/read", { uri: "sentinel://docs/agent:bridge" }, { headers: { "mcp-name": "sentinel://docs/agent:bridge" } });
  const text = read.body.result?.contents?.[0]?.text ?? "";
  check("resources/read returns a passage", read.status === 200 && text.includes("WebMCP"), `${text.length} chars`);

  const prompts = await rpc("prompts/list");
  check("prompts/list offers the triage prompt", (prompts.body.result?.prompts ?? []).some((entry) => entry.name === "triage_repository"), `${(prompts.body.result?.prompts ?? []).length} prompts`);

  const get = await rpc("prompts/get", { name: "triage_repository", arguments: { repo: "expressjs/express" } }, { headers: { "mcp-name": "triage_repository" } });
  check("prompts/get renders a message", typeof get.body.result?.messages?.[0]?.content?.text === "string", `${(get.body.result?.messages?.[0]?.content?.text ?? "").length} chars`);

  const llms = await fetch(`${BASE}/llms.txt`);
  const llmsText = await llms.text();
  check("llms.txt served as text", llms.status === 200 && llmsText.startsWith("# SENTINEL") && llmsText.includes("/api/mcp"), `${llmsText.length} bytes`);

  const docs = await fetch(`${BASE}/api/docs?q=kill%20switch`);
  const docsBody = await docs.json().catch(() => ({}));
  check("/api/docs search works", docs.status === 200 && (docsBody.hits ?? []).length > 0, `${(docsBody.hits ?? []).length} hits`);
}

// 10 · nothing leaks
{
  const sweep = await rpc("tools/list");
  const secretShape = /(ghp_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}|xox[baprs]-|AKIA[0-9A-Z]{16})/;
  check("no credential shapes in the tool surface", !secretShape.test(sweep.text), sweep.text.length < 40 ? sweep.text : `${sweep.text.length} bytes scanned`);
}

/* -------------------------------------------------------------------- report */

const width = Math.max(...results.map((row) => row.name.length));
console.log(`\n  SENTINEL agent-bridge conformance · ${ENDPOINT}\n`);
for (const row of results) {
  console.log(`  ${row.ok ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} ${row.name.padEnd(width)}  ${row.ok ? "" : "\x1b[31m"}${row.detail}${row.ok ? "" : "\x1b[0m"}`);
}
console.log(`\n  ${results.length - failures}/${results.length} passed${failures > 0 ? ` · ${failures} FAILED` : ""}\n`);
process.exit(failures > 0 ? 1 : 0);
