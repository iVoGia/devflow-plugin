import type { SharedState, StageContext } from "../stages/types.js";

export type WorkflowMode = "default" | "fixbug";

/** Stages executed in fixbug mode (shorter pipeline, no intent/intake/spec/plan). */
export const FIXBUG_STAGE_IDS = [
  "harness",
  "discover",
  "rootcause",
  "context",
  "coding",
  "static",
  "e2e",
  "strix",
  "docs",
  "pr",
] as const;

export const FIVE_WHYS_PROMPT = `Apply the Japanese 5 Whys (なぜなぜ分析) root cause analysis method:

1. State the problem symptom clearly (what the user sees, when it happens).
2. Ask "Why?" five times in sequence — each answer must lead to the next why.
3. Identify the true root cause (not the symptom or a superficial trigger).
4. Propose a fix strategy that addresses the root cause, not a band-aid on the symptom.
5. Define verification steps and a regression test to prevent recurrence.

Do NOT recommend superficial patches that only hide the symptom.`;

export function isFixbugMode(ctx: Pick<StageContext, "shared">): boolean {
  return ctx.shared.workflowMode === "fixbug";
}

export function isFixbugShared(shared: SharedState): boolean {
  return shared.workflowMode === "fixbug";
}

/** Preset shared state for a new fixbug run (no LLM intent classification). */
export function presetFixbugShared(): Partial<SharedState> {
  return {
    intent: "bug",
    workflowMode: "fixbug",
    intentRationale: "fixbug mode (skipped LLM classification)",
  };
}
