import { logger } from "../logger.js";
import type { AgentBackend, AgentPromptOptions } from "./types.js";

/**
 * Direct LLM backend that talks to any OpenAI-compatible /chat/completions
 * endpoint. Configured entirely via environment variables so no secrets live
 * in the repo:
 *   - DEVFLOW_LLM_API_KEY (or LLM_API_KEY / OPENAI_API_KEY)
 *   - DEVFLOW_LLM_BASE_URL (default https://api.openai.com/v1)
 *   - DEVFLOW_LLM_MODEL    (default gpt-4o-mini)
 *
 * Note: this backend can reason and produce text but cannot edit files on
 * disk. Use it for classification/validation stages; for coding stages prefer
 * the claude/cursor backends which have file-editing tools.
 */
export class ApiBackend implements AgentBackend {
  readonly name = "api";
  readonly label = "Direct LLM API";

  private get apiKey(): string | undefined {
    return (
      process.env.DEVFLOW_LLM_API_KEY ||
      process.env.LLM_API_KEY ||
      process.env.OPENAI_API_KEY
    );
  }

  private get baseUrl(): string {
    return (process.env.DEVFLOW_LLM_BASE_URL || "https://api.openai.com/v1").replace(
      /\/$/,
      "",
    );
  }

  private get model(): string {
    return process.env.DEVFLOW_LLM_MODEL || "gpt-4o-mini";
  }

  async isAvailable(): Promise<{ ok: boolean; reason?: string }> {
    if (!this.apiKey) {
      return {
        ok: false,
        reason:
          "No API key. Set DEVFLOW_LLM_API_KEY (or LLM_API_KEY / OPENAI_API_KEY).",
      };
    }
    return { ok: true };
  }

  async prompt(input: string, opts: AgentPromptOptions = {}): Promise<string> {
    if (!this.apiKey) {
      throw new Error("ApiBackend used without an API key set.");
    }
    logger.debug(`api ${this.model} (len=${input.length})`);

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      opts.timeoutMs ?? 5 * 60_000,
    );

    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            ...(opts.system
              ? [{ role: "system", content: opts.system }]
              : []),
            { role: "user", content: input },
          ],
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`LLM API ${res.status}: ${text.slice(0, 500)}`);
      }

      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      return (json.choices?.[0]?.message?.content ?? "").trim();
    } finally {
      clearTimeout(timeout);
    }
  }
}
