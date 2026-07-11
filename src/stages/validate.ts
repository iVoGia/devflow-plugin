import { promises as fs } from "node:fs";
import path from "node:path";
import { extractJson } from "../agent/index.js";
import type { Stage } from "./types.js";

const SYSTEM = `You are a requirements reviewer. Given a specification, judge whether it is
implementation-ready: unambiguous scope, testable acceptance criteria, and no
critical missing information. Respond with ONLY JSON:
{"ready": true|false, "issues": ["..."], "summary": "one sentence"}`;

/**
 * Requirement Validation gate: reads the spec produced by the SpecKit stage and
 * asks the agent to confirm it is implementation-ready. Fails the pipeline if not.
 */
export const validateStage: Stage = {
  id: "validate",
  title: "Requirement Validation",
  enabled: (c) => c.stages.validate.enabled,

  async run(ctx) {
    const specRel = ctx.shared.specPath;
    if (!specRel) {
      return {
        status: "failed",
        message: "No spec available to validate.",
        gate: ctx.config.stages.validate.gate,
      };
    }

    let spec: string;
    try {
      spec = await fs.readFile(path.join(ctx.cwd, specRel), "utf8");
    } catch {
      return {
        status: "failed",
        message: `Spec not readable: ${specRel}`,
        gate: ctx.config.stages.validate.gate,
      };
    }

    const response = await ctx.agent.prompt(
      `Specification to validate:\n"""\n${spec}\n"""`,
      { system: SYSTEM, cwd: ctx.cwd, timeoutMs: 3 * 60_000, stageId: "validate" },
    );
    const verdict = extractJson<{
      ready?: boolean;
      issues?: string[];
      summary?: string;
    }>(response);

    // Persist the review for auditing.
    await fs.writeFile(
      path.join(ctx.runDir, "requirement-review.json"),
      JSON.stringify(verdict ?? { raw: response }, null, 2),
      "utf8",
    );

    if (verdict?.ready) {
      return {
        status: "passed",
        message: verdict.summary ?? "Spec is implementation-ready.",
      };
    }

    const issues = (verdict?.issues ?? ["Spec judged not ready."]).slice(0, 5);
    return {
      status: "failed",
      message: `Spec not ready: ${issues.join("; ")}`,
      gate: ctx.config.stages.validate.gate,
    };
  },
};
