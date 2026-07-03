import { runString } from "../util/exec.js";
import { logger } from "../logger.js";
import type { Stage, StageContext } from "./types.js";

interface Check {
  label: string;
  cmd?: string;
}

/**
 * Static Validation: runs unit tests, integration tests, lint and format
 * checks. Any non-zero exit fails the gate.
 */
export const staticStage: Stage = {
  id: "static",
  title: "Static Validation (Unit / Integration / Lint)",
  enabled: (c) => c.stages.static.enabled,

  async run(ctx) {
    const cfg = ctx.config.stages.static;
    const checks: Check[] = [
      { label: "unit", cmd: cfg.unit },
      { label: "integration", cmd: cfg.integration },
      { label: "lint", cmd: cfg.lint },
      { label: "format", cmd: cfg.format },
    ].filter((c) => c.cmd);

    if (checks.length === 0) {
      const detected = await autodetect(ctx);
      checks.push(...detected);
    }

    if (checks.length === 0) {
      return {
        status: "skipped",
        message: "No test/lint commands configured or detected.",
        gate: false,
      };
    }

    const failures: string[] = [];
    for (const check of checks) {
      if (!check.cmd) continue;
      logger.step(`${check.label}: ${check.cmd}`);
      const res = await runString(check.cmd, { cwd: ctx.cwd });
      if (!res.ok) {
        failures.push(check.label);
        logger.error(`${check.label} failed (exit ${res.exitCode})`);
      } else {
        logger.success(`${check.label} passed`);
      }
    }

    if (failures.length > 0) {
      return {
        status: "failed",
        message: `Failed checks: ${failures.join(", ")}`,
        gate: cfg.gate,
      };
    }

    return {
      status: "passed",
      message: `All ${checks.length} static check(s) passed.`,
    };
  },
};

/** Best-effort detection of test/lint commands from package.json scripts. */
async function autodetect(ctx: StageContext): Promise<Check[]> {
  const { promises: fs } = await import("node:fs");
  const path = await import("node:path");
  const pkgPath = path.join(ctx.cwd, "package.json");
  try {
    const pkg = JSON.parse(await fs.readFile(pkgPath, "utf8")) as {
      scripts?: Record<string, string>;
    };
    const scripts = pkg.scripts ?? {};
    const checks: Check[] = [];
    if (scripts.test) checks.push({ label: "unit", cmd: "npm test" });
    if (scripts.lint) checks.push({ label: "lint", cmd: "npm run lint" });
    if (scripts.typecheck)
      checks.push({ label: "typecheck", cmd: "npm run typecheck" });
    return checks;
  } catch {
    return [];
  }
}
