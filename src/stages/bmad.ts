import path from "node:path";
import { run } from "../util/exec.js";
import which from "../util/which.js";
import { exists, findFirst } from "../util/fsx.js";
import { logger } from "../logger.js";
import type { Stage } from "./types.js";

/**
 * BMAD stage: installs BMAD-METHOD if needed, then drives the agent to run the
 * planning + task-split workflow (PRD/architecture -> sharded stories/tasks).
 */
export const bmadStage: Stage = {
  id: "bmad",
  title: "BMAD (Planning + Task Split)",
  enabled: (c) => c.stages.bmad.enabled,

  async preflight() {
    const hasNpx = await which("npx");
    if (!hasNpx) {
      return { ok: false, reason: "`npx` not found (Node.js required for BMAD)." };
    }
    return { ok: true };
  },

  async run(ctx) {
    const { modules, tools } = ctx.config.stages.bmad;

    const installed =
      (await exists(path.join(ctx.cwd, "bmad"))) ||
      (await exists(path.join(ctx.cwd, ".bmad-core"))) ||
      (await exists(path.join(ctx.cwd, "_bmad-output")));

    if (!installed) {
      logger.step("Installing BMAD-METHOD");
      const res = await run(
        "npx",
        [
          "bmad-method",
          "install",
          "--directory",
          ".",
          "--modules",
          modules,
          "--tools",
          tools,
          "--yes",
        ],
        { cwd: ctx.cwd },
      );
      if (!res.ok) {
        logger.warn("bmad-method install failed; agent will plan manually.");
        logger.debug(res.stderr);
      }
    }

    const specNote = ctx.shared.specPath
      ? `Base the plan on the approved specification at ${ctx.shared.specPath}.`
      : "";
    const knowledge = ctx.shared.knowledge
      ? `\n\nProject knowledge:\n${ctx.shared.knowledge}`
      : "";
    const profile = ctx.shared.repoProfile
      ? `\n\nRepository profile:\n${JSON.stringify(ctx.shared.repoProfile, null, 2)}`
      : "";
    logger.step("Generating plan + task breakdown via agent");
    await ctx.agent.prompt(
      `Using the BMAD-METHOD workflow (Analyst -> PM -> Architect -> Scrum Master), produce a planning document and a task breakdown for this work. ${specNote}${profile}${knowledge}\n\nWrite outputs to docs/ (e.g. docs/prd.md, docs/architecture.md) and a task list to docs/tasks.md (or the BMAD stories/ directory). Each task must be small, ordered, and independently verifiable. Match the detected platform and stack.\n\nRequest:\n"""\n${ctx.request}\n"""`,
      { cwd: ctx.cwd, timeoutMs: 15 * 60_000 },
    );

    const planPath = await findFirst(ctx.cwd, [
      "docs/tasks.md",
      "docs/prd.md",
      "**/stories/**/*.md",
      "_bmad-output/**/*.md",
    ]);

    if (!planPath) {
      return {
        status: "failed",
        message: "No planning artifact produced by BMAD stage.",
        gate: false,
      };
    }

    return {
      status: "passed",
      message: `Plan created: ${path.relative(ctx.cwd, planPath)}`,
      artifacts: [path.relative(ctx.cwd, planPath)],
      data: { planPath: path.relative(ctx.cwd, planPath) },
    };
  },
};
