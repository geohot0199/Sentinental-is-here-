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
                    <td className="mono nowrap" style={{ color: "#fff" }}>{name}</td>
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
            <li>Destructive handlers check the kill switch <strong style={{ color: "#fff" }}>before any network call</strong>.</li>
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
