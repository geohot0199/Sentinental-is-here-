import { NextResponse } from "next/server";
import { PASSAGES, searchPassages } from "@/lib/docs-corpus";

export const dynamic = "force-dynamic";

/**
 * The documentation corpus, for agents and for the in-page `search_docs` /
 * `fetch_docs` WebMCP tools. GET ?q=<terms>&limit=<n> searches; GET ?id=<id>
 * reads one passage; a bare GET lists everything.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const query = url.searchParams.get("q");

  if (id !== null) {
    const passage = PASSAGES.find((entry) => entry.id === id);
    if (passage === undefined) {
      return NextResponse.json(
        { error: `No passage with id '${id}'.`, available: PASSAGES.map((entry) => entry.id) },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, ...passage });
  }

  if (query !== null) {
    const limit = Number(url.searchParams.get("limit") ?? 6);
    const hits = searchPassages(query, Number.isFinite(limit) ? limit : 6);
    return NextResponse.json({ ok: true, query, hits });
  }

  return NextResponse.json({
    ok: true,
    passages: PASSAGES.map((passage) => ({ id: passage.id, title: passage.title, kind: passage.kind })),
  });
}
