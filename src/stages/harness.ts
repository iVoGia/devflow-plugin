import { promises as fs } from "node:fs";
import path from "node:path";
import { logger } from "../logger.js";
import type { Stage } from "./types.js";

const KNOWLEDGE_FILES = [
  "business.md",
  "architecture.md",
  "coding-rules.md",
];

/**
 * Repository Harness (Knowledge Layer): loads the project's business context,
 * architecture and coding rules so downstream stages can inject them.
 */
export const harnessStage: Stage = {
  id: "harness",
  title: "Repository Harness (Knowledge Layer)",
  enabled: (c) => c.stages.harness.enabled,

  async run(ctx) {
    const dir = path.isAbsolute(ctx.config.knowledgeDir)
      ? ctx.config.knowledgeDir
      : path.join(ctx.cwd, ctx.config.knowledgeDir);

    const sections: string[] = [];
    const loaded: string[] = [];

    for (const file of KNOWLEDGE_FILES) {
      const full = path.join(dir, file);
      try {
        const content = await fs.readFile(full, "utf8");
        sections.push(`## ${file}\n\n${content.trim()}`);
        loaded.push(file);
      } catch {
        logger.debug(`knowledge file missing: ${file}`);
      }
    }

    if (loaded.length === 0) {
      return {
        status: "skipped",
        message: `No knowledge files under ${ctx.config.knowledgeDir}. Run \`devflow init\` to scaffold them.`,
        gate: false,
      };
    }

    const knowledge = sections.join("\n\n---\n\n");
    // Persist the assembled knowledge for auditing.
    const out = path.join(ctx.runDir, "knowledge.md");
    await fs.writeFile(out, knowledge, "utf8");

    return {
      status: "passed",
      message: `Loaded ${loaded.length} knowledge file(s): ${loaded.join(", ")}`,
      artifacts: [path.relative(ctx.cwd, out)],
      data: { knowledge },
    };
  },
};
