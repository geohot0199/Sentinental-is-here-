import { NextResponse } from "next/server";
import { GitHubClient, parseRepo, remediationBranchName } from "@/lib/github";
import { httpRequest } from "@/lib/http";

const API = "https://api.github.com";
import { toSentinelError } from "@/lib/errors";

export const dynamic = "force-dynamic";

/**
 * GitHub proxy. The browser never holds the network path — every credentialed
 * call happens here, and the token is used for this request only. Nothing is
 * persisted server-side.
 *
 * POST { action, token, ... }
 *   action "repo"     → { repo }            read repo metadata + package.json + lockfile
 *   action "open-pr"  → { repo, ... }       branch + commit + open pull request
 *                                            (destructive: re-checks the kill switch here,
 *                                             AFTER the approval gate already asked the human)
 */

function serverWritesAllowed(): boolean {
  const flag = process.env.SENTINEL_ALLOW_REMOTE_WRITES;
  return flag === undefined ? true : flag !== "false";
}

function readToken(input: { token?: unknown }): string | null {
  const token = input.token;
  return typeof token === "string" && token.length > 0 ? token : null;
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action : "";
  const token = readToken(body);
  if (token === null) {
    return NextResponse.json(
      { error: "GitHub access is not configured.", remedy: "Add a GITHUB_TOKEN in the key vault." },
      { status: 400 },
    );
  }

  // The server-side kill switch overrides whatever the browser claims.
  const allowWrites = serverWritesAllowed() && body.allowRemoteWrites !== false;
  const github = new GitHubClient(token, allowWrites);

  try {
    if (action === "check") {
      // Token sanity check — /user with the supplied token, nothing persisted.
      const result = await httpRequest(`${API}/user`, { headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "user-agent": "sentinel-strike-team",
        "x-github-api-version": "2022-11-28",
      }, retries: 0 });
      if (result.ok) {
        const user = JSON.parse(result.text) as { login?: string };
        return NextResponse.json({ ok: true, detail: `Token valid for @${user.login ?? "unknown"}.` });
      }
      return NextResponse.json({
        ok: false,
        detail: `GitHub rejected the token (HTTP ${result.status}). ${result.status === 401 ? "Check the value — fine-grained PATs need Contents + Pull requests read/write." : ""}`,
      });
    }

    if (action === "repo") {
      const ref = parseRepo(String(body.repo ?? ""));
      const info = await github.getRepo(ref);
      const packageJson = await github.getFile(ref, "package.json");
      const lockfile = await github.getFile(ref, "package-lock.json");
      return NextResponse.json({
        repo: `${ref.owner}/${ref.repo}`,
        defaultBranch: info.defaultBranch,
        private: info.private,
        packageJson,
        lockfile,
        lockfileName: lockfile === null ? null : "package-lock.json",
      });
    }

    if (action === "open-pr") {
      // Belt and braces: the destructive handler re-checks the kill switch
      // itself, before any network call — exactly like src/mcp/tools/open-pull-request.ts.
      if (!serverWritesAllowed()) {
        return NextResponse.json(
          {
            error: "Opening a pull request is blocked: SENTINEL is running in read-only mode.",
            remedy: "Set SENTINEL_ALLOW_REMOTE_WRITES=true to permit remote writes.",
          },
          { status: 403 },
        );
      }
      const ref = parseRepo(String(body.repo ?? ""));
      const title = typeof body.title === "string" && body.title.length > 0 ? body.title : "fix(deps): security patch";
      const content = typeof body.content === "string" ? body.content : null;
      if (content === null) {
        return NextResponse.json({ error: "content (patched package.json) is required." }, { status: 400 });
      }
      const prBody = typeof body.prBody === "string" ? body.prBody : "";

      const repoInfo = await github.getRepo(ref);
      const base = repoInfo.defaultBranch;

      // We generate the branch name; the model never supplies a ref.
      const branch = remediationBranchName(title);
      await github.createBranch(ref, branch, base);
      await github.putFile(ref, "package.json", content, `fix(deps): ${title}`, branch);
      const pr = await github.createPullRequest(ref, {
        title,
        body: prBody,
        head: branch,
        base,
      });

      return NextResponse.json({
        ok: true,
        branch,
        base,
        number: pr.number,
        url: pr.url,
        text: `Pull request #${pr.number} opened against ${base}: ${pr.url}`,
      });
    }

    return NextResponse.json({ error: `Unknown action "${action}".` }, { status: 400 });
  } catch (cause) {
    const error = toSentinelError(cause);
    return NextResponse.json(
      { error: error.message, remedy: error.remedy ?? null, code: error.code },
      { status: error.code === "invalid_input" ? 400 : error.code === "forbidden" ? 403 : 502 },
    );
  }
}
