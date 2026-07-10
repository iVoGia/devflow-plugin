import { promises as fs } from "node:fs";
import path from "node:path";
import { logger } from "../logger.js";
import {
  createBranch,
  currentBranch,
  isGitRepo,
  slugify,
} from "../util/git.js";
import { FIVE_WHYS_PROMPT, isFixbugMode } from "../workflow/fixbug.js";
import type { Stage } from "./types.js";

/**
 * Coding Agent stage: drives the agent backend to implement the change on a
 * dedicated feature branch, using the spec, plan and gathered context.
 */
export const codingStage: Stage = {
  id: "coding",
  title: "Coding Agent",
  enabled: (c) => c.stages.coding.enabled,

  async preflight(ctx) {
    if (ctx.config.agent === "api") {
      return {
        ok: false,
        reason:
          'The "api" backend cannot edit files. Set agent: claude|cursor for the coding stage.',
      };
    }
    return { ok: true };
  },

  async run(ctx) {
    // Create a feature branch so the work is isolated for review.
    let branch = ctx.shared.branch;
    if (await isGitRepo(ctx.cwd)) {
      const prefix =
        ctx.shared.intent === "bug"
          ? "fix"
          : ctx.shared.intent === "refactor"
            ? "refactor"
            : "feat";
      branch = `${prefix}/${slugify(ctx.request)}`;
      const base = await currentBranch(ctx.cwd);
      if (base !== branch) {
        const created = await createBranch(ctx.cwd, branch);
        if (created) logger.step(`Created branch ${branch}`);
        else logger.warn(`Could not create branch ${branch}; staying on ${base}`);
      }
    } else {
      logger.warn("Not a git repo; coding without a feature branch.");
    }

    const parts: string[] = [
      `Implement the following ${ctx.shared.intent ?? "change"} completely and correctly.`,
      `Request:\n"""\n${ctx.request}\n"""`,
    ];
    if (ctx.shared.specPath) parts.push(`Follow the spec at ${ctx.shared.specPath}.`);
    if (ctx.shared.planPath) parts.push(`Follow the task plan at ${ctx.shared.planPath}.`);
    if (ctx.shared.knowledge)
      parts.push(`Respect these project rules:\n${ctx.shared.knowledge}`);
    if (ctx.shared.repoProfile)
      parts.push(
        `Repository profile (detected stack — follow it):\n${JSON.stringify(ctx.shared.repoProfile, null, 2)}`,
      );
    if (ctx.shared.contextDocs)
      parts.push(`Reference material:\n${ctx.shared.contextDocs.slice(0, 8000)}`);

    if (isFixbugMode(ctx)) {
      parts.push(FIVE_WHYS_PROMPT);
      if (ctx.shared.rootCausePath) {
        parts.push(
          `Follow the root cause analysis at ${ctx.shared.rootCausePath}. Fix the ROOT CAUSE, not the symptom. Add a regression test that would have caught this bug.`,
        );
      } else {
        parts.push(
          "Fix the ROOT CAUSE, not the symptom. Add a regression test that would have caught this bug.",
        );
      }
    }

    parts.push(
      "Make all necessary file edits directly in the repository. Add or update tests. Do not open a PR; that is a later step.",
    );

    logger.step("Implementing change via agent (this can take a while)");
    const output = await ctx.agent.prompt(parts.join("\n\n"), {
      cwd: ctx.cwd,
      timeoutMs: 30 * 60_000,
    });

    await fs.writeFile(
      path.join(ctx.runDir, "coding-output.md"),
      output || "(no output)",
      "utf8",
    );

    return {
      status: "passed",
      message: branch ? `Implemented on ${branch}` : "Implementation complete",
      data: { branch },
    };
  },
};
