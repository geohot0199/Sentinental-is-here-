import Link from "next/link";
import Nav from "@/components/Nav";
import { Btn, Reveal, Tilt } from "@/components/interactive";

export const metadata = { title: "SENTINEL — Docs" };

const CONFIG = [
  ["OPENAI_API_KEY / ANTHROPIC_API_KEY / GEMINI_API_KEY", "one of", "The model. SENTINEL picks whichever it finds and selects a model from the harness's own catalog."],
  ["MODEL_PROVIDER", "optional", "Force a provider: openai · anthropic · google-gemini."],
  ["MODEL_ID", "optional", "Force a specific model. Leave unset and SENTINEL picks a sensible mid-tier model."],
  ["GITHUB_TOKEN", "yes", "Reading manifests, opening pull requests. Scope it to the repos you want touched."],
  ["SENTINEL_TARGET_REPO", "optional", "Default repository, as owner/name."],
  ["DAYTONA_API_KEY", "recommended", "Sandbox. Without it every patch is reported unverified."],
  ["SENTINEL_ALLOW_REMOTE_WRITES", "optional", "Hard kill switch. false makes destructive tools refuse before any network call."],
  ["TRUEFORGE_URL", "optional", "Harness URL. Default http://127.0.0.1:8790."],
  ["SENTINEL_MCP_PORT", "optional", "Tool server port. Default 8791."],
  ["SENTINEL_WEB_PORT", "optional", "Web console port. Default 3000."],
  ["SENTINEL_MCP_TOKEN", "optional", "Shared secret the harness uses to call the tool server. Unset means a fresh random token every boot."],
  ["SENTINEL_DEMO_MODEL_URL", "optional", "Point at the bundled scripted model for a keyless demo run."],
  ["SENTINEL_MCP_ALLOWED_ORIGINS", "optional", "Extra comma-separated origins allowed to POST /api/mcp from a browser (Origin validation is on by default)."],
  ["NEXT_PUBLIC_SITE_URL", "optional", "Absolute base URL, so metadata and llms.txt carry real links instead of relative ones."],
  ["NEXT_PUBLIC_WEBMCP_ORIGIN_TRIAL", "optional", "Chrome WebMCP origin-trial token for this exact host. Unset means no meta tag is emitted."],
  ["NO_COLOR", "optional", "Force plain text in the CLI."],
];

const TOOLS = [
  { name: "scan_dependencies", annotation: "readOnlyHint", approval: "no", text: "Read package.json + lockfile, resolving real installed versions rather than declared ranges." },
  { name: "lookup_advisories", annotation: "readOnlyHint", approval: "no", text: "GitHub Advisory Database with OSV fallback; only matching version ranges count." },
  { name: "assess_blast_radius", annotation: "readOnlyHint", approval: "no", text: "Patch / minor / major classification, advisories cleared, import-site usage." },
  { name: "summarise_triage", annotation: "readOnlyHint", approval: "no", text: "Collapse findings into one safe target version per package." },
  { name: "propose_patch", annotation: "readOnlyHint", approval: "no", text: "Regenerated package.json, range operators preserved. Writes only inside the sandbox." },
  { name: "open_pull_request", annotation: "destructiveHint", approval: "YES", text: "Branch + commit + pull request. Generated branch name — the model never supplies a ref." },
  { name: "merge_pull_request", annotation: "destructiveHint", approval: "YES", text: "Squash-merge an open pull request. Gated like every irreversible action." },
];

export default function DocsPage() {
  return (
    <>
      <Nav />
      <main className="container" style={{ paddingTop: "calc(var(--nav-h) + 50px)", paddingBottom: 90, maxWidth: 980 }}>
        <Reveal>
          <span className="kicker">Documentation</span>
          <h1 className="display" style={{ fontSize: "clamp(34px, 5.5vw, 56px)", fontWeight: 600, letterSpacing: "-0.035em", margin: "16px 0 0" }}>
            Every surface, in one place.
          </h1>
          <p className="muted" style={{ fontSize: 16, lineHeight: 1.75, maxWidth: 700, margin: "16px 0 0" }}>
            This console is the web front end of the SENTINEL strike team: live advisory triage, the eight-stage
            mission runner with a real approval gate, the Daytona verify stage, and the WebMCP OMNI-LAB. The CLI and
            the MCP tool server live in the repository.
          </p>
        </Reveal>

        {/* --------------------------------------------------- web vs repo */}
        <Reveal>
          <div className="panel brackets pad-lg" style={{ marginTop: 36 }}>
            <h2 className="display" style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em", margin: "0 0 14px" }}>What runs where</h2>
            <div className="grid-2">
              <div>
                <span className="chip chip-solid">in this browser console</span>
                <ul className="muted small" style={{ margin: "12px 0 0", paddingLeft: 18, lineHeight: 1.9 }}>
                  <li>Live dependency triage — real GitHub Advisory / OSV data, no key needed</li>
                  <li>The eight-stage mission with the approval gate</li>
                  <li>Real pull-request opening (needs a GitHub token in the vault, behind the gate)</li>
                  <li>Real Daytona sandbox verification (needs a Daytona key in the vault)</li>
                  <li>The OMNI-LAB — five laboratories, 17 WebMCP tools, real SHA-256 / HMAC</li>
                  <li>Key vault — keys stay in localStorage, sent only to this app's proxy routes</li>
                </ul>
              </div>
              <div>
                <span className="chip">from the repository</span>
                <ul className="muted small" style={{ margin: "12px 0 0", paddingLeft: 18, lineHeight: 1.9 }}>
                  <li><code className="mono">npm run web</code> — the full console against a live TrueForge harness</li>
                  <li><code className="mono">npm run cli</code> — the terminal client</li>
                  <li><code className="mono">npm run mcp</code> — the MCP tool server on :8791</li>
                  <li><code className="mono">npm run app</code> — the API app with SQLite scan history</li>
                  <li><code className="mono">npm test</code> — 18 suites, 211 tests</li>
                  <li><code className="mono">npm run scan:secrets</code> — fails the build on anything credential-shaped</li>
                </ul>
              </div>
            </div>
          </div>
        </Reveal>

        {/* ------------------------------------------------------- install */}
        <Reveal>
          <h2 className="display" style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.025em", margin: "44px 0 0" }}>Install the strike team</h2>
        </Reveal>
        <div className="grid-2" style={{ marginTop: 18 }}>
          <Reveal delay={60}>
            <Tilt strength={5}>
              <div className="panel brackets pad-md" style={{ height: "100%" }}>
                <span className="chip">A · packaged CLI</span>
                <div className="code-block" style={{ marginTop: 14 }}>
                  <pre>{`npm install --global \\
  https://github.com/geohot0199/sentinental/raw/refs/tags/v0.2.0/releases/sentinel-strike-team-v0.2.0.tgz

sentinel --help`}</pre>
                </div>
                <p className="faint small" style={{ margin: "12px 0 0" }}>Requires Node.js ≥ 22.14.</p>
              </div>
            </Tilt>
          </Reveal>
          <Reveal delay={120}>
            <Tilt strength={5}>
              <div className="panel brackets pad-md" style={{ height: "100%" }}>
                <span className="chip">B · from source</span>
                <div className="code-block" style={{ marginTop: 14 }}>
                  <pre>{`npx @truefoundry/trueforge@latest   # the harness

git clone https://github.com/geohot0199/sentinental.git
cd sentinental && npm install
cp .env.example .env               # add your keys
npm run web                        # console on :3000`}</pre>
                </div>
              </div>
            </Tilt>
          </Reveal>
        </div>
        <Reveal delay={160}>
          <div className="panel pad-md" style={{ marginTop: 18 }}>
            <span className="chip">C · no API key demo</span>
            <p className="muted small" style={{ margin: "12px 0 0", lineHeight: 1.75 }}>
              A scripted model endpoint ships with the repo, so you can see the whole path — real advisory data,
              real tools, real approval gate — without spending anything. In this console, the same experience is
              the default: with no keys at all, the scan and mission stations run on live public advisory data.
            </p>
          </div>
        </Reveal>

        {/* ------------------------------------------------------ config */}
        <Reveal>
          <h2 className="display" style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.025em", margin: "44px 0 0" }}>Configuration</h2>
          <p className="muted small" style={{ lineHeight: 1.75, maxWidth: 700, margin: "8px 0 0" }}>
            In the console these live in the <Link className="link" href="/app">key vault</Link> (browser
            localStorage). In the repository they live in <code className="mono">.env</code> — git-ignored, read in
            exactly one place (<code className="mono">src/core/config.ts</code>).
          </p>
        </Reveal>
        <Reveal delay={80}>
          <div className="panel panel-scroll" style={{ marginTop: 18, padding: 8 }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Variable</th>
                  <th>Required</th>
                  <th>Purpose</th>
                </tr>
              </thead>
              <tbody>
                {CONFIG.map(([name, required, purpose]) => (
                  <tr key={name}>
                    <td className="mono nowrap" style={{ color: "var(--ink)" }}>{name}</td>
                    <td>
                      <span className={`chip ${required === "yes" || required.includes("one") ? "chip-solid" : ""}`} style={{ fontSize: 10 }}>{required}</span>
                    </td>
                    <td className="muted" style={{ lineHeight: 1.6 }}>{purpose}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>

        {/* ------------------------------------------------------- tools */}
        <Reveal>
          <h2 className="display" style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.025em", margin: "44px 0 0" }}>The 7 MCP tools</h2>
        </Reveal>
        <div className="grid-2" style={{ marginTop: 18 }}>
          {TOOLS.map((tool, index) => (
            <Reveal key={tool.name} delay={index * 50}>
              <div className="panel pad-sm" style={{ height: "100%" }}>
                <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                  <strong className="mono tool-name" style={{ fontSize: 13.5 }}>{tool.name}</strong>
                  {tool.approval === "YES"
                    ? <span className="sev sev-critical">approval required</span>
                    : <span className="chip" style={{ fontSize: 10 }}>{tool.annotation}</span>}
                </div>
                <p className="muted small" style={{ margin: "10px 0 0", lineHeight: 1.65 }}>{tool.text}</p>
              </div>
            </Reveal>
          ))}
        </div>

        {/* ------------------------------------------------- agent bridge */}
        <Reveal>
          <h2 className="display" style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.025em", margin: "44px 0 0" }}>
            The agent bridge
          </h2>
          <p className="muted small" style={{ lineHeight: 1.75, maxWidth: 720, margin: "8px 0 0" }}>
            Two doors, one contract. In a browser tab the tools are registered on{" "}
            <code className="mono">document.modelContext</code> (WebMCP, W3C Web Machine Learning CG — the getter
            moved from <code className="mono">navigator</code> to <code className="mono">document</code> in the
            May&nbsp;2026 draft, so the alias is resolved too). Outside a browser the identical contract is served as
            a remote MCP server over stateless Streamable HTTP.
          </p>
        </Reveal>

        <div className="grid-2" style={{ marginTop: 18 }}>
          <Reveal delay={60}>
            <div className="panel brackets pad-md" style={{ height: "100%" }}>
              <span className="kicker">WebMCP · in the tab</span>
              <ul className="muted small" style={{ margin: "12px 0 0", paddingLeft: 18, lineHeight: 1.9 }}>
                <li>Registered through <code className="mono">registerTool(tool, &#123; signal &#125;)</code>, the spec signature — promise-based, abortable, and rejecting on a duplicate name rather than silently overwriting.</li>
                <li>Every tool carries <code className="mono">title</code>, <code className="mono">inputSchema</code> and <code className="mono">annotations</code>, so the agent can see which ones are read-only before it chooses.</li>
                <li>Input is validated against the schema before <code className="mono">execute</code> runs, and{" "}
                  <code className="mono">executeTool</code> stringifies the result the way the spec says an agent will receive it.</li>
                <li>Requires a secure context. Chrome: public origin trial (149–156). ChatGPT desktop built-in browser and ChatGPT Sites: supported since 2026-08-25. Firefox/Safari: no implementation yet.</li>
                <li>No native surface? A spec-shaped polyfill is installed for in-page agents and the console — and it is labelled in-page only, never as agent-visible.</li>
              </ul>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <div className="panel brackets pad-md" style={{ height: "100%" }}>
              <span className="kicker">MCP · <code className="mono">POST /api/mcp</code></span>
              <ul className="muted small" style={{ margin: "12px 0 0", paddingLeft: 18, lineHeight: 1.9 }}>
                <li>Protocol <code className="mono">2026-07-28</code>: no <code className="mono">initialize</code> handshake, no{" "}
                  <code className="mono">Mcp-Session-Id</code>; version and identity ride in{" "}
                  <code className="mono">params._meta</code>.</li>
                <li>Routing headers <code className="mono">Mcp-Method</code> and <code className="mono">Mcp-Name</code>{" "}
                  are required for modern clients and validated against the body — a mismatch is{" "}
                  <code className="mono">-32020 HeaderMismatch</code>.</li>
                <li><code className="mono">server/discover</code> is implemented (it is mandatory now), and list
                  results carry <code className="mono">resultType</code>, <code className="mono">ttlMs</code> and{" "}
                  <code className="mono">cacheScope</code>.</li>
                <li>Legacy clients still work: an <code className="mono">initialize</code> request is answered in the
                  2025-11-25 shape, and unknown versions come back as <code className="mono">-32022</code> with the
                  supported list so the client can retry rather than guess.</li>
                <li><code className="mono">Origin</code> is validated against same-origin plus{" "}
                  <code className="mono">SENTINEL_MCP_ALLOWED_ORIGINS</code>; GET/DELETE answer 405 the way the
                  stateless transport expects.</li>
              </ul>
            </div>
          </Reveal>
        </div>

        <Reveal delay={80}>
          <div className="panel brackets pad-md" style={{ marginTop: 18 }}>
            <span className="kicker">Connect it</span>
            <div className="grid-2" style={{ marginTop: 14 }}>
              {[
                ["ChatGPT (web, developer mode)", "Settings → Apps & Connectors → Advanced → Developer mode on → Create. URL: https://your-host/api/mcp. Transport: Streamable HTTP. Auth: No authentication, or OAuth once you set SENTINEL_MCP_TOKEN. Plus and Pro may be limited to read/fetch tools; Business and Enterprise get the full set."],
                ["ChatGPT desktop (built-in browser)", "Nothing to install. Open the site in the desktop app's browser and ask ChatGPT or Codex to use the site's tools — it reads the registered WebMCP surface, with the usual website-access and sensitive-action confirmations in front."],
                ["Claude, Claude Code, Cursor, Zed", "claude mcp add --transport http sentinel https://your-host/api/mcp — or the same url in Cursor's mcp.json. Read the tool list once and it is cached for five minutes (ttlMs)."],
                ["Your own client", "POST one JSON-RPC object per request with the three headers above. scripts/mcp-conformance.mjs in this repository is a 90-line working example you can copy."],
              ].map(([title, text]) => (
                <div key={title} className="panel pad-sm">
                  <strong className="mono" style={{ fontSize: 12.5 }}>{title}</strong>
                  <p className="muted small" style={{ margin: "8px 0 0", lineHeight: 1.7 }}>{text}</p>
                </div>
              ))}
            </div>
            <p className="muted small" style={{ margin: "16px 0 0", lineHeight: 1.7 }}>
              Prove it without an agent: run <code className="mono">npm run check:mcp</code> against a running
              deployment, or press <em>Run the check</em> in the{" "}
              <Link className="link" href="/app">Bridge station</Link>. Both exercise the same{" "}
              <code className="mono">handleRpc()</code> the endpoint runs in production.
            </p>
          </div>
        </Reveal>

        <Reveal delay={100}>
          <div className="panel brackets" style={{ padding: 0, marginTop: 18 }}>
            <div className="toolbar">
              <span className="dot" />
              <span className="dot" />
              <span className="dot active" />
              <span className="title">one request, end to end</span>
            </div>
            <div className="code-block" style={{ border: "none", borderRadius: 0 }}>
              <pre>{`POST /api/mcp
content-type: application/json
mcp-protocol-version: 2026-07-28
mcp-method: tools/call
mcp-name: lookup_advisories

{
  "jsonrpc": "2.0",
  "id": 7,
  "method": "tools/call",
  "params": {
    "name": "lookup_advisories",
    "arguments": { "packageName": "lodash", "installedVersion": "4.17.20" },
    "_meta": {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientInfo": { "name": "my-agent", "version": "1.0" },
      "io.modelcontextprotocol/clientCapabilities": {}
    }
  }
}

200 ok
{
  "jsonrpc": "2.0",
  "id": 7,
  "result": {
    "resultType": "complete",
    "content": [{ "type": "text", "text": "{ \"matchCount\": 3, ... }" }],
    "structuredContent": { "packageName": "lodash", "source": "github", "matchCount": 3, "matches": [...] },
    "isError": false,
    "_meta": { "io.modelcontextprotocol/serverInfo": { "name": "sentinel-web", "version": "1.0.0" } }
  }
}`}</pre>
            </div>
          </div>
        </Reveal>

        {/* ------------------------------------------------------ deploy */}
        <Reveal>
          <h2 className="display" style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.025em", margin: "44px 0 0" }}>Deploying this console</h2>
        </Reveal>
        <Reveal delay={80}>
          <div className="panel brackets pad-md" style={{ marginTop: 18 }}>
            <p className="muted small" style={{ marginTop: 0, lineHeight: 1.75 }}>
              The console is a standard Next.js App Router project — Vercel detects it automatically.
            </p>
            <div className="code-block">
              <pre>{`# from the repository root
vercel            # or: import the repo in the Vercel dashboard

# optional server-side environment variables (Project → Settings → Env Vars):
#   SENTINEL_ALLOW_REMOTE_WRITES=false   # server kill switch, overrides the browser
#   GITHUB_TOKEN=…                       # server-side default token
#   DAYTONA_API_KEY=…                    # server-side sandbox key
#   TRUEFORGE_URL=…                      # a reachable TrueForge harness`}</pre>
            </div>
            <p className="muted small" style={{ lineHeight: 1.75, marginBottom: 0, marginTop: 14 }}>
              API routes proxy every upstream call (advisories, GitHub, Daytona, the harness probe) — the browser
              never talks to a third party directly. Browser-vault keys are used per-request and never stored
              server-side.
            </p>
          </div>
        </Reveal>

        {/* ------------------------------------------------------ safety */}
        <Reveal>
          <h2 className="display" style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.025em", margin: "44px 0 0" }}>Control and safety</h2>
          <ul className="muted small" style={{ lineHeight: 2, paddingLeft: 20, maxWidth: 760, marginTop: 14 }}>
            <li>The approval policy is declared on the tool, once — both front ends inherit it.</li>
            <li>Destructive handlers check the kill switch <strong style={{ color: "var(--ink)" }}>before any network call</strong>.</li>
            <li>Branch names are generated and validated against git's ref rules — the model never supplies a ref.</li>
            <li>The web API only accepts approvals for tool calls actually raised by the pipeline.</li>
            <li>Denial is the default: empty input, EOF, Escape, and unparseable answers all deny.</li>
            <li>Two-layer redaction scrubs every log line, tool result and SSE frame.</li>
          </ul>
        </Reveal>

        <Reveal>
          <div className="row center" style={{ justifyContent: "center", margin: "50px 0 0" }}>
            <Link href="/app" className="plain">
              <Btn variant="primary" className="btn-lg">Open the console ⬢</Btn>
            </Link>
            <a href="https://github.com/geohot0199/sentinental" target="_blank" rel="noreferrer" className="plain">
              <Btn className="btn-lg">View source ★</Btn>
            </a>
          </div>
        </Reveal>
      </main>
    </>
  );
}
