import { execa } from "execa";
import which from "../util/which.js";
import { logger } from "../logger.js";
import type { AgentBackend, AgentPromptOptions } from "./types.js";

/**
 * Drives the Claude Code CLI in headless print mode: `claude -p "<prompt>"`.
 * The CLI streams the assistant's final text answer to stdout.
 */
export class ClaudeBackend implements AgentBackend {
  readonly name = "claude";
  readonly label = "Claude Code CLI";

  constructor(private readonly command = "claude") {}

  async isAvailable(): Promise<{ ok: boolean; reason?: string }> {
    const found = await which(this.command);
    if (!found) {
      return {
        ok: false,
        reason: `\`${this.command}\` not found on PATH. Install Claude Code and run \`claude login\`.`,
      };
    }
    return { ok: true };
  }

  async prompt(input: string, opts: AgentPromptOptions = {}): Promise<string> {
    const prompt = opts.system ? `${opts.system}\n\n${input}` : input;
    logger.debug(`claude -p (len=${prompt.length})`);
    const { stdout } = await execa(this.command, ["-p", prompt], {
      cwd: opts.cwd,
      timeout: opts.timeoutMs ?? 15 * 60_000,
      reject: true,
    });
    return stdout.trim();
  }
}
