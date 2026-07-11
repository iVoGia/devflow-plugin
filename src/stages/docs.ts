import { logger } from "../logger.js";
import { isFixbugMode } from "../workflow/fixbug.js";
import type { Stage } from "./types.js";

/**
 * Documentation Agent: updates README / docs / changelog to reflect the change.
 */
export const docsStage: Stage = {
  id: "docs",
  title: "Documentation Agent",
  enabled: (c) => c.stages.docs.enabled,

  async preflight(ctx) {
    if (ctx.config.agent === "api") {
      return {
        ok: false,
        reason: 'The "api" backend cannot edit files; skipping docs update.',
      };
    }
    return { ok: true };
  },

  async run(ctx) {
    logger.step("Updating documentation via agent");

    const prompt = isFixbugMode(ctx)
      ? `This was a bug fix using 5 Whys root cause analysis. Update documentation minimally:
- Add a CHANGELOG entry describing the fix and root cause (if CHANGELOG exists).
- Add a brief troubleshooting note if relevant (docs/ or README).
Do NOT rewrite the entire README. Only touch documentation; do not change source behavior.

Root cause analysis: ${ctx.shared.rootCausePath ?? "docs/rootcause.md"}
Bug report:
"""
${ctx.request}
"""`
      : `Update the project's documentation to reflect the change just implemented for this request. Update README, relevant docs/, and a CHANGELOG entry if one exists. Only touch documentation; do not change source behavior.\n\nRequest:\n"""\n${ctx.request}\n"""`;

    await ctx.agent.prompt(prompt, {
      cwd: ctx.cwd,
      timeoutMs: 10 * 60_000,
      stageId: "docs",
    });

    return { status: "passed", message: "Documentation updated." };
  },
};
