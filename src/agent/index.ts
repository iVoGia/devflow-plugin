import type { DevflowConfig } from "../config.js";
import { ApiBackend } from "./api.js";
import { ClaudeBackend } from "./claude.js";
import { CursorBackend } from "./cursor.js";
import type { AgentBackend } from "./types.js";

export type { AgentBackend, AgentPromptOptions } from "./types.js";

export function createAgent(config: DevflowConfig): AgentBackend {
  switch (config.agent) {
    case "cursor":
      return new CursorBackend(config.agentCommand.cursor);
    case "api":
      return new ApiBackend();
    case "claude":
    default:
      return new ClaudeBackend(config.agentCommand.claude);
  }
}

/**
 * Attempts to extract a JSON object/array from an LLM response that may be
 * wrapped in prose or ```json fences.
 */
export function extractJson<T = unknown>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.search(/[[{]/);
  if (start === -1) return null;
  // Try progressively shorter substrings ending at the last bracket.
  for (let end = candidate.length; end > start; end--) {
    const slice = candidate.slice(start, end).trim();
    const last = slice.at(-1);
    if (last !== "}" && last !== "]") continue;
    try {
      return JSON.parse(slice) as T;
    } catch {
      // keep shrinking
    }
  }
  return null;
}
