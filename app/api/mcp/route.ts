import { NextResponse } from "next/server";
import { AGENT_INSTRUCTIONS, PROTOCOL_SUPPORTED, SERVER_INFO, handleRpc, toolList, authRequired } from "@/lib/mcp-server";
import { renderAgentDigest } from "@/lib/docs-corpus";

export const dynamic = "force-dynamic";

/**
 * The MCP endpoint — one URL for ChatGPT (Developer-mode connector or the
 * built-in browser via WebMCP), Claude, Cursor, Claude Code, Gemini CLI, Zed,
 * VS Code, or any client that speaks Streamable HTTP.
 *
 *   POST   /api/mcp   JSON-RPC 2.0 (server/discover, tools/list, tools/call,
 *                     resources/*, prompts/*, and the legacy initialize
 *                     handshake for clients that still need it)
 *   GET    /api/mcp   human/agent-readable connection card (405 if you asked
 *                     for an SSE stream, since 2026-07-28 removed GET streams)
 *   OPTIONS/api/mcp   CORS preflight for browser-based clients
 *   DELETE /api/mcp   405 — protocol-level sessions no longer exist
 */

const SSE_TOKENS = /text\/event-stream/i;

function cors(requestedHeaders: string | null) {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "POST, GET, OPTIONS, DELETE",
    "access-control-allow-headers":
      requestedHeaders ?? "content-type, authorization, mcp-protocol-version, mcp-method, mcp-name, mcp-param-name, last-event-id",
    "access-control-expose-headers": "mcp-protocol-version, www-authenticate",
    "access-control-max-age": "600",
  };
}

function headersFromRequest(request: Request): Record<string, string> {
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });
  return headers;
}

export async function POST(request: Request) {
  const bodyText = await request.text();
  const result = await handleRpc({
    url: request.url,
    method: "POST",
    headers: headersFromRequest(request),
    bodyText,
  });

  const headers: Record<string, string> = { ...result.headers };
  if (headers["content-type"] === "application/json") {
    headers["content-type"] = "application/json; charset=utf-8";
  }
  return new NextResponse(result.body, { status: result.status, headers });
}

export async function GET(request: Request) {
  const accept = request.headers.get("accept") ?? "";
  if (SSE_TOKENS.test(accept) && !/application\/json|text\/html|\*\/\*/.test(accept)) {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        error: {
          code: -32600,
          message: "GET streams were removed in protocol version 2026-07-28. POST JSON-RPC to this endpoint instead.",
        },
      },
      { status: 405, headers: { "www-authenticate": "" } },
    );
  }

  const url = new URL(request.url);
  const origin = `${url.protocol}//${url.host}`;
  const wantsText = /text\/plain|\/markdown/.test(accept);
  const tools = toolList(process.env).map((tool) => ({ name: tool.name, description: tool.description }));

  if (wantsText) {
    return new NextResponse(renderAgentDigest(`${origin}/api/mcp`, tools), {
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  }

  return NextResponse.json(
    {
      name: SERVER_INFO.title,
      serverInfo: SERVER_INFO,
      mcpEndpoint: `${origin}/api/mcp`,
      transport: "Streamable HTTP (stateless, JSON-RPC 2.0 over POST)",
      protocolVersions: PROTOCOL_SUPPORTED,
      auth: authRequired(process.env) ? "bearer" : "none",
      tools,
      instructions: AGENT_INSTRUCTIONS,
      webmcp: {
        surface: "document.modelContext",
        alias: "navigator.modelContext",
        note: "The same tools are registered in-page for browsers with WebMCP (Chrome 149+ origin trial; ChatGPT desktop built-in browser).",
      },
      howToConnect: {
        chatgpt: "Settings → Apps & Connectors → Advanced → Developer mode → Create → paste this URL (Streamable HTTP, No authentication). Or open the site in the desktop app's built-in browser and ask ChatGPT to use the site tools.",
        claude: "claude mcp add --transport http sentinel <this URL>",
        cursor: JSON.stringify({ mcpServers: { sentinel: { url: `${origin}/api/mcp` } } }),
        codex: `codex mcp add sentinel --url ${origin}/api/mcp`,
        verify: `curl -s ${origin}/api/mcp -H 'content-type: application/json' -H 'mcp-protocol-version: 2026-07-28' -H 'mcp-method: server/discover' -d '{"jsonrpc":"2.0","id":1,"method":"server/discover","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientInfo":{"name":"curl","version":"0"},"io.modelcontextprotocol/clientCapabilities":{}}}}'`,
      },
    },
    { headers: { "cache-control": "public, max-age=60" } },
  );
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors(null) });
}

export async function DELETE() {
  return NextResponse.json(
    {
      jsonrpc: "2.0",
      error: {
        code: -32600,
        message: "Protocol-level sessions were removed in 2026-07-28; there is nothing to terminate.",
      },
    },
    { status: 405, headers: { allow: "GET, POST, OPTIONS" } },
  );
}
