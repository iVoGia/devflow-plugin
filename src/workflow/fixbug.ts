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

Do NOT recommend superficial patches that only hide the symptom.

BE CONCISE — this document is read by both humans and downstream agents:
- Symptom: 1-2 lines.
- Each Why: exactly one line.
- Root cause: at most 2 sentences.
- Fix strategy: at most 3 short bullets.
- Verification: at most 3 short bullets.
No filler prose, no repetition of the bug report.`;

/**
 * Extracts a short root-cause summary (Root cause + Fix strategy sections)
 * from a rootcause.md document. Pure string parsing — no LLM call.
 */
export function extractRootCauseSummary(markdown: string): string {
  const sections = new Map<string, string>();
  const matches = markdown.split(/^##\s+/m).slice(1);
  for (const block of matches) {
    const newline = block.indexOf("\n");
    if (newline === -1) continue;
    const heading = block.slice(0, newline).trim().toLowerCase();
    const body = block.slice(newline + 1).trim();
    sections.set(heading, body);
  }

  const pick = (needle: string): string | undefined => {
    for (const [heading, body] of sections) {
      if (heading.includes(needle)) return body;
    }
    return undefined;
  };

  const rootCause = pick("root cause");
  const fix = pick("fix strategy") ?? pick("fix");

  const parts: string[] = [];
  if (rootCause) parts.push(`Root cause: ${clip(rootCause, 300)}`);
  if (fix) parts.push(`Fix: ${clip(fix, 300)}`);
  return parts.join("\n");
}

function clip(text: string, max: number): string {
  const flat = text
    .split("\n")
    .map((l) => l.replace(/^[-*]\s+/, "").trim())
    .filter(Boolean)
    .join(" ");
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`;
}

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
