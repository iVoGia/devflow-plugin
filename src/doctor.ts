import { loadConfig } from "./config.js";
import { collectDepStatuses } from "./deps/checks.js";
import { logger, pc } from "./logger.js";
import { run } from "./util/exec.js";
import which from "./util/which.js";

interface Check {
  name: string;
  ok: boolean;
  detail: string;
  required: boolean;
}

export async function doctor(cwd: string): Promise<boolean> {
  const config = await loadConfig(cwd);
  const depStatuses = await collectDepStatuses(config);
  const checks: Check[] = depStatuses.map((d) => ({
    name: d.name,
    ok: d.ok,
    detail: d.detail,
    required: d.required,
  }));

  // Env keys
  checks.push(envCheck("CONTEXT7_API_KEY", config.context7.enabled, false));
  if (config.stages.strix.enabled) {
    checks.push(envCheck("STRIX_LLM", true, true));
    checks.push(
      envCheck(
        "LLM_API_KEY",
        true,
        true,
        !!(process.env.LLM_API_KEY || process.env.STRIX_LLM_API_KEY),
      ),
    );
  }

  // gh auth is folded into gh check; re-verify for doctor display
  if (config.stages.pr.enabled) {
    const gh = await which("gh");
    if (gh) {
      const auth = await run("gh", ["auth", "status"]);
      const idx = checks.findIndex((c) => c.name.startsWith("GitHub CLI"));
      if (idx !== -1 && !auth.ok) {
        checks[idx] = {
          name: "GitHub CLI (gh)",
          ok: false,
          detail: "Run `gh auth login`",
          required: true,
        };
      }
    }
  }

  logger.heading("DevFlow Doctor");
  let allRequiredOk = true;
  for (const c of checks) {
    const icon = c.ok ? pc.green("✓") : c.required ? pc.red("✗") : pc.yellow("!");
    const tag = c.required ? "" : pc.dim(" (optional)");
    logger.info(`  ${icon} ${c.name}${tag} — ${pc.dim(c.detail)}`);
    if (!c.ok && c.required) allRequiredOk = false;
  }

  if (config.caveman.enabled) {
    logger.info(
      `  ${pc.green("✓")} Caveman — ${pc.dim(`level ${config.caveman.level}, stages: ${config.caveman.stages.join(", ")}`)}`,
    );
    logger.info(
      `    ${pc.dim("compressKnowledge:")} ${config.caveman.compressKnowledge ? "on" : "off"} — run ${pc.cyan("devflow caveman compress")} after filling harness`,
    );
    logger.info(
      `    ${pc.dim("Note: ~0.5–1k extra input per caveman stage; harness compress saves input every run")}`,
    );
  }

  logger.divider();
  if (allRequiredOk) {
    logger.success("All required checks passed.");
  } else {
    logger.error("Some required checks failed. Fix them before running the full pipeline.");
  }
  return allRequiredOk;
}

function envCheck(
  key: string,
  relevant: boolean,
  required: boolean,
  presetOk?: boolean,
): Check {
  const ok = presetOk ?? !!process.env[key];
  return {
    name: `env ${key}`,
    ok: ok || !relevant,
    detail: ok ? "set" : relevant ? "not set" : "not needed",
    required: required && relevant,
  };
}
