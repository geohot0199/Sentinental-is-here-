/**
 * SENTINEL — the tool contract, in one file.
 *
 * The same definitions are served three ways, which is the whole point of the
 * bridge: an agent reading `document.modelContext` in a ChatGPT tab, an agent
 * reading `tools/list` from a remote MCP client, and the human on the docs page
 * all see identical names, descriptions, schemas and annotations.
 *
 * Nothing here executes: `execution` records *where* a tool can run, and the
 * server (`lib/mcp-server.ts`) and the page (`lib/webmcp.ts`) each bind their
 * own implementation to the same contract.
 */
import type { JsonSchema, ToolAnnotations } from "./webmcp-core";

export type ToolSpec = {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  annotations: ToolAnnotations;
  /** "server" = only the bridge can run it; "page" = only in the tab; "both". */
  execution: "server" | "page" | "both";
  group: "sentinel" | "labs" | "site";
  example?: Record<string, unknown>;
};

const OBJECT = (properties: Record<string, unknown>, required: string[] = []): JsonSchema => ({
  type: "object",
  properties,
  ...(required.length > 0 ? { required } : {}),
  additionalProperties: false,
});

const READ: ToolAnnotations = { readOnlyHint: true, idempotentHint: true, openWorldHint: false };
const READ_WORLD: ToolAnnotations = { readOnlyHint: true, idempotentHint: true, openWorldHint: true };
const WRITE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
};

/**
 * The SENTINEL domain tools. Five read-only stages, then the two irreversible
 * ones — which stay listed (an agent must be able to *see* the gate) but refuse
 * unless the server-side kill switch is explicitly on and a bearer token is
 * presented.
 */
export const SENTINEL_TOOLS: ToolSpec[] = [
  {
    name: "get_project_status",
    title: "Project status",
    description:
      "Report what this deployment can actually do: whether a model key, a Daytona sandbox key, a GitHub token and a TrueForge harness are configured, and whether remote writes are permitted. Returns booleans and names only — never a key.",
    inputSchema: OBJECT({}),
    annotations: READ,
    execution: "both",
    group: "sentinel",
  },
  {
    name: "scan_dependencies",
    title: "Scan dependencies",
    description:
      "Parse a package.json plus an optional lockfile into a flat dependency list with the versions that are actually installed. Pure computation; no network.",
    inputSchema: OBJECT(
      {
        manifest: { type: "string", description: "The contents of package.json, verbatim." },
        lockfile: { type: "string", description: "Optional lockfile contents (package-lock.json v2/v3, yarn.lock or pnpm-lock.yaml)." },
        lockfileName: { type: "string", description: "Name of the lockfile that was supplied, for warnings." },
      },
      ["manifest"],
    ),
    annotations: READ,
    execution: "both",
    group: "sentinel",
    example: { manifest: '{ "dependencies": { "lodash": "^4.17.20" } }' },
  },
  {
    name: "fetch_repository_manifest",
    title: "Fetch a repository manifest",
    description:
      "Read package.json (and the lockfile if present) straight out of a public GitHub repository, so a scan needs no local checkout. Accepts 'owner/repo' or a github.com URL.",
    inputSchema: OBJECT(
      {
        repo: { type: "string", description: "'owner/repo' or https://github.com/owner/repo" },
        branch: { type: "string", description: "Optional branch; defaults to the repository default branch." },
      },
      ["repo"],
    ),
    annotations: READ_WORLD,
    execution: "both",
    group: "sentinel",
    example: { repo: "expressjs/express" },
  },
  {
    name: "lookup_advisories",
    title: "Look up advisories",
    description:
      "Query the GitHub Advisory Database for one package@version and keep only the advisories whose affected range actually contains that version. Falls back to OSV. This is the triage step that separates a real exposure from a page of noise.",
    inputSchema: OBJECT(
      {
        packageName: { type: "string", description: "npm package name, e.g. 'lodash' or '@adobe/css-tools'." },
        installedVersion: { type: "string", description: "Exact installed version, e.g. '4.17.20'." },
        ecosystem: { type: "string", description: "Ecosystem label; currently 'npm'." },
      },
      ["packageName", "installedVersion"],
    ),
    annotations: READ_WORLD,
    execution: "both",
    group: "sentinel",
    example: { packageName: "lodash", installedVersion: "4.17.20" },
  },
  {
    name: "assess_blast_radius",
    title: "Assess blast radius",
    description:
      "Classify an upgrade from installed to target version as patch/minor/major and say how risky it is to apply automatically.",
    inputSchema: OBJECT(
      {
        installedVersion: { type: "string", description: "Version currently installed." },
        targetVersion: { type: "string", description: "Version the fix would move to." },
        dependents: { type: "integer", description: "How many places import the package, if known." },
      },
      ["installedVersion", "targetVersion"],
    ),
    annotations: READ,
    execution: "both",
    group: "sentinel",
    example: { installedVersion: "4.17.20", targetVersion: "4.17.21" },
  },
  {
    name: "summarise_triage",
    title: "Summarise triage",
    description:
      "Collapse advisory matches into one safe target version per package — the highest fix version, so no advisory is left open — ordered worst first.",
    inputSchema: OBJECT(
      {
        matches: {
          type: "array",
          description: "Advisory matches as returned by lookup_advisories.",
          items: { type: "object" },
        },
      },
      ["matches"],
    ),
    annotations: READ,
    execution: "both",
    group: "sentinel",
  },
  {
    name: "propose_patch",
    title: "Propose patch",
    description:
      "Generate the patched package.json for a plan, preserving the project's existing range operators (^, ~, exact). Returns the new file content and a unified diff. Writes nothing anywhere.",
    inputSchema: OBJECT(
      {
        manifest: { type: "string", description: "The current package.json contents." },
        plan: { type: "array", description: "Plan entries as returned by summarise_triage.", items: { type: "object" } },
      },
      ["manifest", "plan"],
    ),
    annotations: READ,
    execution: "both",
    group: "sentinel",
  },
  {
    name: "open_pull_request",
    title: "Open pull request (approval-gated)",
    description:
      "Create a branch, commit the patched package.json and open a pull request. DESTRUCTIVE and irreversible in practice: this tool refuses unless the server-side kill switch SENTINEL_ALLOW_REMOTE_WRITES=true is set and the caller also passes confirm: 'I approve opening a pull request'. Do not call it unless the human asked for exactly that.",
    inputSchema: OBJECT(
      {
        repo: { type: "string", description: "'owner/repo'." },
        branch: { type: "string", description: "Optional branch name; one is generated when omitted." },
        title: { type: "string", description: "Pull request title." },
        body: { type: "string", description: "Pull request body (markdown)." },
        manifest: { type: "string", description: "The patched package.json to commit." },
        confirm: { type: "string", description: "Must be exactly 'I approve opening a pull request'." },
      },
      ["repo", "title", "manifest", "confirm"],
    ),
    annotations: WRITE,
    execution: "server",
    group: "sentinel",
  },
  {
    name: "merge_pull_request",
    title: "Merge pull request (approval-gated)",
    description:
      "Merge an open pull request. DESTRUCTIVE: this tool refuses unless the server-side kill switch is explicitly on and confirm is passed verbatim.",
    inputSchema: OBJECT(
      {
        repo: { type: "string", description: "'owner/repo'." },
        number: { type: "integer", description: "Pull request number." },
        confirm: { type: "string", description: "Must be exactly 'I approve merging this pull request'." },
      },
      ["repo", "number", "confirm"],
    ),
    annotations: WRITE,
    execution: "server",
    group: "sentinel",
  },
];

/** Tools about the site itself — what a browser-tab agent is actually for. */
export const SITE_TOOLS: ToolSpec[] = [
  {
    name: "list_tool_catalog",
    title: "List tool catalog",
    description:
      "Return every tool this site exposes to agents, with its JSON Schema and safety annotations, plus how to reach the same tools over remote MCP.",
    inputSchema: OBJECT({
      group: { type: "string", description: "Optional filter: 'sentinel', 'labs' or 'site'." },
    }),
    annotations: READ,
    execution: "both",
    group: "site",
  },
  {
    name: "search_docs",
    title: "Search docs",
    description:
      "Search SENTINEL's documentation corpus (landing sections, docs pages, the tool contract) and return matching passages with a pointer you can hand to fetch_docs.",
    inputSchema: OBJECT(
      { query: { type: "string", description: "Words to look for." }, limit: { type: "integer", description: "Maximum hits, 1–20 (default 6)." } },
      ["query"],
    ),
    annotations: READ,
    execution: "both",
    group: "site",
    example: { query: "approval gate kill switch" },
  },
  {
    name: "fetch_docs",
    title: "Fetch docs passage",
    description: "Fetch one documentation passage by id, as returned by search_docs.",
    inputSchema: OBJECT(
      { id: { type: "string", description: "Passage id, e.g. 'docs:approval'." } },
      ["id"],
    ),
    annotations: READ,
    execution: "both",
    group: "site",
  },
  {
    name: "navigate_console",
    title: "Navigate the console",
    description:
      "Move the human's view to a station in this site's console (deck, scan, agent, labs, keys, bridge). In-page only — registered when a real tab is present, so an agent driving the page can show its work.",
    inputSchema: OBJECT(
      { station: { type: "string", enum: ["deck", "scan", "agent", "labs", "keys", "bridge"], description: "Which console station to open." } },
      ["station"],
    ),
    annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false, untrustedContentHint: false },
    execution: "page",
    group: "site",
  },
];

/**
 * Natural-language instructions for the model. Surfaced in `server/discover`,
 * in `initialize` and at the top of llms.txt — one place, so the guidance an
 * agent reads can never drift from the table in the docs.
 */
export const AGENT_INSTRUCTIONS = `SENTINEL is a supply-chain CVE triage tool whose last step is deliberately human.

Reading rules:
- Prefer get_project_status once, then work the stages in order: scan_dependencies -> lookup_advisories -> assess_blast_radius -> summarise_triage -> propose_patch.
- lookup_advisories is per package@version. Send the *installed* version, not the declared range, or the version-range filter will discard real hits.
- Every read tool is idempotent and safe to retry.

Hard rules:
- open_pull_request and merge_pull_request are destructive. They refuse unless SENTINEL_ALLOW_REMOTE_WRITES=true is set server-side AND the exact confirmation string is passed in 'confirm'. Never invent a confirmation: ask the human first and relay their words.
- Patch verification is only claimed when a Daytona sandbox actually ran the tests. If the result says UNVERIFIED, report it as UNVERIFIED.
- Do not print, store or echo API keys. This server never returns one, and neither should you.

If a call fails with a typed error, read its 'hint' field — it names the exact environment variable or argument to fix.`;

export function allToolSpecs(): ToolSpec[] {
  return [...SENTINEL_TOOLS, ...SITE_TOOLS];
}

export function toolSpec(name: string): ToolSpec | undefined {
  return allToolSpecs().find((tool) => tool.name === name);
}

/** MCP `tools/list` shape: the annotations that the harness uses to gate writes. */
export function toMcpTool(spec: ToolSpec) {
  return {
    name: spec.name,
    title: spec.title,
    description: spec.description,
    inputSchema: spec.inputSchema,
    annotations: spec.annotations,
  };
}
