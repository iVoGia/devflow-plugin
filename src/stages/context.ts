import { promises as fs } from "node:fs";
import path from "node:path";
import { extractJson } from "../agent/index.js";
import { exists } from "../util/fsx.js";
import { logger } from "../logger.js";
import type { Stage, StageContext } from "./types.js";

/**
 * Context stage: gathers official library docs (Context7 REST API) and the set
 * of existing files relevant to the request, then persists them for the coding
 * stage.
 */
export const contextStage: Stage = {
  id: "context",
  title: "Context7 + Existing Code",
  enabled: (c) => c.stages.context.enabled,

  async run(ctx) {
    const libs = await detectLibraries(ctx);
    const docs: string[] = [];

    if (ctx.config.context7.enabled && libs.length > 0) {
      logger.step(`Fetching official docs for: ${libs.join(", ")}`);
      for (const lib of libs.slice(0, 5)) {
        const doc = await fetchContext7(ctx, lib);
        if (doc) docs.push(`### ${lib}\n\n${doc}`);
      }
    } else if (!process.env.CONTEXT7_API_KEY) {
      logger.debug("CONTEXT7_API_KEY not set; docs fetch may be rate-limited.");
    }

    // Ask the agent to identify the most relevant existing files.
    logger.step("Identifying relevant existing files");
    const filesResponse = await ctx.agent.prompt(
      `List up to 15 existing files in this repository that are most relevant to implementing the request below. Respond with ONLY a JSON array of repo-relative paths.\n\nRequest:\n"""\n${ctx.request}\n"""`,
      { cwd: ctx.cwd, timeoutMs: 3 * 60_000 },
    );
    const relevant = (extractJson<string[]>(filesResponse) ?? []).filter(
      (p) => typeof p === "string",
    );

    const contextDoc = [
      docs.length ? `# Official Documentation (Context7)\n\n${docs.join("\n\n")}` : "",
      relevant.length ? `# Relevant Files\n\n${relevant.map((f) => `- ${f}`).join("\n")}` : "",
    ]
      .filter(Boolean)
      .join("\n\n---\n\n");

    const out = path.join(ctx.runDir, "context.md");
    await fs.writeFile(out, contextDoc || "(no context gathered)", "utf8");

    return {
      status: "passed",
      message: `Gathered ${docs.length} doc set(s), ${relevant.length} relevant file(s).`,
      artifacts: [path.relative(ctx.cwd, out)],
      data: { contextDocs: contextDoc, relevantFiles: relevant },
    };
  },
};

/** Detects candidate libraries from package.json / requirements files. */
async function detectLibraries(ctx: StageContext): Promise<string[]> {
  const libs = new Set<string>();

  const pkgPath = path.join(ctx.cwd, "package.json");
  if (await exists(pkgPath)) {
    try {
      const pkg = JSON.parse(await fs.readFile(pkgPath, "utf8")) as {
        dependencies?: Record<string, string>;
      };
      for (const name of Object.keys(pkg.dependencies ?? {})) libs.add(name);
    } catch {
      /* ignore malformed package.json */
    }
  }

  const reqPath = path.join(ctx.cwd, "requirements.txt");
  if (await exists(reqPath)) {
    const raw = await fs.readFile(reqPath, "utf8");
    for (const line of raw.split("\n")) {
      const name = line.split(/[=<>~!\s]/)[0]?.trim();
      if (name && !name.startsWith("#")) libs.add(name);
    }
  }

  return [...libs];
}

/** Calls the Context7 REST v2 API to fetch docs for a library name. */
async function fetchContext7(
  ctx: StageContext,
  library: string,
): Promise<string | null> {
  const base = ctx.config.context7.baseUrl.replace(/\/$/, "");
  const key = process.env.CONTEXT7_API_KEY;
  const headers: Record<string, string> = {};
  if (key) headers.authorization = `Bearer ${key}`;

  try {
    // Resolve library name -> id.
    const searchUrl = `${base}/libs/search?libraryName=${encodeURIComponent(library)}`;
    const searchRes = await fetch(searchUrl, { headers });
    if (!searchRes.ok) return null;
    const search = (await searchRes.json()) as {
      results?: { id?: string; libraryId?: string }[];
    };
    const id =
      search.results?.[0]?.libraryId ?? search.results?.[0]?.id ?? `/${library}`;

    const docUrl = `${base}/context?libraryId=${encodeURIComponent(id)}&query=${encodeURIComponent(ctx.request)}&type=txt`;
    const docRes = await fetch(docUrl, { headers });
    if (!docRes.ok) return null;
    const text = await docRes.text();
    return text.slice(0, 6000);
  } catch (err) {
    logger.debug(`context7 fetch failed for ${library}: ${String(err)}`);
    return null;
  }
}
