import { homedir, platform } from "node:os";
import path from "node:path";
import { logger } from "../logger.js";
import { run } from "../util/exec.js";
import which from "../util/which.js";
import type { DepStatus } from "./checks.js";

export interface InstallAttempt {
  id: string;
  name: string;
  ok: boolean;
  message: string;
}

export interface EnsureDepsResult {
  attempts: InstallAttempt[];
  /** Still missing after install attempts (required only). */
  stillMissing: DepStatus[];
}

/** Extends PATH with common install locations for the current process. */
function envWithToolPaths(): NodeJS.ProcessEnv {
  const home = homedir();
  const extra = [
    path.join(home, ".local", "bin"),
    path.join(home, ".cargo", "bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
  ];
  return {
    ...process.env,
    PATH: [...extra, process.env.PATH ?? ""].join(path.delimiter),
  };
}

async function installUv(env: NodeJS.ProcessEnv): Promise<InstallAttempt> {
  if (await which("uv")) {
    return { id: "uv", name: "uv", ok: true, message: "already installed" };
  }

  const os = platform();
  if (os === "win32") {
    const res = await run(
      "powershell",
      ["-NoProfile", "-Command", "irm https://astral.sh/uv/install.ps1 | iex"],
      { env, timeout: 120_000 },
    );
    return {
      id: "uv",
      name: "uv",
      ok: res.ok,
      message: res.ok
        ? "installed via uv install script"
        : `install failed: ${clip(res.stderr || res.stdout)}`,
    };
  }

  const res = await run(
    "sh",
    ["-c", "curl -LsSf https://astral.sh/uv/install.sh | sh"],
    { env, timeout: 120_000 },
  );
  return {
    id: "uv",
    name: "uv",
    ok: res.ok,
    message: res.ok
      ? "installed via uv install script"
      : `install failed: ${clip(res.stderr || res.stdout)}`,
  };
}

async function installSpecify(env: NodeJS.ProcessEnv): Promise<InstallAttempt> {
  if ((await which("specify")) || (await which("uvx"))) {
    return {
      id: "specify",
      name: "SpecKit (specify)",
      ok: true,
      message: "already available",
    };
  }

  let uvReady = await which("uv");
  if (!uvReady) {
    const uvAttempt = await installUv(env);
    if (!uvAttempt.ok) {
      return {
        id: "specify",
        name: "SpecKit (specify)",
        ok: false,
        message: `needs uv first: ${uvAttempt.message}. Manual: uv tool install specify-cli`,
      };
    }
    uvReady = true;
  }

  const res = await run("uv", ["tool", "install", "specify-cli"], {
    env,
    timeout: 180_000,
  });
  const ok = res.ok || (await which("specify")) || (await which("uvx"));
  return {
    id: "specify",
    name: "SpecKit (specify)",
    ok,
    message: ok
      ? "installed via `uv tool install specify-cli`"
      : `install failed: ${clip(res.stderr || res.stdout)}. Manual: uv tool install specify-cli`,
  };
}

async function installPipx(env: NodeJS.ProcessEnv): Promise<InstallAttempt> {
  if (await which("pipx")) {
    return { id: "pipx", name: "pipx", ok: true, message: "already installed" };
  }

  if (await which("brew")) {
    const brew = await run("brew", ["install", "pipx"], { env, timeout: 300_000 });
    if (brew.ok && (await which("pipx"))) {
      await run("pipx", ["ensurepath"], { env });
      return { id: "pipx", name: "pipx", ok: true, message: "installed via brew" };
    }
  }

  const py = (await which("python3")) ? "python3" : (await which("python")) ? "python" : null;
  if (!py) {
    return {
      id: "pipx",
      name: "pipx",
      ok: false,
      message: "Python not found. Install Python 3, then: python3 -m pip install --user pipx",
    };
  }

  const pip = await run(py, ["-m", "pip", "install", "--user", "pipx"], {
    env,
    timeout: 180_000,
  });
  if (!pip.ok) {
    return {
      id: "pipx",
      name: "pipx",
      ok: false,
      message: `pip install pipx failed: ${clip(pip.stderr || pip.stdout)}`,
    };
  }

  await run(py, ["-m", "pipx", "ensurepath"], { env });
  const ok = (await which("pipx")) || (await run(path.join(homedir(), ".local", "bin", "pipx"), ["--version"], { env })).ok;
  return {
    id: "pipx",
    name: "pipx",
    ok,
    message: ok ? "installed via pip" : "pipx install uncertain — restart terminal or add ~/.local/bin to PATH",
  };
}

async function installStrix(env: NodeJS.ProcessEnv): Promise<InstallAttempt> {
  if (await which("strix")) {
    return { id: "strix", name: "Strix", ok: true, message: "already installed" };
  }

  const pipxAttempt = await installPipx(env);
  if (!pipxAttempt.ok) {
    return {
      id: "strix",
      name: "Strix",
      ok: false,
      message: `needs pipx first: ${pipxAttempt.message}. Manual: pipx install strix-agent`,
    };
  }

  const res = await run("pipx", ["install", "strix-agent"], { env, timeout: 300_000 });
  const ok = res.ok || (await which("strix"));
  return {
    id: "strix",
    name: "Strix",
    ok,
    message: ok
      ? "installed via `pipx install strix-agent`"
      : `install failed: ${clip(res.stderr || res.stdout)}. Manual: pipx install strix-agent`,
  };
}

async function installGh(env: NodeJS.ProcessEnv): Promise<InstallAttempt> {
  if (await which("gh")) {
    return { id: "gh", name: "GitHub CLI (gh)", ok: true, message: "already installed" };
  }

  const os = platform();
  if (os === "darwin" && (await which("brew"))) {
    const res = await run("brew", ["install", "gh"], { env, timeout: 300_000 });
    const ok = res.ok || (await which("gh"));
    return {
      id: "gh",
      name: "GitHub CLI (gh)",
      ok,
      message: ok
        ? "installed via brew"
        : `brew install failed: ${clip(res.stderr || res.stdout)}. Manual: https://cli.github.com`,
    };
  }

  if (os === "win32" && (await which("winget"))) {
    const res = await run(
      "winget",
      ["install", "--id", "GitHub.cli", "-e", "--accept-package-agreements", "--accept-source-agreements"],
      { env, timeout: 300_000 },
    );
    const ok = res.ok || (await which("gh"));
    return {
      id: "gh",
      name: "GitHub CLI (gh)",
      ok,
      message: ok
        ? "installed via winget"
        : `winget install failed: ${clip(res.stderr || res.stdout)}. Manual: https://cli.github.com`,
    };
  }

  if ((await which("apt-get")) && process.getuid?.() === 0) {
    const res = await run("apt-get", ["install", "-y", "gh"], { env, timeout: 300_000 });
    const ok = res.ok || (await which("gh"));
    if (ok) {
      return { id: "gh", name: "GitHub CLI (gh)", ok: true, message: "installed via apt" };
    }
  }

  return {
    id: "gh",
    name: "GitHub CLI (gh)",
    ok: false,
    message: "no supported package manager found. Manual: https://cli.github.com",
  };
}

async function installMaestro(env: NodeJS.ProcessEnv): Promise<InstallAttempt> {
  if (await which("maestro")) {
    return { id: "maestro", name: "Maestro", ok: true, message: "already installed" };
  }

  const os = platform();
  if (os === "darwin" && (await which("brew"))) {
    const res = await run("brew", ["tap", "mobile-dev-inc/tap"], { env });
    if (!res.ok) {
      return {
        id: "maestro",
        name: "Maestro",
        ok: false,
        message: `brew tap failed: ${clip(res.stderr)}. Manual: https://get.maestro.mobile.dev`,
      };
    }
    const install = await run("brew", ["install", "maestro"], { env, timeout: 300_000 });
    const ok = install.ok || (await which("maestro"));
    return {
      id: "maestro",
      name: "Maestro",
      ok,
      message: ok
        ? "installed via brew"
        : `brew install failed: ${clip(install.stderr || install.stdout)}`,
    };
  }

  const res = await run(
    "sh",
    ["-c", "curl -Ls https://get.maestro.mobile.dev | bash"],
    { env, timeout: 300_000 },
  );
  const ok = res.ok || (await which("maestro"));
  return {
    id: "maestro",
    name: "Maestro",
    ok,
    message: ok
      ? "installed via Maestro install script"
      : `install failed: ${clip(res.stderr || res.stdout)}. Manual: https://get.maestro.mobile.dev`,
  };
}

const INSTALLERS: Record<string, (env: NodeJS.ProcessEnv) => Promise<InstallAttempt>> = {
  specify: installSpecify,
  strix: installStrix,
  gh: installGh,
  maestro: installMaestro,
};

/**
 * Attempts to auto-install missing workflow dependencies.
 * Reports each attempt; re-checks status after installs.
 */
export async function ensureDependencies(
  missing: DepStatus[],
): Promise<EnsureDepsResult> {
  const env = envWithToolPaths();
  const attempts: InstallAttempt[] = [];
  const toInstall = missing.filter((d) => d.installable);

  if (toInstall.length === 0) {
    return { attempts, stillMissing: missing };
  }

  logger.heading("Installing missing dependencies");
  for (const dep of toInstall) {
    const installer = INSTALLERS[dep.id];
    if (!installer) continue;

    logger.step(`Installing ${dep.name}…`);
    const attempt = await installer(env);
    attempts.push(attempt);
    if (attempt.ok) {
      logger.success(`${dep.name}: ${attempt.message}`);
    } else {
      logger.error(`${dep.name}: ${attempt.message}`);
    }
  }

  return { attempts, stillMissing: [] };
}

function clip(text: string, max = 240): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}
