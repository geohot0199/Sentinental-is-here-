"use client";

/**
 * The Bridge station — everything an agent needs to drive SENTINEL, in one
 * place, with the checks to prove it works.
 *
 * Left column: what to paste into ChatGPT / Claude / Cursor, and the curl that
 * proves the endpoint answers. Right column: the live conformance run and a
 * playground that issues a real JSON-RPC tools/call through the same code path
 * an external MCP client uses.
 */
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { Btn } from "@/components/interactive";
import { bridgeTools } from "@/lib/webmcp";
import { probeRemote, type RemoteProbe } from "@/lib/agent-bridge";
import BridgeCheck from "./BridgeCheck";
import type { ConsoleContext } from "@/app/app/page";

type Row = { name: string; title?: string; description: string; annotations?: Record<string, boolean> };

function CopyButton({ text, onNotify }: { text: string; onNotify: (message: string) => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="chip"
      style={{ cursor: "pointer" }}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          onNotify("Copied to the clipboard.");
          window.setTimeout(() => setCopied(false), 1600);
        } catch {
          onNotify("Clipboard blocked by the browser — select and copy manually.");
        }
      }}
    >
      {copied ? "copied" : "copy"}
    </button>
  );
}

function Snippet({ label, note, code, onNotify }: { label: string; note: string; code: string; onNotify: (m: string) => void }) {
  return (
    <div className="panel pad-sm" style={{ marginBottom: 12 }}>
      <div className="h-row" style={{ alignItems: "center", gap: 10 }}>
        <span className="mono" style={{ fontSize: 12, fontWeight: 600 }}>{label}</span>
        <CopyButton text={code} onNotify={onNotify} />
      </div>
      <p className="muted small" style={{ margin: "6px 0 10px", lineHeight: 1.6 }}>{note}</p>
      <div className="code-block">
        <pre>{code}</pre>
      </div>
    </div>
  );
}

export default function Bridge({ context }: { context: ConsoleContext }) {
  const { push } = context;
  const [origin, setOrigin] = useState("");
  const [remote, setRemote] = useState<RemoteProbe | null>(null);
  const [localTools, setLocalTools] = useState<{ name: string; description: string }[]>([]);
  const [selected, setSelected] = useState("get_project_status");
  const [args, setArgs] = useState('{\n  "query": "approval gate"\n}');
  const [exchange, setExchange] = useState<{ request: string; response: string; ms: number } | null>(null);
  const [calling, setCalling] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
    void probeRemote().then(setRemote);
    void bridgeTools().then((tools) =>
      setLocalTools(tools.map((tool) => ({ name: tool.name, description: tool.description }))),
    );
  }, []);

  const endpoint = `${origin}/api/mcp`;

  const allRows = useMemo<Row[]>(() => {
    const seen = new Set<string>();
    const rows: Row[] = [];
    for (const tool of remote?.tools ?? []) {
      seen.add(tool.name);
      rows.push(tool as Row);
    }
    for (const tool of localTools) {
      if (seen.has(tool.name)) continue;
      rows.push({ ...tool, annotations: undefined });
    }
    return rows;
  }, [remote, localTools]);

  const callOverBridge = useCallback(async () => {
    setCalling(true);
    const startedAt = performance.now();
    let parsed: Record<string, unknown> = {};
    try {
      parsed = args.trim().length === 0 ? {} : (JSON.parse(args) as Record<string, unknown>);
    } catch (cause) {
      setExchange({
        request: "—",
        response: `arguments are not valid JSON: ${cause instanceof Error ? cause.message : "parse error"}`,
        ms: 0,
      });
      setCalling(false);
      return;
    }
    const request = {
      jsonrpc: "2.0",
      id: `bridge-${Date.now()}`,
      method: "tools/call",
      params: {
        name: selected,
        arguments: parsed,
        _meta: {
          "io.modelcontextprotocol/protocolVersion": "2026-07-28",
          "io.modelcontextprotocol/clientInfo": { name: "sentinel-bridge-station", version: "1.0.0" },
          "io.modelcontextprotocol/clientCapabilities": {},
        },
      },
    };
    try {
      const response = await fetch("/api/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "mcp-protocol-version": "2026-07-28",
          "mcp-method": "tools/call",
          "mcp-name": selected,
        },
        body: JSON.stringify(request),
      });
      const text = await response.text();
      setExchange({
        request: JSON.stringify(request, null, 2),
        response: `HTTP ${response.status}\n${pretty(text)}`,
        ms: Math.round(performance.now() - startedAt),
      });
      push(`tools/call ${selected} → HTTP ${response.status}`, response.ok ? "ok" : "warn");
    } catch (cause) {
      setExchange({ request: JSON.stringify(request, null, 2), response: String(cause), ms: 0 });
      push("The call did not complete.", "alert");
    } finally {
      setCalling(false);
    }
  }, [args, push, selected]);

  const snippets = useMemo(
    () => ({
      chatgpt: [
        "ChatGPT → Settings → Apps & Connectors → Advanced → Developer mode: on",
        "Then Apps & Connectors → Create → paste the URL below.",
        "Transport: Streamable HTTP · Auth: No authentication",
        "",
        endpoint,
      ].join("\n"),
      claude: `claude mcp add --transport http sentinel ${endpoint}`,
      cursor: JSON.stringify({ mcpServers: { sentinel: { url: endpoint } } }, null, 2),
      curl: [
        `curl -s ${endpoint} \\`,
        "  -H 'content-type: application/json' \\",
        "  -H 'mcp-protocol-version: 2026-07-28' \\",
        "  -H 'mcp-method: server/discover' \\",
        `  -d '{"jsonrpc":"2.0","id":1,"method":"server/discover","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientInfo":{"name":"curl","version":"0"},"io.modelcontextprotocol/clientCapabilities":{}}}}'`,
      ].join("\n"),
    }),
    [endpoint],
  );

  return (
    <div className="grid-2" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 18, alignItems: "start" }}>
      <div>
        <div className="panel brackets pad-md" style={{ marginBottom: 14 }}>
          <div className="h-row">
            <span className="kicker">Endpoint</span>
            <span className={`chip ${remote === null ? "" : remote.reachable ? "chip-green" : "chip-red"}`}>
              {remote === null ? "probing…" : remote.reachable ? "answering" : "not answering"}
            </span>
          </div>
          <p className="mono" style={{ fontSize: 13.5, margin: "12px 0 0", wordBreak: "break-all" }}>{endpoint}</p>
          <p className="muted small" style={{ margin: "10px 0 0", lineHeight: 1.65 }}>
            One URL, every client. Stateless Streamable HTTP — protocol{" "}
            <code className="mono">{remote?.protocolVersions[0] ?? "2026-07-28"}</code>, with the legacy{" "}
            <code className="mono">initialize</code> handshake still served for older clients.
            {remote?.cache?.ttlMs !== undefined && remote?.cache?.ttlMs !== null ? (
              <>
                {" "}Lists are cacheable for <code className="mono">{remote.cache.ttlMs} ms</code> (
                <code className="mono">cacheScope: {remote.cache.cacheScope}</code>).
              </>
            ) : null}
          </p>
          <div className="row" style={{ gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            <span className="chip">{remote?.toolCount ?? 0} tools</span>
            <span className="chip">{remote?.protocolVersions.length ?? 0} protocol versions</span>
            <span className="chip">{remote?.error === null ? "no auth required" : `auth: bearer`}</span>
          </div>
        </div>

        <Snippet label="ChatGPT" note="Developer mode is a hard prerequisite on Plus/Pro. Business and Enterprise workspaces can publish it org-wide." code={snippets.chatgpt} onNotify={push} />
        <Snippet label="Claude / Claude Code" note="Also works in Claude.ai's Connectors panel with the same URL." code={snippets.claude} onNotify={push} />
        <Snippet label="Cursor / Windsurf / any mcp.json client" note="Drop this into the project's mcp.json." code={snippets.cursor} onNotify={push} />
        <Snippet label="Raw check" note="Paste into a terminal. A correct answer is a supportedVersions array." code={snippets.curl} onNotify={push} />

        <div className="panel pad-md">
          <span className="kicker">What ChatGPT sees in a tab</span>
          <p className="muted small" style={{ margin: "12px 0 0", lineHeight: 1.7 }}>
            The page registers <code className="mono">{localTools.length}</code> tools on{" "}
            <code className="mono">document.modelContext</code>. ChatGPT&apos;s built-in browser (desktop app) and
            ChatGPT Sites read that surface directly — no connector, no install. Chrome needs the WebMCP origin
            trial; Firefox and Safari have no implementation yet, so the remote endpoint is the portable door.
          </p>
          <p className="muted small" style={{ margin: "10px 0 0", lineHeight: 1.7 }}>
            Destructive tools are not registered in a tab at all.{" "}
            <code className="mono">open_pull_request</code> only exists on the bridge, refuses without{" "}
            <code className="mono">SENTINEL_ALLOW_REMOTE_WRITES=true</code>, and then still demands the exact
            confirmation string from a human.
          </p>
        </div>
      </div>

      <div>
        <BridgeCheck deep />

        <div className="panel brackets pad-md" style={{ marginTop: 14 }}>
          <div className="h-row" style={{ alignItems: "center", gap: 12 }}>
            <span className="kicker">Playground</span>
            <span className="muted small">a real tools/call, framed exactly as a client would</span>
          </div>
          <div className="grid-2" style={{ gap: 12, marginTop: 14 }}>
            <div className="field">
              <label htmlFor="bridge-tool">tool</label>
              <select id="bridge-tool" className="select" value={selected} onChange={(event) => setSelected(event.target.value)}>
                {allRows.map((row) => (
                  <option key={row.name} value={row.name}>
                    {row.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="bridge-args">arguments</label>
              <textarea id="bridge-args" className="textarea" style={{ minHeight: 88 }} value={args} onChange={(event) => setArgs(event.target.value)} spellCheck={false} />
            </div>
          </div>
          <div className="row" style={{ gap: 10, marginTop: 12, alignItems: "center" }}>
            <Btn variant="primary" className="btn-md" onClick={() => void callOverBridge()} disabled={calling}>
              {calling ? "calling…" : "Call over MCP"}
            </Btn>
            <Btn className="btn-md" onClick={() => setExchange(null)}>
              clear
            </Btn>
            {selected === "search_docs" ? (
              <span className="faint small">try query: kill switch</span>
            ) : null}
          </div>
          {exchange !== null ? (
            <div className="term" style={{ marginTop: 14, maxHeight: 320, overflow: "auto" }}>
              <div className="term-line">
                <span className="who">request</span>
                <span className="term-narration">POST /api/mcp · {exchange.ms} ms</span>
              </div>
              <pre style={{ whiteSpace: "pre-wrap", margin: "8px 0 0", fontSize: 11.5 }}>{exchange.request}</pre>
              <div className="term-line" style={{ marginTop: 10 }}>
                <span className="who">response</span>
              </div>
              <pre style={{ whiteSpace: "pre-wrap", margin: "8px 0 0", fontSize: 11.5 }}>{exchange.response}</pre>
            </div>
          ) : null}
        </div>

        <div className="panel brackets" style={{ padding: 8, marginTop: 14 }}>
          <div className="toolbar">
            <span className="dot" />
            <span className="dot" />
            <span className="dot active" />
            <span className="title">the contract an agent reads</span>
          </div>
          <div className="panel-scroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th>tool</th>
                  <th>annotations</th>
                </tr>
              </thead>
              <tbody>
                {allRows.map((row) => (
                  <tr key={row.name}>
                    <td className="mono tool-name nowrap">{row.name}</td>
                    <td className="muted small">
                      {row.annotations === undefined ? (
                        <span className="chip">in-page only</span>
                      ) : (
                        Object.entries(row.annotations)
                          .filter(([, value]) => value === true)
                          .map(([key]) => key)
                          .join(" · ") || "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function pretty(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

