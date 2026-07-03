import { createAgent } from "./agent/index.js";
import { loadConfig } from "./config.js";
import { logger, pc } from "./logger.js";
import { run } from "./util/exec.js";
import which from "./util/which.js";

interface Check {
  name: string;
  ok: boolean;
  detail: string;
  required: boolean;
}

async function toolCheck(
  name: string,
  bin: string,
  hint: string,
  required = false,
): Promise<Check> {
  const ok = await which(bin);
  return { name, ok, detail: ok ? `\`${bin}\` found` : hint, required };
}

export async function doctor(cwd: string): Promise<boolean> {
  const config = await loadConfig(cwd);
  const checks: Check[] = [];

  // Agent backend
  const agent = createAgent(config);
  const agentStatus = await agent.isAvailable();
  checks.push({
    name: `Agent backend (${agent.label})`,
    ok: agentStatus.ok,
    detail: agentStatus.ok ? "ready" : agentStatus.reason ?? "unavailable",
    required: true,
  });

  // Node / npx (BMAD, Playwright)
  checks.push(await toolCheck("Node/npx", "npx", "Install Node.js 18+", true));

  // SpecKit
  const specify = (await which("specify")) || (await which("uvx"));
  checks.push({
    name: "SpecKit (specify/uvx)",
    ok: specify,
    detail: specify ? "available" : "Install with `uv tool install specify-cli`",
    required: config.stages.speckit.enabled,
  });

  // Docker + Strix
  if (config.stages.strix.enabled) {
    const strix = await which("strix");
    checks.push({
      name: "Strix",
      ok: strix,
      detail: strix ? "installed" : "Install with `pipx install strix-agent`",
      required: true,
    });
    const docker = await run("docker", ["info"]);
    checks.push({
      name: "Docker (for Strix)",
      ok: docker.ok,
      detail: docker.ok ? "running" : "Start Docker Desktop / daemon",
      required: true,
    });
  }

  // gh CLI
  if (config.stages.pr.enabled) {
    const gh = await which("gh");
    let ghAuth = false;
    if (gh) ghAuth = (await run("gh", ["auth", "status"])).ok;
    checks.push({
      name: "GitHub CLI (gh)",
      ok: gh && ghAuth,
      detail: !gh
        ? "Install `gh`"
        : ghAuth
          ? "authenticated"
          : "Run `gh auth login`",
      required: true,
    });
  }

  // Maestro (only if selected)
  if (config.stages.e2e.enabled && config.stages.e2e.engine === "maestro") {
    checks.push(
      await toolCheck("Maestro", "maestro", "Install from get.maestro.mobile.dev", true),
    );
    checks.push(await toolCheck("Java 17+ (Maestro)", "java", "Install a JDK 17+", true));
  }

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

  // Report
  logger.heading("DevFlow Doctor");
  let allRequiredOk = true;
  for (const c of checks) {
    const icon = c.ok ? pc.green("✓") : c.required ? pc.red("✗") : pc.yellow("!");
    const tag = c.required ? "" : pc.dim(" (optional)");
    logger.info(`  ${icon} ${c.name}${tag} — ${pc.dim(c.detail)}`);
    if (!c.ok && c.required) allRequiredOk = false;
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
