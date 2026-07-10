import type { DevflowConfig } from "../config.js";
import { logger, pc } from "../logger.js";
import { collectDepStatuses, missingRequired } from "./checks.js";
import { ensureDependencies } from "./install.js";

export interface BootstrapResult {
  /** All required dependencies satisfied after install attempts. */
  allRequiredOk: boolean;
  stillMissing: ReturnType<typeof missingRequired>;
}

/**
 * Checks workflow dependencies and auto-installs what is missing.
 * Prints clear errors for failures and manual-only prerequisites.
 */
export async function bootstrapDependencies(
  config: DevflowConfig,
  opts: { skipInstall?: boolean } = {},
): Promise<BootstrapResult> {
  let statuses = await collectDepStatuses(config);
  let missing = missingRequired(statuses);

  if (!opts.skipInstall && missing.some((m) => m.installable)) {
    await ensureDependencies(missing);
    statuses = await collectDepStatuses(config);
    missing = missingRequired(statuses);
  }

  if (missing.length > 0) {
    logger.heading("Dependencies still needed");
    for (const m of missing) {
      const tag = m.installable ? pc.yellow("install failed") : pc.dim("manual");
      logger.warn(`  ${pc.red("✗")} ${m.name} [${tag}] — ${m.detail}`);
    }
    logger.info(
      `\nFix the items above, then run ${pc.cyan("devflow doctor")} to verify.`,
    );
  } else {
    logger.success("All required workflow dependencies are ready.");
  }

  // Env keys reminder (cannot auto-install)
  const envHints: string[] = [];
  if (config.context7.enabled && !process.env.CONTEXT7_API_KEY) {
    envHints.push("CONTEXT7_API_KEY (optional, higher Context7 rate limits)");
  }
  if (config.stages.strix.enabled) {
    if (!process.env.STRIX_LLM) envHints.push("STRIX_LLM (required for Strix)");
    if (!process.env.LLM_API_KEY && !process.env.STRIX_LLM_API_KEY) {
      envHints.push("LLM_API_KEY (required for Strix)");
    }
  }
  if (envHints.length > 0) {
    logger.info(`\n${pc.dim("Environment variables to set:")}`);
    for (const h of envHints) logger.info(`  ${pc.cyan("•")} ${h}`);
  }

  return { allRequiredOk: missing.length === 0, stillMissing: missing };
}
