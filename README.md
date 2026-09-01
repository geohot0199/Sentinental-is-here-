# SENTINEL — Web Console

**The web front end for [SENTINEL](https://github.com/geohot0199/sentinental) — an autonomous supply-chain CVE strike team built on the [TrueForge](https://github.com/truefoundry/trueforge) agent harness.**

It reads your dependency tree, triages every advisory against the versions you actually ship, works out how risky each fix is, prepares the patch — and then **stops and asks a human** before it opens the pull request.

This console is a Next.js (App Router) app, deployable to Vercel with zero configuration.

## What's inside

| Station | What it does |
| --- | --- |
| **Landing** | The project story — the problem, the 8-stage pipeline, the 7 MCP tools, control & safety, degradation, FAQ |
| **Deck** | Capability report, merged from the browser key vault and server env (booleans and names only — never a key) |
| **Scan** | Live dependency triage against the **GitHub Advisory Database (OSV fallback)** — real data, no key needed |
| **Agent** | The eight-stage mission runner: inventory → triage → delegate → assess → plan → patch → verify → **propose**, ending at a real approval gate |
| **OMNI-LAB** | Five in-browser laboratories (BreachLab, BioSynth, ChronoForensic, MetaLoop, ZK Escrow) — 17 tools registered on `document.modelContext` (W3C/OpenAI WebMCP), real SHA-256 / HMAC-SHA-256 |
| **Bridge** | The agent bridge: endpoint card, copy-paste client snippets, a live WebMCP + MCP conformance run and a raw JSON-RPC playground |
| **Keys** | The API key vault — OpenAI / Anthropic / Gemini, GitHub token, Daytona sandbox key, TrueForge harness URL, and the `SENTINEL_ALLOW_REMOTE_WRITES` kill switch |

## How the real paths work

- **Advisory triage** — `POST /api/advisories` proxies the GitHub Advisory Database and falls back to OSV. Version-range matching uses the same semver engine as the CLI (`lib/semver.ts`).
- **Pull requests** — `POST /api/github` creates the branch, commits the patched `package.json` and opens the PR. Destructive by construction: the kill switch is re-checked server-side **before any network call**, branch names are generated (never model-authored), and the mission pauses at an approval gate where **denial is the default** (Escape denies too).
- **Verification** — `POST /api/sandbox` provisions a **real Daytona sandbox** on a `node:22` image, writes the patched manifest, runs `npm install` and the test suite, returns the logs, and destroys the sandbox. Without a key, patches are honestly reported **UNVERIFIED**.
- **Harness** — `POST /api/harness` probes a TrueForge harness server-side (so browser CORS never blocks it). When none answers, the bundled scripted model drives the same tools over the same data — zero spend.
- **Secrets** — browser-vault keys live in `localStorage`, are masked in the UI, and are sent only to this app's own API routes over HTTPS, per request, never persisted server-side.

## The agent bridge (WebMCP + remote MCP)

The tools are published twice, from one contract (`lib/tool-catalog.ts`), so an agent gets identical behaviour whether it is driving a tab or talking to a server.

| Door | Who uses it | Code |
| --- | --- | --- |
| `document.modelContext` | ChatGPT in the desktop app's built-in browser, ChatGPT Sites, Chrome behind the WebMCP origin trial, any in-page agent | `lib/webmcp.ts` on `lib/webmcp-core.ts` |
| `POST /api/mcp` | ChatGPT developer-mode connectors, Claude, Cursor, Zed, Gemini CLI, your own client | `lib/mcp-server.ts`, routed by `app/api/mcp/route.ts` |

**WebMCP, in the tab.** Boot resolves the surface in the spec's order — `document.modelContext`, then the deprecated `navigator.modelContext` alias — and registers every tool through `registerTool(tool, { signal })` with `title`, `inputSchema` and `annotations` (`readOnlyHint` / `destructiveHint` / `openWorldHint`). `toolautosubmit` is also carried the declarative way: the console's scan form wears `toolname` / `tooldescription`, so a supporting browser can synthesize a tool from the markup alone. Where no native surface exists a spec-shaped polyfill takes its place and the console says **"in-page only"**, because a polyfill is invisible to an outside agent — `agentVisible` stays false rather than lying.

**MCP, over HTTP.** Stateless Streamable HTTP per the 2026-07-28 release: every request carries `params._meta` with the protocol version, client info and capabilities; `Mcp-Method` and `Mcp-Name` are required and validated against the body (`-32020` on a mismatch, `404` + `-32601` on an unknown method, `403` on a foreign `Origin`, `405` on the GET/DELETE session traffic this release removed). `server/discover` is implemented, list results carry `resultType`/`ttlMs`/`cacheScope`, and tool order is stable. Legacy clients are not abandoned: `initialize` is still answered in the 2025-11-25 shape, and an unsupported version comes back as `-32022` with the supported list so the client can retry.

**What an agent can reach.** Read-only tools plus docs and navigation: 13 domain/site tools over HTTP, 17 OMNI-LAB tools in the tab (and the labs are computed in-page, so nothing but the site's own routes crosses the wire). `open_pull_request` and `merge_pull_request` are absent from `tools/list` until `SENTINEL_ALLOW_REMOTE_WRITES=true`; even then they refuse unless the exact confirmation string is passed, and `navigate_console` never leaves the browser.

```bash
npm run check:webmcp                     # 28 assertions on the page half, headless
node scripts/mcp-conformance.mjs --base=http://localhost:3000   # 39 assertions against a live endpoint
npm run verify                           # typecheck + both suites + build
```

## Run locally

```bash
npm install
npm run dev        # http://localhost:3000
```

## Deploy to Vercel

Import the repository in the Vercel dashboard (or run `vercel`) — Next.js is auto-detected. Optional environment variables:

| Variable | Purpose |
| --- | --- |
| `SENTINEL_ALLOW_REMOTE_WRITES` | `false` = server-side kill switch; overrides anything the browser claims |
| `GITHUB_TOKEN` | Server-side default token for repo reads and PRs |
| `DAYTONA_API_KEY` | Server-side default sandbox key |
| `TRUEFORGE_URL` | A reachable TrueForge harness for the probe |
| `SENTINEL_MCP_TOKEN` | Require `Authorization: Bearer <token>` on `tools/call` / `prompts/get`. Unset = the read-only surface is public |
| `SENTINEL_MCP_ALLOWED_ORIGINS` | Extra comma-separated origins allowed to POST `/api/mcp` from a browser (same-origin is always allowed) |
| `NEXT_PUBLIC_WEBMCP_ORIGIN_TRIAL` | Chrome origin-trial token for this exact host, emitted as a `<meta http-equiv="origin-trial">`. No token, no meta tag — the polyfill still runs |
| `NEXT_PUBLIC_SITE_URL` | Absolute base for metadata, `llms.txt` and the connection card |

## Layout

```
app/                App Router pages (landing, console, docs) + API routes
  api/advisories    Live advisory triage proxy (GitHub Advisory DB + OSV fallback)
  api/scans         Batch scan pipeline (inventory → triage → plan → patch)
  api/github        Repo reads + approval-gated PR creation
  api/sandbox       Daytona sandbox verify (create → write → install → test → destroy)
  api/harness       TrueForge harness probe
  api/mcp           The remote MCP endpoint (WebMCP's server-side twin)
  api/docs          Documentation passages for search_docs / fetch_docs
  llms.txt          The same corpus as one text digest, for agents
components/         UI — 3D hero, ripple buttons, tilt cards, stage rail, labs
lib/                Ported engines: semver, manifest, advisories, github, triage,
                    the mission pipeline, the key vault and the OMNI-LAB engines
lib/tool-catalog    ONE tool contract, rendered as WebMCP definitions and MCP schema
lib/webmcp-core     Spec-shaped model context: registration, schema checks, polyfill
lib/webmcp          Boots the page half, runs tools in-tab, reports the surface honestly
lib/mcp-server      The wire half: JSON-RPC 2.0 framing, 2026-07-28 + legacy eras
lib/agent-bridge    The self-check both the landing page and the console run
scripts/            mcp-conformance.mjs (live HTTP) · webmcp-conformance.mjs (headless)
```

## License

MIT — see [LICENSE](LICENSE). The upstream project: [geohot0199/sentinental](https://github.com/geohot0199/sentinental).
