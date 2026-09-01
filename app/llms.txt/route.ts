import { renderAgentDigest } from "@/lib/docs-corpus";
import { PROTOCOL_SUPPORTED, SERVER_INFO, toolList } from "@/lib/mcp-server";

export const dynamic = "force-dynamic";

/**
 * llms.txt — the agent-facing table of contents, built from the same corpus the
 * `search_docs` / `fetch_docs` tools read, so a crawler, a chat agent and the
 * MCP client can never be told three different stories.
 *
 * GET /llms.txt  (also served from the MCP endpoint with Accept: text/plain)
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = `${url.protocol}//${url.host}`;
  const tools = toolList(process.env).map((tool) => ({ name: tool.name, description: tool.description }));
  const body = [
    renderAgentDigest(`${origin}/api/mcp`, tools),
    "---",
    "",
    `server: ${SERVER_INFO.title} (${SERVER_INFO.name} v${SERVER_INFO.version})`,
    `mcp: ${origin}/api/mcp [streamable-http, protocols ${PROTOCOL_SUPPORTED.join(", ")}]`,
    `webmcp: document.modelContext (${tools.length} + 17 OMNI-LAB tools registered in-page)`,
    `status: ${origin}/api/status`,
    `docs: ${origin}/docs`,
    `console: ${origin}/app`,
    "",
  ].join("\n");

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=600",
    },
  });
}
