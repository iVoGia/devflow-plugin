import { promises as fs } from "node:fs";
import path from "node:path";
import { run } from "../util/exec.js";
import which from "../util/which.js";
import { logger } from "../logger.js";
import { findFirst } from "../util/fsx.js";
import type { Stage, StageContext } from "./types.js";

function profileBlock(ctx: StageContext): string {
  const p = ctx.shared.repoProfile;
  if (!p) return "";
  return `\n\nDetected repository profile:\n${JSON.stringify(p, null, 2)}`;
}

/**
 * SpecKit stage: ensures Spec Kit is bootstrapped, then drives the agent
 * backend to produce a specification for the request. The spec artifact is
 * gated in the separate "validate" stage.
 */
export const speckitStage: Stage = {
  id: "speckit",
  title: "SpecKit (Specification)",
  enabled: (c) => c.stages.speckit.enabled,

  async preflight() {
    const hasSpecify = await which("specify");
    const hasUvx = await which("uvx");
    if (!hasSpecify && !hasUvx) {
      return {
        ok: false,
        reason:
          "Neither `specify` nor `uvx` found. Install with `uv tool install specify-cli` (see github.com/github/spec-kit).",
      };
    }
    return { ok: true };
  },

  async run(ctx) {
    const integration = ctx.config.stages.speckit.integration;

    // Bootstrap Spec Kit in-place if it has not been initialized yet.
    const alreadyInit = await pathExists(path.join(ctx.cwd, ".specify"));
    if (!alreadyInit) {
      logger.step("Initializing Spec Kit (specify init --here)");
      const cmd = (await which("specify"))
        ? { bin: "specify", pre: [] as string[] }
        : { bin: "uvx", pre: ["--from", "specify-cli", "specify"] };
      const res = await run(
        cmd.bin,
        [
          ...cmd.pre,
          "init",
          "--here",
          "--ai",
          integration,
          "--script",
          "sh",
          "--force",
        ],
        { cwd: ctx.cwd },
      );
      if (!res.ok) {
        logger.warn(
          "specify init failed; continuing and letting the agent create the spec manually.",
        );
        logger.debug(res.stderr);
      }
    }

    // Drive the agent to author the specification.
    const knowledge = ctx.shared.knowledge
      ? `\n\nProject knowledge to respect:\n${ctx.shared.knowledge}`
      : "";
    logger.step("Authoring specification via agent");
    await ctx.agent.prompt(
      `Using the Spec Kit workflow (the /speckit.specify command and its templates), create a complete specification for the following ${ctx.shared.intent ?? "feature"} request. Write the spec to the specs/ directory as spec.md following Spec Kit conventions. Be concrete about scope, user stories, and acceptance criteria. For greenfield projects, include platform, stack, and UI/UX sections.${profileBlock(ctx)}\n\nRequest:\n"""\n${ctx.request}\n"""${knowledge}`,
      { cwd: ctx.cwd, timeoutMs: 15 * 60_000, stageId: "speckit" },
    );

    // Locate the produced spec.
    const specPath = await findFirst(ctx.cwd, [
      "specs/**/spec.md",
      "specs/**/*.md",
      ".specify/specs/**/spec.md",
    ]);

    if (!specPath) {
      return {
        status: "failed",
        message: "No spec file produced under specs/.",
        gate: false, // validate stage is the real gate
      };
    }

    return {
      status: "passed",
      message: `Spec created: ${path.relative(ctx.cwd, specPath)}`,
      artifacts: [path.relative(ctx.cwd, specPath)],
      data: { specPath: path.relative(ctx.cwd, specPath) },
    };
  },
};

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
