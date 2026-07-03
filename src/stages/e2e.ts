import { run, runString } from "../util/exec.js";
import which from "../util/which.js";
import { exists } from "../util/fsx.js";
import path from "node:path";
import { logger } from "../logger.js";
import type { Stage } from "./types.js";

/**
 * End-to-end testing via Playwright (web) or Maestro (mobile). Gate on failure.
 */
export const e2eStage: Stage = {
  id: "e2e",
  title: "Playwright / Maestro (E2E)",
  enabled: (c) => c.stages.e2e.enabled && c.stages.e2e.engine !== "none",

  async preflight(ctx) {
    const engine = ctx.config.stages.e2e.engine;
    if (engine === "maestro") {
      if (!(await which("maestro"))) {
        return { ok: false, reason: "`maestro` not installed (get.maestro.mobile.dev)." };
      }
    }
    // Playwright runs via npx; assume Node present (checked elsewhere).
    return { ok: true };
  },

  async run(ctx) {
    const cfg = ctx.config.stages.e2e;

    if (cfg.engine === "playwright") {
      const cmd = cfg.cmd ?? "npx playwright test";
      logger.step(cmd);
      const res = await runString(cmd, { cwd: ctx.cwd });
      if (!res.ok) {
        return {
          status: "failed",
          message: `Playwright tests failed (exit ${res.exitCode}).`,
          gate: cfg.gate,
        };
      }
      return { status: "passed", message: "Playwright tests passed." };
    }

    if (cfg.engine === "maestro") {
      const flowDir = path.join(ctx.cwd, ".maestro");
      const hasFlows = (await exists(flowDir)) || (await exists(path.join(ctx.cwd, "maestro")));
      if (!hasFlows) {
        return {
          status: "skipped",
          message: "No Maestro flows found (.maestro/).",
          gate: false,
        };
      }
      // Maestro needs a running device/emulator; warn if none is obvious.
      const cmd = cfg.cmd ?? "maestro test .maestro";
      logger.step(cmd);
      const res = await run(cmd.split(" ")[0], cmd.split(" ").slice(1), {
        cwd: ctx.cwd,
      });
      if (!res.ok) {
        return {
          status: "failed",
          message:
            `Maestro tests failed (exit ${res.exitCode}). Ensure an emulator/simulator is running.`,
          gate: cfg.gate,
        };
      }
      return { status: "passed", message: "Maestro flows passed." };
    }

    return { status: "skipped", message: "No e2e engine configured.", gate: false };
  },
};
