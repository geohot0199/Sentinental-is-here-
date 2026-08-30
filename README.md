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
| **Keys** | The API key vault — OpenAI / Anthropic / Gemini, GitHub token, Daytona sandbox key, TrueForge harness URL, and the `SENTINEL_ALLOW_REMOTE_WRITES` kill switch |

## How the real paths work

- **Advisory triage** — `POST /api/advisories` proxies the GitHub Advisory Database and falls back to OSV. Version-range matching uses the same semver engine as the CLI (`lib/semver.ts`).
- **Pull requests** — `POST /api/github` creates the branch, commits the patched `package.json` and opens the PR. Destructive by construction: the kill switch is re-checked server-side **before any network call**, branch names are generated (never model-authored), and the mission pauses at an approval gate where **denial is the default** (Escape denies too).
- **Verification** — `POST /api/sandbox` provisions a **real Daytona sandbox** on a `node:22` image, writes the patched manifest, runs `npm install` and the test suite, returns the logs, and destroys the sandbox. Without a key, patches are honestly reported **UNVERIFIED**.
- **Harness** — `POST /api/harness` probes a TrueForge harness server-side (so browser CORS never blocks it). When none answers, the bundled scripted model drives the same tools over the same data — zero spend.
- **Secrets** — browser-vault keys live in `localStorage`, are masked in the UI, and are sent only to this app's own API routes over HTTPS, per request, never persisted server-side.

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

## Layout

```
app/                App Router pages (landing, console, docs) + API routes
  api/advisories    Live advisory triage proxy (GitHub Advisory DB + OSV fallback)
  api/scans         Batch scan pipeline (inventory → triage → plan → patch)
  api/github        Repo reads + approval-gated PR creation
  api/sandbox       Daytona sandbox verify (create → write → install → test → destroy)
  api/harness       TrueForge harness probe
components/         UI — 3D hero, ripple buttons, tilt cards, stage rail, labs
lib/                Ported engines: semver, manifest, advisories, github, triage,
                    the mission pipeline, the key vault and the OMNI-LAB engines
```

## License

MIT — see [LICENSE](LICENSE). The upstream project: [geohot0199/sentinental](https://github.com/geohot0199/sentinental).
