import type { AgentBackend, AgentPromptOptions } from "../agent/types.js";
import type { DevflowConfig } from "../config.js";
import { cavemanSystem } from "./prompt.js";

/**
 * Wraps an agent backend and injects caveman system prompt for configured stages.
 */
export class CavemanAgentWrapper implements AgentBackend {
  readonly name: string;
  readonly label: string;

  constructor(
    private readonly inner: AgentBackend,
    private readonly config: DevflowConfig["caveman"],
  ) {
    this.name = inner.name;
    this.label = `${inner.label} + caveman`;
  }

  async isAvailable(): Promise<{ ok: boolean; reason?: string }> {
    return this.inner.isAvailable();
  }

  async prompt(input: string, opts: AgentPromptOptions = {}): Promise<string> {
    if (opts.stageId && this.config.stages.includes(opts.stageId)) {
      const caveman = cavemanSystem(this.config.level);
      const system = opts.system ? `${caveman}\n\n${opts.system}` : caveman;
      return this.inner.prompt(input, { ...opts, system });
    }
    return this.inner.prompt(input, opts);
  }
}
