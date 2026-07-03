import { execa } from "execa";
import which from "../util/which.js";
import { logger } from "../logger.js";
import type { AgentBackend, AgentPromptOptions } from "./types.js";

/**
 * Drives the Cursor Agent CLI in headless print mode: `cursor-agent -p "<prompt>"`.
 */
export class CursorBackend implements AgentBackend {
  readonly name = "cursor";
  readonly label = "Cursor Agent CLI";

  constructor(private readonly command = "cursor-agent") {}

  async isAvailable(): Promise<{ ok: boolean; reason?: string }> {
    const found = await which(this.command);
    if (!found) {
      return {
        ok: false,
        reason: `\`${this.command}\` not found on PATH. Install the Cursor CLI (\`curl https://cursor.com/install -fsS | bash\`).`,
      };
    }
    return { ok: true };
  }

  async prompt(input: string, opts: AgentPromptOptions = {}): Promise<string> {
    const prompt = opts.system ? `${opts.system}\n\n${input}` : input;
    logger.debug(`cursor-agent -p (len=${prompt.length})`);
    const { stdout } = await execa(this.command, ["-p", prompt], {
      cwd: opts.cwd,
      timeout: opts.timeoutMs ?? 15 * 60_000,
      reject: true,
    });
    return stdout.trim();
  }
}
