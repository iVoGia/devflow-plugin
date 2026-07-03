import { execa, type Options } from "execa";
import { logger } from "../logger.js";

export interface RunResult {
  ok: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Runs a shell-ish command (parsed into argv) without throwing on non-zero
 * exit. Output is inherited-and-captured so the user sees progress live.
 */
export async function run(
  command: string,
  args: string[] = [],
  opts: Options = {},
): Promise<RunResult> {
  logger.debug(`$ ${command} ${args.join(" ")}`);
  try {
    const result = await execa(command, args, {
      reject: false,
      all: true,
      ...opts,
    });
    return {
      ok: result.exitCode === 0,
      exitCode: result.exitCode ?? 1,
      stdout: (result.stdout ?? "").toString(),
      stderr: (result.stderr ?? "").toString(),
    };
  } catch (err) {
    const e = err as { exitCode?: number; stderr?: string; message?: string };
    return {
      ok: false,
      exitCode: e.exitCode ?? 1,
      stdout: "",
      stderr: e.stderr ?? e.message ?? String(err),
    };
  }
}

/** Runs a command string like "npm run lint" by splitting on whitespace. */
export async function runString(
  commandLine: string,
  opts: Options = {},
): Promise<RunResult> {
  const parts = commandLine.trim().split(/\s+/);
  const [cmd, ...args] = parts;
  return run(cmd, args, opts);
}
