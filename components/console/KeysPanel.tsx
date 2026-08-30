"use client";

/**
 * The key vault — SENTINEL's `.env`, in the browser.
 *
 * Keys are stored in localStorage on this machine only, masked in the UI, and
 * sent exclusively to this app's own API routes over HTTPS for proxying to
 * upstreams. Never persisted server-side, never in a URL, never to a third
 * party. The wipe button removes them entirely.
 */
import { useState } from "react";
import { Btn, Tilt } from "@/components/interactive";
import { maskSecret, activeProvider, type KeyVault } from "@/lib/keys";
import type { ConsoleContext } from "@/app/app/page";

type TestState = { status: "idle" | "running" | "ok" | "fail"; detail?: string };

async function api(path: string, body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  let data: Record<string, unknown> = {};
  try {
    data = (await response.json()) as Record<string, unknown>;
  } catch {
    data = {};
  }
  return { ok: response.ok, data };
}

function SecretField({
  label,
  hint,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
}) {
  const [editing, setEditing] = useState(value.length === 0);
  return (
    <div className="field">
      <label>{label}</label>
      {editing || value.length === 0 ? (
        <input
          className="input"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <div className="row" style={{ gap: 8 }}>
          <input className="input mono" value={maskSecret(value)} readOnly onFocus={() => setEditing(true)} />
          <Btn variant="ghost" style={{ padding: "10px 14px" }} onClick={() => setEditing(true)}>Edit</Btn>
        </div>
      )}
      <span className="faint small" style={{ fontFamily: "var(--font-body)" }}>{hint}</span>
    </div>
  );
}

export default function KeysPanel({ context }: { context: ConsoleContext }) {
  const { vault, updateVault, wipeVault, push, server } = context;
  const [draft, setDraft] = useState<KeyVault>(vault);
  const [githubTest, setGithubTest] = useState<TestState>({ status: "idle" });
  const [daytonaTest, setDaytonaTest] = useState<TestState>({ status: "idle" });
  const [harnessTest, setHarnessTest] = useState<TestState>({ status: "idle" });

  const set = <K extends keyof KeyVault>(key: K, value: KeyVault[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const save = () => {
    updateVault(draft);
    push("Vault saved to this browser. Keys stay local — nothing was sent anywhere.", "ok");
  };

  const testGithub = async () => {
    if (draft.GITHUB_TOKEN.length === 0) {
      setGithubTest({ status: "fail", detail: "Enter a token first." });
      return;
    }
    setGithubTest({ status: "running" });
    const result = await api("/api/github", { action: "check", token: draft.GITHUB_TOKEN });
    const detail = String(result.data.detail ?? result.data.error ?? "");
    setGithubTest({ status: result.ok && result.data.ok === true ? "ok" : "fail", detail });
  };

  const testDaytona = async () => {
    if (draft.DAYTONA_API_KEY.length === 0) {
      setDaytonaTest({ status: "fail", detail: "Enter a key first." });
      return;
    }
    setDaytonaTest({ status: "running" });
    const result = await api("/api/sandbox", { action: "check", daytonaKey: draft.DAYTONA_API_KEY });
    setDaytonaTest({
      status: result.data.ok === true ? "ok" : "fail",
      detail: String(result.data.detail ?? result.data.error ?? ""),
    });
  };

  const testHarness = async () => {
    setHarnessTest({ status: "running" });
    const result = await api("/api/harness", { url: draft.TRUEFORGE_URL || undefined });
    setHarnessTest({
      status: result.data.reachable === true ? "ok" : "fail",
      detail: String(result.data.detail ?? ""),
    });
  };

  const provider = activeProvider(draft);
  const dirty = JSON.stringify(draft) !== JSON.stringify(vault);

  return (
    <div className="grid-2">
      {/* ------------------------------------------------ model */}
      <Tilt strength={4}>
        <div className="panel brackets" style={{ padding: 26, height: "100%" }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
            <h3 className="display" style={{ fontSize: 18, margin: 0 }}>Model provider</h3>
            <span className="chip">{provider === null ? "scripted model" : provider}</span>
          </div>
          <p className="muted small" style={{ marginTop: 0, lineHeight: 1.7 }}>
            One key is required for a live model. SENTINEL picks whichever it finds, in order — or force one below.
            Without any key the bundled scripted model runs the whole path: real advisory data, real tools, real
            gate, zero spend.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 18 }}>
            <SecretField
              label="OPENAI_API_KEY"
              hint="sk-… · picked first by default"
              value={draft.OPENAI_API_KEY}
              onChange={(value) => set("OPENAI_API_KEY", value)}
              placeholder="sk-…"
            />
            <SecretField
              label="ANTHROPIC_API_KEY"
              hint="sk-ant-… · second in the pick order"
              value={draft.ANTHROPIC_API_KEY}
              onChange={(value) => set("ANTHROPIC_API_KEY", value)}
              placeholder="sk-ant-…"
            />
            <SecretField
              label="GEMINI_API_KEY"
              hint="Google AI Studio key · third in the pick order"
              value={draft.GEMINI_API_KEY}
              onChange={(value) => set("GEMINI_API_KEY", value)}
              placeholder="AIza…"
            />
            <div className="field">
              <label>MODEL_PROVIDER</label>
              <select className="select" value={draft.MODEL_PROVIDER} onChange={(event) => set("MODEL_PROVIDER", event.target.value)}>
                <option value="">auto — first key found</option>
                <option value="openai">openai</option>
                <option value="anthropic">anthropic</option>
                <option value="google-gemini">google-gemini</option>
              </select>
            </div>
            <div className="field">
              <label>MODEL_ID</label>
              <input
                className="input"
                value={draft.MODEL_ID}
                placeholder="leave unset — a sensible mid-tier model is picked"
                onChange={(event) => set("MODEL_ID", event.target.value)}
              />
            </div>
          </div>
        </div>
      </Tilt>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* ------------------------------------------------ github */}
        <Tilt strength={4}>
          <div className="panel brackets" style={{ padding: 26 }}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <h3 className="display" style={{ fontSize: 18, margin: 0 }}>GitHub</h3>
              <span className="chip">{draft.GITHUB_TOKEN ? "configured" : "not configured"}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 18 }}>
              <SecretField
                label="GITHUB_TOKEN"
                hint="Fine-grained PAT · Contents + Pull requests read/write · scope it to the repos you want touched"
                value={draft.GITHUB_TOKEN}
                onChange={(value) => set("GITHUB_TOKEN", value)}
                placeholder="github_pat_…"
              />
              <div className="field">
                <label>SENTINEL_TARGET_REPO</label>
                <input
                  className="input"
                  value={draft.SENTINEL_TARGET_REPO}
                  placeholder="owner/name — the default mission target"
                  onChange={(event) => set("SENTINEL_TARGET_REPO", event.target.value)}
                />
              </div>
              <div className="row" style={{ alignItems: "center", gap: 10 }}>
                <Btn style={{ padding: "10px 16px" }} onClick={testGithub} disabled={githubTest.status === "running"}>
                  {githubTest.status === "running" ? "Testing…" : "Test token"}
                </Btn>
                {githubTest.detail !== undefined && (
                  <span className="small" style={{ color: githubTest.status === "ok" ? "#fff" : "var(--ink-dim)" }}>
                    {githubTest.detail}
                  </span>
                )}
              </div>
            </div>
          </div>
        </Tilt>

        {/* ----------------------------------------------- daytona */}
        <Tilt strength={4}>
          <div className="panel brackets" style={{ padding: 26 }}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <h3 className="display" style={{ fontSize: 18, margin: 0 }}>Daytona sandbox</h3>
              <span className="chip">{draft.DAYTONA_API_KEY ? "configured" : "patches unverified"}</span>
            </div>
            <p className="muted small" style={{ lineHeight: 1.7, margin: "12px 0 0" }}>
              Without a sandbox key the agent is instructed to report every patch as{" "}
              <strong style={{ color: "#fff" }}>UNVERIFIED</strong> — it never guesses that a fix works. With one,
              the verify stage provisions a real sandbox, installs, and runs the test suite.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 18 }}>
              <SecretField
                label="DAYTONA_API_KEY"
                hint="Free tier: daytona.io · used for this request only, never stored server-side"
                value={draft.DAYTONA_API_KEY}
                onChange={(value) => set("DAYTONA_API_KEY", value)}
                placeholder="dtn_…"
              />
              <div className="row" style={{ alignItems: "center", gap: 10 }}>
                <Btn style={{ padding: "10px 16px" }} onClick={testDaytona} disabled={daytonaTest.status === "running"}>
                  {daytonaTest.status === "running" ? "Testing…" : "Test key"}
                </Btn>
                {daytonaTest.detail !== undefined && (
                  <span className="small" style={{ color: daytonaTest.status === "ok" ? "#fff" : "var(--ink-dim)" }}>
                    {daytonaTest.detail}
                  </span>
                )}
              </div>
            </div>
          </div>
        </Tilt>

        {/* ---------------------------------------------- harness */}
        <Tilt strength={4}>
          <div className="panel brackets" style={{ padding: 26 }}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <h3 className="display" style={{ fontSize: 18, margin: 0 }}>TrueForge harness</h3>
              <span className="chip">{draft.TRUEFORGE_URL || server?.harnessUrl ? "url set" : "default 127.0.0.1:8790"}</span>
            </div>
            <p className="muted small" style={{ lineHeight: 1.7, margin: "12px 0 0" }}>
              The agent loop, context management, subagents and approvals all live in the harness. Point the console
              at a running TrueForge instance — the server probes it, so browser CORS never blocks the attempt.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 18 }}>
              <div className="field">
                <label>TRUEFORGE_URL</label>
                <input
                  className="input"
                  value={draft.TRUEFORGE_URL}
                  placeholder="http://127.0.0.1:8790"
                  onChange={(event) => set("TRUEFORGE_URL", event.target.value)}
                />
              </div>
              <div className="row" style={{ alignItems: "center", gap: 10 }}>
                <Btn style={{ padding: "10px 16px" }} onClick={testHarness} disabled={harnessTest.status === "running"}>
                  {harnessTest.status === "running" ? "Probing…" : "Probe harness"}
                </Btn>
                {harnessTest.detail !== undefined && (
                  <span className="small muted">{harnessTest.detail}</span>
                )}
              </div>
            </div>
          </div>
        </Tilt>

        {/* ------------------------------------------------ safety */}
        <div className="panel" style={{ padding: 26, borderColor: draft.SENTINEL_ALLOW_REMOTE_WRITES ? "var(--line)" : "rgba(255,255,255,0.55)" }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <h3 className="display" style={{ fontSize: 18, margin: 0 }}>SENTINEL_ALLOW_REMOTE_WRITES</h3>
            <button
              className="switch"
              data-on={draft.SENTINEL_ALLOW_REMOTE_WRITES}
              aria-label="Toggle remote writes"
              onClick={() => set("SENTINEL_ALLOW_REMOTE_WRITES", !draft.SENTINEL_ALLOW_REMOTE_WRITES)}
            />
          </div>
          <p className="muted small" style={{ lineHeight: 1.7, margin: "12px 0 0" }}>
            The hard kill switch. Off (shown bright) means destructive tools refuse{" "}
            <strong style={{ color: "#fff" }}>before any network call</strong>, regardless of what the model or the
            approval UI says. {server?.serverKillSwitch === "off" && " The server-side switch is also OFF — it overrides this browser."}
          </p>
        </div>

        {/* ------------------------------------------------- save */}
        <div className="row" style={{ alignItems: "center" }}>
          <Btn variant="primary" onClick={save} disabled={!dirty} style={{ padding: "13px 24px" }}>
            {dirty ? "Save vault" : "Saved"}
          </Btn>
          <Btn variant="ghost" onClick={wipeVault} style={{ padding: "13px 20px" }}>
            Wipe all keys
          </Btn>
          <span className="faint small">Keys never leave this browser except to this app's own proxy routes.</span>
        </div>
      </div>
    </div>
  );
}
