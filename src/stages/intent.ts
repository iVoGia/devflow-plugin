import { extractJson } from "../agent/index.js";
import type { IntentType, Stage } from "./types.js";

const SYSTEM = `You are an intent classifier for a software development workflow.
Classify the user's request into exactly one of: "feature", "bug", "refactor".
- feature: new functionality or a new project/idea.
- bug: something is broken and must be fixed.
- refactor: improve/restructure existing code without changing behavior.
Respond with ONLY a JSON object: {"type": "...", "rationale": "one short sentence"}.`;

export const intentStage: Stage = {
  id: "intent",
  title: "Intent Classification",
  enabled: (c) => c.stages.intent.enabled,

  async run(ctx) {
    const response = await ctx.agent.prompt(
      `Request:\n"""\n${ctx.request}\n"""`,
      { system: SYSTEM, cwd: ctx.cwd, timeoutMs: 2 * 60_000 },
    );

    const parsed = extractJson<{ type?: string; rationale?: string }>(response);
    const raw = (parsed?.type ?? "").toLowerCase();
    const valid: IntentType[] = ["feature", "bug", "refactor"];
    const type = (valid.includes(raw as IntentType) ? raw : "feature") as IntentType;
    const rationale = parsed?.rationale ?? "defaulted to feature";

    return {
      status: "passed",
      message: `Intent: ${type} (${rationale})`,
      data: { intent: type, intentRationale: rationale },
    };
  },
};
