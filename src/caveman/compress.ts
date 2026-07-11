import { promises as fs } from "node:fs";
import path from "node:path";
import type { AgentBackend } from "../agent/types.js";
import type { DevflowConfig } from "../config.js";
import { logger } from "../logger.js";
import { exists } from "../util/fsx.js";

const MIN_CONTENT_CHARS = 200;

const COMPRESS_SYSTEM = `Compress natural-language prose to terse caveman-style while preserving all technical substance.
Rules:
- Keep code blocks, file paths, URLs, API names, and commands byte-exact.
- Compress only prose sections; if mixed prose+code, compress prose only.
- Output the full file content in Markdown, nothing else.
- Do not add preamble or explanation.`;

export interface CompressResult {
  path: string;
  ok: boolean;
  message: string;
  skipped?: boolean;
}

/** Compress one knowledge markdown file; backs up to <name>.original.md first. */
export async function compressKnowledgeFile(
  filePath: string,
  agent: AgentBackend,
): Promise<CompressResult> {
  const rel = path.basename(filePath);
  if (rel.endsWith(".original.md")) {
    return { path: filePath, ok: true, message: "skipped backup file", skipped: true };
  }

  let content: string;
  try {
    content = await fs.readFile(filePath, "utf8");
  } catch {
    return { path: filePath, ok: false, message: "not readable" };
  }

  const stripped = content.replace(/>\s*Fill this in[^\n]*/gi, "").trim();
  if (stripped.length < MIN_CONTENT_CHARS) {
    return {
      path: filePath,
      ok: true,
      message: "skipped (template or too short)",
      skipped: true,
    };
  }

  const backupPath = filePath.replace(/\.md$/, ".original.md");
  if (!(await exists(backupPath))) {
    await fs.writeFile(backupPath, content, "utf8");
  }

  try {
    const compressed = await agent.prompt(
      `Compress this knowledge file:\n\n"""\n${content}\n"""`,
      { system: COMPRESS_SYSTEM, timeoutMs: 5 * 60_000 },
    );
    if (!compressed.trim()) {
      return { path: filePath, ok: false, message: "empty compression result" };
    }
    await fs.writeFile(filePath, compressed.trim() + "\n", "utf8");
    return { path: filePath, ok: true, message: "compressed" };
  } catch (err) {
    return {
      path: filePath,
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Compress all knowledge harness files when caveman is enabled. */
export async function compressKnowledgeDir(
  cwd: string,
  config: DevflowConfig,
  agent: AgentBackend,
): Promise<CompressResult[]> {
  if (!config.caveman.enabled || !config.caveman.compressKnowledge) {
    return [];
  }

  const dir = path.isAbsolute(config.knowledgeDir)
    ? config.knowledgeDir
    : path.join(cwd, config.knowledgeDir);

  let files: string[];
  try {
    files = (await fs.readdir(dir)).filter((f) => f.endsWith(".md"));
  } catch {
    return [];
  }

  const results: CompressResult[] = [];
  for (const file of files) {
    const full = path.join(dir, file);
    const result = await compressKnowledgeFile(full, agent);
    results.push(result);
    if (result.skipped) {
      logger.debug(`${file}: ${result.message}`);
    } else if (result.ok) {
      logger.success(`Compressed ${file}`);
    } else {
      logger.warn(`Could not compress ${file}: ${result.message}`);
    }
  }
  return results;
}
