#!/usr/bin/env node
/**
 * WebMCP conformance for the in-page model context: the behaviour the W3C spec
 * obliges a browser to provide, exercised headless against lib/webmcp-core.ts.
 *
 *   node scripts/webmcp-conformance.mjs
 *
 * Node strips the types from the imported .ts modules; nothing here touches the
 * network, and the doubles are plain objects — the real DOM is never modified.
 */
import assert from "node:assert/strict";
import { register } from "node:module";

// Node needs the bundler's extensionless resolution to load lib/webmcp.ts.
register("./ts-resolve-hook.mjs", import.meta.url);

const core = await import("../lib/webmcp-core.ts");
const {
  POLYFILL_MARKER,
  createPolyfillContext,
  installPolyfill,
  invokeTool,
  listTools,
  registerTools,
  resolveSurface,
  stringifyResult,
  validateInput,
  validateToolDefinition,
} = core;

const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, detail: (error?.message ?? String(error)).split("\n")[0] });
  }
}

const sample = {
  name: "assess_blast_radius",
  title: "Assess blast radius",
  description: "Classify the jump from the installed version to the safe version.",
  inputSchema: {
    type: "object",
    properties: {
      currentVersion: { type: "string", description: "Installed version" },
      safeVersion: { type: "string", description: "Version to move to" },
    },
    required: ["currentVersion", "safeVersion"],
  },
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  execute: async (input) => ({ bump: "patch", saw: input.currentVersion }),
};

/* ------------------------------------------------------- definition contract */

await check("validateToolDefinition accepts a spec-shaped tool", () => {
  assert.deepEqual(validateToolDefinition(sample), []);
  // An omitted schema is allowed and normalized to an open object; a broken one is not.
  assert.deepEqual(validateToolDefinition({ ...sample, inputSchema: undefined }), []);
  const context = createPolyfillContext("test");
  void context;
});

for (const [label, mutation] of [
  ["a non-object definition", null],
  ["an empty name", { name: "   " }],
  ["an empty description", { description: "" }],
  ["a malformed inputSchema", { inputSchema: "see docs" }],
  ["an inputSchema with the wrong type", { inputSchema: { type: "array" } }],
  ["inputSchema.properties that is not an object", { inputSchema: { type: "object", properties: "nope" } }],
  ["a non-object execute", { execute: "nope" }],
  ["a non-string name", { name: 42 }],
]) {
  await check(`validateToolDefinition rejects ${label}`, () => {
    const value = mutation === null ? null : { ...sample, ...mutation };
    assert.ok(validateToolDefinition(value).length > 0);
  });
}

/* -------------------------------------------------------------- the surface */

await check("installPolyfill fills a document that has no native surface", () => {
  const doc = {};
  const nav = {};
  assert.equal(installPolyfill(doc, nav), true);
  assert.equal(doc.modelContext[POLYFILL_MARKER], true);
  assert.equal(nav.modelContext, doc.modelContext, "the deprecated navigator alias must resolve to the same context");
});

await check("installPolyfill never clobbers a native surface", () => {
  const native = { registerTool: () => Promise.resolve(), getTools: () => [] };
  const doc = { modelContext: native };
  const nav = {};
  assert.equal(installPolyfill(doc, nav), false);
  assert.equal(doc.modelContext, native);
});

await check("resolveSurface order: document, then navigator, then nothing", () => {
  const native = { registerTool: () => Promise.resolve(), getTools: () => [] };
  assert.equal(resolveSurface({ modelContext: native }, {}, { allowPolyfill: false }).kind, "document");
  assert.equal(resolveSurface({}, { modelContext: native }, { allowPolyfill: false }).kind, "navigator");
  const none = resolveSurface({}, {}, { allowPolyfill: false });
  assert.equal(none.kind, "none");
  assert.equal(none.agentVisible, false);
  const polyfilled = resolveSurface({}, {});
  assert.equal(polyfilled.kind, "polyfill");
  assert.equal(polyfilled.agentVisible, false, "a polyfill must never be reported as agent-visible");
});

await check("resolveSurface recognises our own polyfill and refuses to call it native", () => {
  const doc = {};
  installPolyfill(doc, {});
  const surface = resolveSurface(doc, {});
  assert.equal(surface.kind, "polyfill");
  assert.equal(surface.polyfilled, true);
  assert.equal(surface.agentVisible, false);
});

/* --------------------------------------------------------- tool lifecycle */

await check("register, list and execute round-trip", async () => {
  const context = createPolyfillContext("test");
  await context.registerTool(sample);
  const listed = await listTools(context);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].name, "assess_blast_radius");
  assert.equal(listed[0].annotations.readOnlyHint, true, "annotations must survive registration");
  assert.equal(listed[0].destructive, false);

  const spoken = await context.executeTool("assess_blast_radius", { currentVersion: "4.17.20", safeVersion: "4.17.21" });
  assert.equal(typeof spoken, "string", "executeTool hands the agent a string, per the spec");
  assert.equal(JSON.parse(spoken).bump, "patch");

  const raw = await invokeTool(context, "assess_blast_radius", { currentVersion: "1", safeVersion: "2" });
  assert.deepEqual(raw, { bump: "patch", saw: "1" }, "callTool keeps the structure for in-page callers");
});

await check("duplicate registration rejects instead of overwriting", async () => {
  const context = createPolyfillContext("test");
  await context.registerTool(sample);
  await assert.rejects(() => context.registerTool({ ...sample, description: "second" }), /already registered/);
  assert.equal((await listTools(context)).length, 1);
  assert.equal((await listTools(context))[0].description, sample.description);
});

await check("an invalid definition rejects the registration promise", async () => {
  const context = createPolyfillContext("test");
  await assert.rejects(() => context.registerTool({ name: "broken" }), TypeError);
  assert.equal((await listTools(context)).length, 0);
});

await check("input is validated before execute runs", async () => {
  const context = createPolyfillContext("test");
  let ran = 0;
  await context.registerTool({ ...sample, execute: async () => (ran += 1, {}) });
  await assert.rejects(() => context.executeTool("assess_blast_radius", { currentVersion: "1.0.0" }), /safeVersion/);
  assert.equal(ran, 0, "a rejected call must never reach the tool");
  await assert.rejects(() => context.executeTool("assess_blast_radius", { currentVersion: "1", safeVersion: "2", junk: true }), /unknown property/);
  assert.equal(ran, 0);
  await assert.rejects(() => context.executeTool("no_such_tool", {}), /unknown tool/);
});

await check("AbortSignal retires the tool", async () => {
  const context = createPolyfillContext("test");
  const controller = new AbortController();
  await context.registerTool(sample, { signal: controller.signal });
  assert.equal((await listTools(context)).length, 1);
  controller.abort();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal((await listTools(context)).length, 0);
});

await check("a signal that is already aborted never registers", async () => {
  const context = createPolyfillContext("test");
  const controller = new AbortController();
  controller.abort();
  await context.registerTool(sample, { signal: controller.signal });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal((await listTools(context)).length, 0);
});

await check("toolchange reaches both listener styles", async () => {
  const context = createPolyfillContext("test");
  let handler = 0;
  let listener = 0;
  context.ontoolchange = () => (handler += 1);
  context.addEventListener("toolchange", () => (listener += 1));
  await context.registerTool(sample);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(handler, 1);
  assert.equal(listener, 1);
  context.clearContext();
  assert.equal((await listTools(context)).length, 0);
});

/* ------------------------------------------------------------ input schema */

await check("validateInput covers the declared type surface", () => {
  const schema = {
    type: "object",
    properties: {
      repo: { type: "string" },
      number: { type: "integer" },
      dry: { type: "boolean" },
      tags: { type: "array", items: { type: "string" } },
      mode: { type: "string", enum: ["a", "b"] },
      nested: { type: "object", properties: { deep: { type: "string" } } },
      either: { type: ["string", "null"] },
    },
    required: ["repo"],
  };
  assert.deepEqual(validateInput(schema, { repo: "a/b" }), []);
  assert.match(validateInput(schema, {}).join(";"), /required property "repo"/);
  assert.match(validateInput(schema, { repo: 3 }).join(";"), /must be a string/);
  assert.match(validateInput(schema, { repo: "a", dry: "yes" }).join(";"), /must be a boolean/);
  assert.match(validateInput(schema, { repo: "a", tags: "x" }).join(";"), /must be an array/);
  assert.match(validateInput(schema, { repo: "a", mode: "z" }).join(";"), /one of/);
  assert.deepEqual(validateInput(schema, { repo: "a", either: null }), []);
  assert.match(validateInput(schema, { repo: "a", junk: 1 }).join(";"), /unknown propert/);
  assert.match(validateInput(schema, "nope").join(";"), /must be an object/);
  assert.deepEqual(validateInput(undefined, { whatever: true }), [], "no schema means no gate");
});

await check("stringifyResult matches what an agent reads back", () => {
  assert.equal(stringifyResult({ a: 1 }), '{"a":1}');
  assert.equal(stringifyResult("already text"), "already text", "a string result is passed through unwrapped");
  assert.equal(stringifyResult(undefined), "", "nothing to say is an empty message, not the word undefined");
  assert.equal(stringifyResult([1, 2]), "[1,2]");
  assert.equal(stringifyResult(new Map([["a", 1]])), "{}", "unserializable values degrade, they do not throw");
});

/* --------------------------------------------------------------- the batch */

await check("registerTools reports per-tool outcomes rather than dying", async () => {
  const context = createPolyfillContext("test");
  const outcome = await registerTools(context, [
    sample,
    { ...sample },
    { name: "half_baked" },
  ]);
  assert.deepEqual(outcome.registered, ["assess_blast_radius"]);
  assert.equal(outcome.failed.length, 2, "duplicate + invalid both reported");
});

/* ------------------------------------------------- the shipped tool catalog */

await check("the catalog is a coherent tool contract", async () => {
  const catalog = await import("../lib/tool-catalog.ts");
  const { SENTINEL_TOOLS, SITE_TOOLS, allToolSpecs, toolSpec, toMcpTool, AGENT_INSTRUCTIONS } = catalog;
  const all = allToolSpecs();
  assert.equal(all.length, SENTINEL_TOOLS.length + SITE_TOOLS.length);
  assert.equal(new Set(all.map((tool) => tool.name)).size, all.length, "tool names must be unique");
  for (const spec of all) {
    assert.deepEqual(validateToolDefinition({ ...spec, execute: () => ({}) }), [], `${spec.name} must satisfy the WebMCP shape`);
    assert.ok(["server", "page", "both"].includes(spec.execution), `${spec.name} needs an execution surface`);
    assert.ok(spec.title.length > 2 && spec.description.length > 40, `${spec.name} needs a title and a real description`);
    const remote = toMcpTool(spec);
    assert.equal(typeof remote.name, "string");
    assert.equal(remote.inputSchema.type, "object");
  }
  assert.equal(toolSpec("open_pull_request").annotations.destructiveHint, true, "the write tools must be marked destructive");
  assert.equal(toolSpec("scan_dependencies").annotations.readOnlyHint, true);
  assert.match(AGENT_INSTRUCTIONS, /destructive/, "instructions must name the dangerous tools");
  assert.match(AGENT_INSTRUCTIONS, /refuse unless/i, "instructions must explain the kill switch");
  assert.ok(SITE_TOOLS.some((tool) => tool.execution === "page"), "at least one tool must stay browser-only");
});

await check("the page tools match the real API routes", async () => {
  const fs = await import("node:fs");
  const scans = fs.readFileSync("app/api/scans/route.ts", "utf8");
  const advisories = fs.readFileSync("app/api/advisories/route.ts", "utf8");
  const webmcp = fs.readFileSync("lib/webmcp.ts", "utf8");
  for (const field of ["manifest", "lockfile", "githubToken"]) {
    assert.ok(scans.includes(field), `/api/scans should still accept ${field}`);
    assert.ok(webmcp.includes(field), `the page tool should send ${field}`);
  }
  assert.ok(advisories.includes("packages") && /packages:/.test(webmcp), "advisory lookups post a packages array");
  assert.ok(!/stage:\s*"/.test(webmcp), "there is no server-side `stage` parameter — computing in-page is the point");
});


/* ===========================================================================
 * Phase 2 · boot lib/webmcp.ts itself against a stubbed DOM.
 *
 * The page half of the bridge, exercised without a browser: does bootWebMcp()
 * find a native surface and claim agent visibility, and does it fall back to
 * the polyfill and *refuse* to claim it? Each scenario re-imports the module
 * with a fresh cache key, because the bridge keeps boot state.
 */

function stubDom({ native }) {
  const listeners = [];
  const doc = {
    documentElement: { dataset: {} },
    addEventListener: (type, fn) => listeners.push([type, fn]),
    removeEventListener: () => {},
    dispatchEvent: () => true,
  };
  const nav = { userAgent: "node-conformance" };
  if (native) {
    const real = createPolyfillContext("native-stand-in");
    // A "native" browser context: identical shape, no marker of ours on it.
    const clean = { ...real };
    delete clean[POLYFILL_MARKER];
    doc.modelContext = clean;
  }
  const win = {
    isSecureContext: true,
    location: { origin: "https://sentinel.example" },
    addEventListener: (type, fn) => listeners.push([type, fn]),
    removeEventListener: () => {},
    dispatchEvent: (event) => (listeners.push([event?.type, event]), true),
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      key: () => null,
      length: 0,
    },
  };
  // Node 22 exposes `navigator` as a getter-only global, so define it.
  const define = (key, value) => Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  define("window", win);
  define("document", doc);
  define("navigator", nav);
  define("localStorage", win.localStorage);
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  };
  return { doc, nav, win, listeners };
}

async function scenario(label, options, run) {
  stubDom(options.dom);
  try {
    const mod = await import(`../lib/webmcp.ts?scenario=${label}`);
    await run(mod);
    results.push({ name: `boot · ${label}`, ok: true });
  } catch (error) {
    results.push({ name: `boot · ${label}`, ok: false, detail: (error?.message ?? String(error)).split("\n")[0] });
  }
}

await scenario("native document.modelContext", { dom: { native: true } }, async (mod) => {
  const status = await mod.bootWebMcp();
  assert.equal(status.surface, "document", "the canonical getter must win");
  assert.equal(status.polyfilled, false);
  assert.equal(status.agentVisible, true, "a native surface is what makes tools agent-visible");
  assert.ok(status.registeredCount >= 12, `expected the full page catalog, got ${status.registeredCount}`);
  assert.equal(status.failed.length, 0, `no tool may fail to register: ${JSON.stringify(status.failed)}`);
  assert.ok(status.registered.includes("scan_dependencies") && status.registered.includes("assess_blast_radius"));
  assert.ok(!status.registered.includes("open_pull_request"), "a destructive tool is never registered in a tab");
  assert.equal(document.documentElement.dataset.webmcp, "document", "the DOM hint must match reality");
  const handle = (globalThis.window ?? globalThis).SENTINEL_MCP;
  assert.ok(handle, "window.SENTINEL_MCP must be exposed for in-page agents");
  assert.equal(typeof handle.call, "function", "an agent should be able to invoke through the handle");
  assert.equal(typeof handle.selfTest, "function");
  assert.equal(typeof handle.status, "function");
  assert.match(handle.instructions, /destructive/);
  assert.ok((await handle.tools()).length >= 12, "the handle must publish the tool list");

  const tools = await mod.bridgeTools();
  assert.equal(tools.length, status.registeredCount);
  assert.ok(tools.every((tool) => typeof tool.description === "string" && tool.description.length > 20));

  // A registered tool must actually run, in-page, against the real libraries —
  // the same classifyBump() the console itself calls.
  const outcome = await mod.bridgeInvoke("assess_blast_radius", { installedVersion: "4.17.20", targetVersion: "4.17.21" });
  const value = typeof outcome === "string" ? JSON.parse(outcome) : outcome;
  assert.equal(value.bump, "patch");
  assert.equal(value.risk, "low");
  assert.match(value.recommendation, /mechanically safe/);

  const breaking = await mod.bridgeInvoke("assess_blast_radius", { installedVersion: "4.17.20", targetVersion: "5.0.0" });
  const breakingValue = typeof breaking === "string" ? JSON.parse(breaking) : breaking;
  assert.equal(breakingValue.bump, "major");
  assert.equal(breakingValue.risk, "high");

  // A bad argument must come back as a refusal, never as a thrown surprise.
  await assert.rejects(() => mod.bridgeInvoke("assess_blast_radius", { installedVersion: "1.0.0" }));

  const report = await mod.runSelfTest();
  assert.ok(report.checks.length >= 4, "the self test must report every row");
  assert.ok(report.checks.every((row) => typeof row.name === "string" && typeof row.ok === "boolean"), "each row is name + verdict + detail");
  assert.equal(report.ok, report.checks.every((row) => row.ok), "a failing row must fail the whole test");
  assert.ok(report.checks.some((row) => /surface|context/i.test(row.name)), "and name the surface it found");

  mod.teardownWebMcp();
  assert.equal(document.documentElement.dataset.webmcp, undefined, "teardown must clear the DOM hint");
});

await scenario("no browser support at all", { dom: { native: false } }, async (mod) => {
  const status = await mod.bootWebMcp();
  assert.equal(status.surface, "polyfill");
  assert.equal(status.polyfilled, true);
  assert.equal(status.agentVisible, false, "never claim agent visibility for a polyfill");
  assert.match(status.reason, /polyfill/i);
  assert.ok(status.registeredCount >= 12);
  assert.equal(document.documentElement.dataset.webmcp, "polyfill");
  assert.equal(navigator.modelContext, document.modelContext, "the navigator alias must resolve too");
  const probe = await mod.bridgeStatus();
  assert.equal(probe.agentVisible, false);
});

await scenario("only the deprecated navigator alias", { dom: { native: false } }, async (mod) => {
  const real = createPolyfillContext("navigator-stand-in");
  delete real[POLYFILL_MARKER];
  Object.defineProperty(globalThis.navigator, "modelContext", { value: real, configurable: true, writable: true });
  const status = await mod.bootWebMcp();
  assert.equal(status.surface, "navigator", "a pre-May-206-era Chromium build must still be found");
  assert.equal(status.agentVisible, true);
  assert.equal(status.polyfilled, false);
});

/* -------------------------------------------------------------------- report */

const failures = results.filter((row) => !row.ok);
console.log(`\n  WebMCP conformance · lib/webmcp-core.ts\n`);
for (const row of results) {
  console.log(`  ${row.ok ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} ${row.name}${row.detail ? `  \x1b[31m— ${row.detail}\x1b[0m` : ""}`);
}
console.log(`\n  ${results.length - failures.length}/${results.length} passed${failures.length > 0 ? ` · ${failures.length} FAILED` : ""}\n`);
process.exit(failures.length > 0 ? 1 : 0);
