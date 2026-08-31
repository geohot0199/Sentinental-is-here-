import type { CSSProperties } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import Wordmark from "@/components/Wordmark";
import { Btn, Reveal, Tilt, KineticWords } from "@/components/interactive";
import HeroGraphic from "@/components/motion/HeroGraphic";
import Marquee from "@/components/motion/Marquee";
import Radar from "@/components/motion/Radar";

export const metadata = {
  title: "SENTINEL — Autonomous Supply-Chain CVE Strike Team",
};

const STAGES = [
  { n: "01", name: "Inventory", tool: "scan_dependencies", text: "Reads package.json and the lockfile, resolving real installed versions rather than declared ranges." },
  { n: "02", name: "Triage", tool: "lookup_advisories", text: "Queries the GitHub Advisory Database (OSV fallback) and keeps only advisories whose version range actually matches." },
  { n: "03", name: "Delegate", tool: "subagents", text: "Spawns one subagent per affected package, each with a clean context window — ten CVEs do not share (and exhaust) one." },
  { n: "04", name: "Assess", tool: "assess_blast_radius", text: "Works out whether each upgrade is a patch, minor or major bump, and how widely the package is imported." },
  { n: "05", name: "Plan", tool: "summarise_triage", text: "Collapses findings into one safe target version per package — the highest fix version, so no advisory is left open." },
  { n: "06", name: "Patch", tool: "propose_patch", text: "Generates the updated package.json, preserving the project's existing range operators." },
  { n: "07", name: "Verify", tool: "sandbox", text: "Installs and runs the test suite in an isolated Daytona sandbox." },
  { n: "08", name: "Propose", tool: "open_pull_request", text: "Opens the pull request. Pauses. Waits for a human." },
];

const TOOLS = [
  { name: "scan_dependencies", annotation: "readOnlyHint", approval: "no" },
  { name: "lookup_advisories", annotation: "readOnlyHint", approval: "no" },
  { name: "assess_blast_radius", annotation: "readOnlyHint", approval: "no" },
  { name: "summarise_triage", annotation: "readOnlyHint", approval: "no" },
  { name: "propose_patch", annotation: "readOnlyHint", approval: "no — writes only inside the sandbox" },
  { name: "open_pull_request", annotation: "destructiveHint", approval: "YES" },
  { name: "merge_pull_request", annotation: "destructiveHint", approval: "YES" },
];

const DEGRADATION = [
  { missing: "Model key", behaviour: "Hard fail at provision, with the exact env var named." },
  { missing: "DAYTONA_API_KEY", behaviour: "Sandbox disabled; patches reported unverified rather than silently claimed." },
  { missing: "GITHUB_TOKEN", behaviour: "GitHub tools return a typed “not configured” error; scanning and triage still work." },
  { missing: "Harness not running", behaviour: "Clients print the npx @truefoundry/trueforge command instead of a stack trace." },
];

const FAQ = [
  {
    q: "Will it open a pull request without asking me?",
    a: "No. open_pull_request and merge_pull_request are annotated destructiveHint, so the harness raises a real approval gate. The turn ends and waits. Denial is the default for every input it cannot interpret.",
  },
  {
    q: "Do I need an API key to try it?",
    a: "No. A scripted model endpoint ships with the project, so the whole path — real advisory data, real tools, real gate — runs without spending anything.",
  },
  {
    q: "Which ecosystems does it cover?",
    a: "Node and npm: it reads package.json plus the lockfile and triages against the GitHub Advisory Database, with OSV as a fallback.",
  },
  {
    q: "What happens without a sandbox key?",
    a: "The agent cannot execute or test a patch, and is explicitly instructed to report every patch as unverified. It never guesses that a fix works.",
  },
  {
    q: "Can I run it fully read-only?",
    a: "Yes — set SENTINEL_ALLOW_REMOTE_WRITES=false. Destructive tools then refuse before any network call, regardless of what the model or the approval UI says.",
  },
  {
    q: "Could a demo recording leak a token?",
    a: "Not through SENTINEL. Redaction runs in two layers — exact registered values plus ten credential shapes — scrubbed from every log line, tool result and SSE frame.",
  },
];

const LABS = [
  { name: "BreachLab", tag: "AST triage", text: "Static analysis that traces taint from source to sink, scores the threat, and synthesises a hotpatch diff." },
  { name: "BioSynth", tag: "3D protein CAD", text: "Crambin crystallographic coordinates, point mutagenesis with ΔΔG and steric clashes, binding-pocket discovery." },
  { name: "ChronoForensic", tag: "OSINT", text: "Multi-angle sensor streams, acoustic triangulation, and a sealed SHA-256 forensic dossier." },
  { name: "MetaLoop", tag: "swarm debugger", text: "Agent execution trace trees, synthetic tool injection, and cognitive-drift compensation." },
  { name: "ZK Escrow", tag: "arbiter", text: "Real SHA-256 / HMAC-SHA-256 digests, milestone-gated escrow release, zero-knowledge deliverable proofs." },
];

export default function LandingPage() {
  return (
    <>
      <Nav />
      <main className="page-main">

        {/* ================================================== HERO */}
        <section className="hero">
          <HeroGraphic />
          {/* drifting tool satellites — pure CSS motion, desktop only */}
          {([
            ["scan_dependencies", "13%", "34%", "1.1s", "0s", false],
            ["lookup_advisories", "35%", "6%", "1.45s", "1.3s", false],
            ["assess_blast_radius", "58%", "28%", "1.8s", "2.2s", false],
            ["open_pull_request · gated", "77%", "10%", "2.15s", "0.7s", true],
          ] as const).map(([label, top, right, sd, fd, red]) => (
            <span
              key={label}
              className={`hero-sat ${red ? "hero-sat-red" : ""}`}
              style={{ top, right, "--sd": sd, "--fd": fd } as CSSProperties}
            >
              <i /> {label}
            </span>
          ))}
          <div className="hero-copy">
            <span className="kicker kicker-in">TrueForge agent harness · MCP tools · Daytona sandbox</span>
            <h1 className="hero-wordmark display">
              <span className="sr-only">SENTINEL</span>
              <Wordmark hidden />
            </h1>
            <p className="hero-sub display">
              <KineticWords text="An autonomous supply-chain CVE strike team, with room to breathe." delay={420} />
            </p>
            <p className="hero-lede muted lede-in">
              It reads your dependency tree, triages every advisory against the versions you actually
              ship, works out how risky each fix is, prepares the patch — and then{" "}
              <strong className="hl">stops and asks a human</strong> before it opens the pull request.
            </p>
            <div className="row hero-cta cta-in">
              <Link href="/app" className="plain">
                <Btn variant="primary" className="btn-md">Launch the console</Btn>
              </Link>
              <Link href="/docs" className="plain">
                <Btn className="btn-md">Read the docs</Btn>
              </Link>
              <a href="https://github.com/geohot0199/sentinental" target="_blank" rel="noreferrer" className="plain">
                <Btn variant="ghost" className="btn-md">GitHub ↗</Btn>
              </a>
            </div>
            <div className="row chip-row hero-chips">
              {[
                ["8-stage pipeline", true],
                ["7 MCP tools", false],
                ["approval-gated writes", false],
                ["OSV live data", false],
                ["17 WebMCP tools", false],
              ].map(([label, glow], index) => (
                <span
                  key={String(label)}
                  className={`chip ${glow ? "chip-glow" : ""}`}
                  style={{ "--i": index } as CSSProperties}
                >
                  {label}
                </span>
              ))}
            </div>
            <div className="scroll-cue" aria-hidden="true">
              <span>scroll</span>
              <i />
            </div>
          </div>
        </section>

        <Marquee />

        {/* ============================================ CONSOLE DEMO */}
        <section className="sec">
          <Reveal>
            <div className="demo-grid">
              <Tilt strength={4}>
                <div className="panel brackets" style={{ padding: 0 }}>
                  <div className="toolbar">
                    <span className="dot" />
                    <span className="dot" />
                    <span className="dot active" />
                    <span className="title">sentinel — triage owner/repo</span>
                  </div>
                  <div className="term term-flush">
                    {[
                      ["01 Inventory", "lockfile resolved"],
                      ["02 Triage", "14 advisories → 3 match"],
                      ["03 Delegate", "3 subagents spawned"],
                      ["04 Assess", "1 major · 2 patch"],
                      ["05 Plan", "highest fix version"],
                      ["06 Patch", "ranges preserved"],
                      ["07 Verify", "93/93 in sandbox"],
                      ["08 Propose", "waiting for a human"],
                    ].map(([stage, detail], index) => (
                      <div className="term-line" key={stage} style={{ animationDelay: `${index * 90}ms` }}>
                        <span className="who">{stage}</span>
                        <span className="term-narration">{detail}</span>
                      </div>
                    ))}
                    <div className="term-line" style={{ marginTop: 10 }}>
                      <span className="term-approval">approval required: open_pull_request · destructive</span>
                      <span className="cursor-blink" />
                    </div>
                  </div>
                </div>
              </Tilt>
              <Reveal delay={160}>
                <div className="panel brackets pad-md radar-card">
                  <div className="h-row">
                    <span className="kicker">Live scope</span>
                    <span className="chip chip-green"><span className="dot" style={{ width: 6, height: 6 }} /> sweeping</span>
                  </div>
                  <Radar />
                  <div className="row" style={{ gap: 8, justifyContent: "center" }}>
                    <span className="chip chip-red">3 matches</span>
                    <span className="chip">14 swept</span>
                    <span className="chip">1 PR held</span>
                  </div>
                </div>
              </Reveal>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <p className="center faint small" style={{ margin: "18px 0 0" }}>
              The last row is the point of the project. The pause is real: the turn ends, the console shows the full
              tool call and its arguments, and nothing happens until a person clicks.
            </p>
          </Reveal>
        </section>

        {/* ================================================ PROBLEM */}
        <section className="sec">
          <Reveal>
            <div className="sec-head">
              <span className="kicker">The problem</span>
              <h2 className="display sec-title">Nobody has an afternoon.</h2>
            </div>
          </Reveal>
          <div className="grid-2" style={{ marginTop: 34 }}>
            <Reveal delay={60}>
              <Tilt>
                <div className="panel brackets pad-md" style={{ height: "100%" }}>
                  <p className="muted" style={{ fontSize: 15.5, lineHeight: 1.85, margin: 0 }}>
                    A dependency advisory lands. Someone has to work out whether <em>this</em> repository is
                    genuinely affected, whether the fix is a one-line bump or a breaking change, whether the
                    test suite survives it, and then write the pull request. That is an afternoon per advisory,
                    and most teams do it late — or not at all.
                  </p>
                </div>
              </Tilt>
            </Reveal>
            <Reveal delay={140}>
              <Tilt>
                <div className="panel brackets pad-md" style={{ height: "100%" }}>
                  <p className="muted" style={{ fontSize: 15.5, lineHeight: 1.85, margin: 0 }}>
                    Every software team on earth has this backlog. The work is not knowledge work any more; it is
                    repetition at scale, and{" "}
                    <strong className="hl">repetition is exactly what an agent should be doing.</strong>{" "}
                    SENTINEL is that agent. Everything up to the pull request is autonomous.{" "}
                    <strong className="hl">The pull request itself is not</strong> — that is the
                    irreversible step, and it stops there and asks.
                  </p>
                </div>
              </Tilt>
            </Reveal>
          </div>
        </section>

        {/* ================================================= STAGES */}
        <section className="sec">
          <Reveal>
            <div className="sec-head">
              <span className="kicker">What SENTINEL does</span>
              <h2 className="display sec-title" style={{ marginBottom: 6 }}>Eight stages. The last one is yours.</h2>
            </div>
          </Reveal>
          <div className="grid-2" style={{ marginTop: 34 }}>
            {STAGES.map((stage, index) => (
              <Reveal key={stage.n} delay={index * 60}>
                <Tilt>
                  <div className="panel pad-sm" style={{ height: "100%" }}>
                    <div className="h-row" style={{ alignItems: "baseline" }}>
                      <span className={`display ${index === STAGES.length - 1 ? "tx-red-glow" : "tx-green-glow"}`} style={{ fontSize: 26, fontWeight: 700 }}>{stage.n}</span>
                      <span className="mono faint" style={{ fontSize: 10.5 }}>{stage.tool}</span>
                    </div>
                    <h3 className="display" style={{ fontSize: 19, margin: "10px 0 8px" }}>{stage.name}</h3>
                    <p className="muted small" style={{ margin: 0, lineHeight: 1.7 }}>{stage.text}</p>
                  </div>
                </Tilt>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ============================================== HARNESS */}
        <section className="sec">
          <Reveal>
            <div className="sec-head">
              <span className="kicker">Why the harness does the work</span>
              <h2 className="display sec-title">We do not reimplement any part of the agent loop.</h2>
              <p className="sec-lede muted">
                No <code className="mono">while (toolCalls)</code>, no retry logic, no context compaction, no approval
                state machine. Those all exist in <strong className="hl">TrueForge</strong>. What SENTINEL
                owns is the two things the harness deliberately leaves to you: a tool server — the domain expertise,
                remote MCP over streamable HTTP — and two front ends driving the same core.
              </p>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <div className="panel panel-scroll pad-lg" style={{ marginTop: 30 }}>
              <pre className="diagram">{`┌──────────────────┐        ┌──────────────────┐
│  Terminal client │        │    Web client    │      ← this console
│  (src/cli)       │        │  (src/web)       │
└────────┬─────────┘        └────────┬─────────┘
         │                            │
         │   both speak the SAME core │
         └─────────────┬──────────────┘
                       ▼
         ┌───────────────────────────────┐
         │  src/harness  (our thin layer) │
         │  provision · runner · events   │
         └───────────────┬───────────────┘
                         │  @truefoundry/trueforge-sdk (HTTP)
                         ▼
         ╔═══════════════════════════════╗
         ║   TrueForge harness (theirs)  ║
         ║   agent loop · context mgmt   ║
         ║   subagents · approvals       ║
         ║   session state · sandbox     ║
         ╚═══╤═══════════╤═══════════╤═══╝
             │           │           │
       model │       MCP │   sandbox │
             ▼           ▼           ▼
        OpenAI /    src/mcp      Daytona
        Anthropic  (our tool     (isolated
        / Gemini    server)       exec)`}</pre>
            </div>
          </Reveal>
        </section>

        {/* ================================================= TOOLS */}
        <section className="sec">
          <Reveal>
            <div className="sec-head">
              <span className="kicker">The 7 MCP tools</span>
              <h2 className="display sec-title">Safety declared on the tool, once.</h2>
              <p className="sec-lede muted">
                Seven domain tools over remote streamable HTTP, bearer-authenticated. The classification lives next
                to the implementation, and both front ends inherit it automatically. A mis-tagged tool fails closed.
              </p>
            </div>
          </Reveal>
          <Reveal delay={100}>
            <div className="panel panel-scroll" style={{ marginTop: 30, padding: 8 }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Tool</th>
                    <th>Annotation</th>
                    <th>Approval</th>
                  </tr>
                </thead>
                <tbody>
                  {TOOLS.map((tool) => (
                    <tr key={tool.name}>
                      <td className="mono nowrap tool-name">{tool.name}</td>
                      <td className="mono muted">{tool.annotation}</td>
                      <td>
                        {tool.approval.startsWith("YES") ? (
                          <span className="sev sev-critical">approval required</span>
                        ) : (
                          <span className="muted small">{tool.approval}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Reveal>
        </section>

        {/* ================================================ SAFETY */}
        <section className="sec">
          <Reveal>
            <div className="sec-head">
              <span className="kicker">Control and safety</span>
              <h2 className="display sec-title">Structural, not a prompt the model can talk its way out of.</h2>
            </div>
          </Reveal>
          <div className="grid-2" style={{ marginTop: 34 }}>
            {[
              ["The approval policy is declared on the tool, once", "TrueForge resolves its @read-only / @write / @destructive approval selectors from MCP tool annotations. The classification lives next to the implementation, and both front ends inherit it automatically."],
              ["Defence in depth on the irreversible path", "The agent spec gates @destructive and names both tools literally. Destructive handlers check the kill switch before any network call. GitHubClient re-checks it at the point of mutation. Branch names are generated by us — the model never supplies a ref."],
              ["Failing safe", "Denial is the default everywhere: empty input, EOF, Escape, and unparseable answers all deny. The web API only accepts approvals for tool calls the harness actually raised."],
              ["Keeping secrets out", "Keys live only in .env, git-ignored, read at one place. The browser never talks to the harness or a provider directly — everything is proxied. Two-layer redaction scrubs every log line, tool result and SSE frame."],
            ].map(([title, text], index) => (
              <Reveal key={title} delay={index * 70}>
                <Tilt>
                  <div className="panel brackets pad-md" style={{ height: "100%" }}>
                    <h3 className="display" style={{ fontSize: 17, margin: "0 0 10px" }}>✓ {title}</h3>
                    <p className="muted small" style={{ margin: 0, lineHeight: 1.75 }}>{text}</p>
                  </div>
                </Tilt>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ========================================== DEGRADATION */}
        <section className="sec">
          <Reveal>
            <div className="sec-head">
              <span className="kicker">Degradation strategy</span>
              <h2 className="display sec-title" style={{ fontSize: "clamp(28px, 4vw, 40px)" }}>Each capability degrades independently.</h2>
            </div>
          </Reveal>
          <div className="grid-2" style={{ marginTop: 30 }}>
            {DEGRADATION.map((row, index) => (
              <Reveal key={row.missing} delay={index * 60}>
                <div className="panel pad-sm h-row" style={{ alignItems: "flex-start" }}>
                  <span className="chip chip-solid">{row.missing}</span>
                  <p className="muted small" style={{ margin: 0, lineHeight: 1.7 }}>{row.behaviour}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ================================================ LABS */}
        <section className="sec">
          <Reveal>
            <div className="sec-head">
              <span className="kicker">Included: the WebMCP OMNI-LAB</span>
              <h2 className="display sec-title">Five in-browser laboratories. Seventeen registered tools.</h2>
              <p className="sec-lede muted">
                A client-side WebMCP demonstration registered via the W3C/OpenAI{" "}
                <code className="mono">document.modelContext.registerTool(...)</code> standard — the escrow and
                forensic modules use real SHA-256 / HMAC-SHA-256 digests.
              </p>
            </div>
          </Reveal>
          <div className="grid-3" style={{ marginTop: 34 }}>
            {LABS.map((lab, index) => (
              <Reveal key={lab.name} delay={index * 70}>
                <Tilt>
                  <div className="panel brackets pad-md" style={{ height: "100%" }}>
                    <div className="h-row">
                      <h3 className="display" style={{ fontSize: 18, margin: 0 }}>{lab.name}</h3>
                      <span className="chip">{lab.tag}</span>
                    </div>
                    <p className="muted small" style={{ margin: "12px 0 0", lineHeight: 1.7 }}>{lab.text}</p>
                  </div>
                </Tilt>
              </Reveal>
            ))}
          </div>
          <Reveal delay={200}>
            <div className="center" style={{ margin: "34px 0 0" }}>
              <Link href="/app" className="plain">
                <Btn variant="primary" className="btn-md">Enter the OMNI-LAB ⬡</Btn>
              </Link>
            </div>
          </Reveal>
        </section>

        {/* second ticker — the tool inventory, drifting the other way */}
        <Marquee alt items={TOOLS.map((tool) => `${tool.name} · ${tool.annotation}`)} />

        {/* ================================================== FAQ */}
        <section className="sec">
          <Reveal>
            <div className="sec-head">
              <span className="kicker">FAQ</span>
              <h2 className="display sec-title">The questions that matter.</h2>
            </div>
          </Reveal>
          <div style={{ marginTop: 30 }}>
            {FAQ.map((item, index) => (
              <Reveal key={item.q} delay={index * 50}>
                <details className="panel faq-item">
                  <summary>{item.q}</summary>
                  <p className="muted small faq-answer">{item.a}</p>
                </details>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ================================================= CTA */}
        <section className="sec sec-cta">
          <Reveal>
            <div className="panel brackets cta-panel">
              <div className="cta-glow" aria-hidden="true" />
              <span className="kicker">The pause is the product</span>
              <h2 className="display chrome-text cta-title">Run the strike team.</h2>
              <p className="muted cta-lede">
                No API key needed to see the whole path — real advisory data, real tools, real approval gate —
                straight from the browser.
              </p>
              <div className="row cta-row">
                <Link href="/app" className="plain">
                  <Btn variant="primary" className="btn-lg">Launch Console ⬢</Btn>
                </Link>
                <a href="https://github.com/geohot0199/sentinental" target="_blank" rel="noreferrer" className="plain">
                  <Btn className="btn-lg">Star on GitHub ★</Btn>
                </a>
              </div>
            </div>
          </Reveal>
        </section>

        {/* =============================================== FOOTER */}
        <footer className="footer">
          <div className="container">
            <span className="mono faint" style={{ fontSize: 11.5 }}>
              SENTINEL · MIT License · built on the TrueForge agent harness
            </span>
            <div className="footer-links">
              <a className="link mono faint" style={{ fontSize: 11.5 }} href="https://github.com/geohot0199/sentinental" target="_blank" rel="noreferrer">GitHub</a>
              <Link className="link mono faint" style={{ fontSize: 11.5 }} href="/docs">Docs</Link>
              <Link className="link mono faint" style={{ fontSize: 11.5 }} href="/app">Console</Link>
            </div>
          </div>
        </footer>
      </main>
    </>
  );
}
