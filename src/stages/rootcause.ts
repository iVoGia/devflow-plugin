import { promises as fs } from "node:fs";
import path from "node:path";
import { logger } from "../logger.js";
import { exists } from "../util/fsx.js";
import { extractRootCauseSummary, FIVE_WHYS_PROMPT } from "../workflow/fixbug.js";
import type { Stage } from "./types.js";

const ROOTCAUSE_TEMPLATE = `# Root Cause Analysis

## Symptom

## 5 Whys
1. Why ... → ...
2. Why ... → ...
3. Why ... → ...
4. Why ... → ...
5. Why ... → ...

## Root cause

## Fix strategy (address root, not symptom)

## Verification / regression
`;

/**
 * Root Cause stage (fixbug mode): applies 5 Whys analysis before coding.
 * Replaces speckit + validate + bmad for bug-fix workflows.
 */
export const rootcauseStage: Stage = {
  id: "rootcause",
  title: "Root Cause Analysis (5 Whys)",
  enabled: (c) => c.stages.rootcause.enabled,

  async run(ctx) {
    const knowledge = ctx.shared.knowledge
      ? `\n\nProject knowledge:\n${ctx.shared.knowledge}`
      : "";
    const profile = ctx.shared.repoProfile
      ? `\n\nRepository profile:\n${JSON.stringify(ctx.shared.repoProfile, null, 2)}`
      : "";

    logger.step("Analyzing root cause via 5 Whys");
    const response = await ctx.agent.prompt(
      `${FIVE_WHYS_PROMPT}

Investigate this bug report and produce a root cause analysis document in Markdown with exactly these sections:
## Symptom
## 5 Whys (numbered 1–5, each line: Why ... → ...)
## Root cause
## Fix strategy (address root, not symptom)
## Verification / regression

Be specific to this codebase and stack. Inspect relevant files if needed. Keep the whole document short — follow the conciseness rules above.${profile}${knowledge}

Bug report:
"""
${ctx.request}
"""

Output ONLY the Markdown document, no preamble.`,
      { cwd: ctx.cwd, timeoutMs: 10 * 60_000 },
    );

    const content = response.trim() || ROOTCAUSE_TEMPLATE;

    const docsDir = path.join(ctx.cwd, "docs");
    let destPath: string;
    if (await exists(docsDir)) {
      destPath = path.join(docsDir, "rootcause.md");
    } else {
      destPath = path.join(ctx.runDir, "rootcause.md");
    }

    await fs.mkdir(path.dirname(destPath), { recursive: true });
    await fs.writeFile(destPath, content, "utf8");

    const relPath = path.relative(ctx.cwd, destPath);
    const summary = extractRootCauseSummary(content);

    return {
      status: "passed",
      message: `Root cause analysis written: ${relPath}`,
      artifacts: [relPath],
      data: { rootCausePath: relPath, rootCauseSummary: summary || undefined },
    };
  },
};
