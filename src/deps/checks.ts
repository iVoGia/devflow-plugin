import { createAgent } from "../agent/index.js";
import type { DevflowConfig } from "../config.js";
import { run } from "../util/exec.js";
import which from "../util/which.js";

export interface DepStatus {
  id: string;
  name: string;
  ok: boolean;
  detail: string;
  required: boolean;
  /** Whether an automatic installer exists for this dependency. */
  installable: boolean;
}

/** Collect dependency statuses for the given project config. */
export async function collectDepStatuses(
  config: DevflowConfig,
): Promise<DepStatus[]> {
  const statuses: DepStatus[] = [];

  const agent = createAgent(config);
  const agentStatus = await agent.isAvailable();
  statuses.push({
    id: "agent",
    name: `Agent backend (${agent.label})`,
    ok: agentStatus.ok,
    detail: agentStatus.ok ? "ready" : (agentStatus.reason ?? "unavailable"),
    required: true,
    installable: false,
  });

  const hasNpx = await which("npx");
  statuses.push({
    id: "npx",
    name: "Node/npx",
    ok: hasNpx,
    detail: hasNpx ? "`npx` found" : "Install Node.js 18+ from https://nodejs.org",
    required: true,
    installable: false,
  });

  const hasSpecify = (await which("specify")) || (await which("uvx"));
  statuses.push({
    id: "specify",
    name: "SpecKit (specify/uvx)",
    ok: hasSpecify,
    detail: hasSpecify
      ? "available"
      : "Install with `uv tool install specify-cli`",
    required: config.stages.speckit.enabled,
    installable: config.stages.speckit.enabled,
  });

  if (config.stages.strix.enabled) {
    const hasStrix = await which("strix");
    statuses.push({
      id: "strix",
      name: "Strix",
      ok: hasStrix,
      detail: hasStrix ? "installed" : "Install with `pipx install strix-agent`",
      required: true,
      installable: true,
    });

    const docker = await run("docker", ["info"]);
    statuses.push({
      id: "docker",
      name: "Docker (for Strix)",
      ok: docker.ok,
      detail: docker.ok
        ? "running"
        : "Install Docker Desktop and start the daemon",
      required: true,
      installable: false,
    });
  }

  if (config.stages.pr.enabled) {
    const hasGh = await which("gh");
    let ghAuth = false;
    if (hasGh) ghAuth = (await run("gh", ["auth", "status"])).ok;
    statuses.push({
      id: "gh",
      name: "GitHub CLI (gh)",
      ok: hasGh && ghAuth,
      detail: !hasGh
        ? "Install `gh` (https://cli.github.com)"
        : ghAuth
          ? "authenticated"
          : "Run `gh auth login`",
      required: true,
      installable: !hasGh,
    });
  }

  if (config.stages.e2e.enabled && config.stages.e2e.engine === "maestro") {
    const hasMaestro = await which("maestro");
    statuses.push({
      id: "maestro",
      name: "Maestro",
      ok: hasMaestro,
      detail: hasMaestro
        ? "installed"
        : "Install from https://get.maestro.mobile.dev",
      required: true,
      installable: true,
    });

    const hasJava = await which("java");
    statuses.push({
      id: "java",
      name: "Java 17+ (Maestro)",
      ok: hasJava,
      detail: hasJava ? "found" : "Install JDK 17+",
      required: true,
      installable: false,
    });
  }

  return statuses;
}

/** Returns only required dependencies that are missing. */
export function missingRequired(statuses: DepStatus[]): DepStatus[] {
  return statuses.filter((s) => s.required && !s.ok);
}
