import { run } from "../util/exec.js";
import which from "../util/which.js";
import { logger } from "../logger.js";
import type { Stage } from "./types.js";

/**
 * Strix security validation. Requires Docker + an LLM key (STRIX_LLM,
 * LLM_API_KEY). Runs non-interactively; a non-zero exit means vulnerabilities
 * were found and gates the pipeline.
 */
export const strixStage: Stage = {
  id: "strix",
  title: "Strix (Security Validation)",
  enabled: (c) => c.stages.strix.enabled,

  async preflight() {
    if (!(await which("strix"))) {
      return {
        ok: false,
        reason: "`strix` not installed. Run `pipx install strix-agent`.",
      };
    }
    // Strix needs Docker running.
    const docker = await run("docker", ["info"]);
    if (!docker.ok) {
      return { ok: false, reason: "Docker is not running (required by Strix)." };
    }
    if (!process.env.STRIX_LLM || !(process.env.LLM_API_KEY || process.env.STRIX_LLM_API_KEY)) {
      return {
        ok: false,
        reason: "Set STRIX_LLM and LLM_API_KEY for Strix.",
      };
    }
    return { ok: true };
  },

  async run(ctx) {
    const mode = ctx.config.stages.strix.mode;
    logger.step(`Running Strix (${mode}) on ${ctx.cwd}`);
    const args = ["-n", "-t", ctx.cwd];
    if (mode === "quick") args.push("--scan-mode", "quick");

    const res = await run("strix", args, { cwd: ctx.cwd });

    if (!res.ok) {
      return {
        status: "failed",
        message: `Strix reported findings (exit ${res.exitCode}). Review the security report above.`,
        gate: ctx.config.stages.strix.gate,
      };
    }
    return { status: "passed", message: "No security findings from Strix." };
  },
};
