import type { DevflowConfig } from "../config.js";

export type CavemanLevel = DevflowConfig["caveman"]["level"];

/** DevFlow subset of caveman levels (no wenyan in pipeline). */
const LEVEL_RULES: Record<CavemanLevel, string> = {
  lite: "No filler/hedging. Keep articles and full sentences. Professional but tight.",
  full: "Drop articles, fragments OK, short synonyms. No tool-call narration or decorative tables.",
  ultra:
    "Strip conjunctions when meaning stays clear. One word when enough. No invented abbreviations.",
};

/**
 * System prompt for selective caveman stages.
 * Based on JuliusBrussee/caveman (MIT) — injected in headless CLI mode.
 */
export function cavemanSystem(level: CavemanLevel): string {
  return `DevFlow caveman mode (${level}). Respond terse. Technical substance stays. Fluff dies.

${LEVEL_RULES[level]}

Rules: drop pleasantries and hedging; keep code, paths, API names, error strings, and JSON structure exact.
When output must be JSON or Markdown artifact, still satisfy the format — only shrink surrounding prose.
Preserve the user's language. No self-reference to caveman mode.`;
}

export const DEFAULT_CAVEMAN_STAGES = ["intent", "intake", "context", "pr"] as const;
