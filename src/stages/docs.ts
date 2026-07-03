import { logger } from "../logger.js";
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
    await ctx.agent.prompt(
      `Update the project's documentation to reflect the change just implemented for this request. Update README, relevant docs/, and a CHANGELOG entry if one exists. Only touch documentation; do not change source behavior.\n\nRequest:\n"""\n${ctx.request}\n"""`,
      { cwd: ctx.cwd, timeoutMs: 10 * 60_000 },
    );

    return { status: "passed", message: "Documentation updated." };
  },
};
