import { extractJson } from "../agent/index.js";
import type { AgentBackend } from "../agent/types.js";
import type { IntakeEvaluateInput, IntakeVerdict } from "./types.js";

const ANALYST_SYSTEM = `You are a product analyst for a software development workflow.
Decide if the request contains enough information to start specification and implementation.

For GREENFIELD (new/empty project), require at minimum:
- target platform (web, iOS, Android, Flutter, or backend API)
- primary language/framework OR clear product type
- MVP scope (core screens/features)

For EXISTING projects, require:
- clear change scope aligned with the detected stack
- enough detail to locate what to change

Respond with ONLY JSON:
{"ready": true|false, "questions": ["..."], "missing": ["platform"|"stack"|"scope"|"..."], "summary": "one sentence"}`;

/** Rule-based pre-check before calling the LLM. */
export function ruleBasedIntake(input: IntakeEvaluateInput): IntakeVerdict | null {
  const req = input.request.trim();
  const words = req.split(/\s+/).length;
  const { repoProfile } = input;

  const hasPlatform =
    /\b(web|website|ios|iphone|android|mobile|flutter|react native|api|backend|desktop)\b/i.test(req) ||
    repoProfile.platform !== "unknown";
  const hasStack =
    /\b(react|vue|angular|next|node|express|swift|kotlin|flutter|django|fastapi|go|rust)\b/i.test(req) ||
    repoProfile.frameworks.length > 0 ||
    repoProfile.languages.length > 0;
  const hasScope = words >= 12 || /\b(mvp|screen|page|feature|module|auth|crud|dashboard)\b/i.test(req);

  if (repoProfile.projectMode === "greenfield") {
    const missing: string[] = [];
    if (!hasPlatform) missing.push("platform");
    if (!hasStack) missing.push("stack");
    if (!hasScope) missing.push("scope");

    if (missing.length === 0) {
      return {
        ready: true,
        questions: [],
        missing: [],
        summary: "Greenfield request has platform, stack, and scope signals.",
      };
    }

    if (missing.length >= 2) {
      return {
        ready: false,
        questions: buildDefaultQuestions(missing, repoProfile),
        missing,
        summary:
          words <= 4
            ? "Request is too vague for a greenfield project."
            : "Greenfield request is missing required details.",
      };
    }
  }

  // Existing project: very short bug/feature requests may still be OK if stack detected
  if (repoProfile.projectMode === "existing" && repoProfile.confidence >= 0.5 && words >= 6) {
    return {
      ready: true,
      questions: [],
      missing: [],
      summary: "Existing project with detected stack and sufficient request detail.",
    };
  }

  if (repoProfile.projectMode === "existing" && words < 5) {
    return {
      ready: false,
      questions: [
        "Which part of the existing codebase should change (file, screen, module, or API endpoint)?",
        "What is the expected behavior after the fix/feature?",
      ],
      missing: ["scope"],
      summary: "Request too short for an existing project.",
    };
  }

  return null; // defer to LLM
}

function buildDefaultQuestions(
  missing: string[],
  profile: IntakeEvaluateInput["repoProfile"],
): string[] {
  const q: string[] = [];
  if (missing.includes("platform")) {
    q.push("Bạn muốn làm web app, mobile app (iOS/Android), Flutter, hay backend API?");
  }
  if (missing.includes("stack")) {
    q.push(
      profile.platform === "web"
        ? "Stack ưu tiên: React, Vue, Next.js, hay backend Node/Python?"
        : "Ngôn ngữ/framework ưu tiên là gì (vd: SwiftUI, Kotlin, Flutter)?",
    );
  }
  if (missing.includes("scope")) {
    q.push("MVP gồm những màn hình/tính năng cốt lõi nào? Liệt kê 3–5 item.");
  }
  if (missing.includes("ui") || missing.includes("design")) {
    q.push("Có design system / Figma / reference UI nào cần bám theo không?");
  }
  return q.slice(0, 5);
}

/** Evaluates readiness; uses rules first, then LLM when available. */
export async function evaluateIntake(
  input: IntakeEvaluateInput,
  agent?: AgentBackend,
): Promise<IntakeVerdict> {
  const ruled = ruleBasedIntake(input);
  if (ruled?.ready) return { ...ruled, answers: input.priorAnswers };

  const profileJson = JSON.stringify(input.repoProfile, null, 2);
  const answersBlock = input.priorAnswers
    ? `\nPrior answers:\n${JSON.stringify(input.priorAnswers, null, 2)}`
    : "";

  if (agent) {
    try {
      const response = await agent.prompt(
        `Request:\n"""\n${input.request}\n"""\n\nRepo profile:\n${profileJson}${answersBlock}\n\nKnowledge:\n${(input.knowledge ?? "").slice(0, 4000)}`,
        { system: ANALYST_SYSTEM, timeoutMs: 2 * 60_000, stageId: "intake" },
      );
      const parsed = extractJson<IntakeVerdict>(response);
      if (parsed && typeof parsed.ready === "boolean") {
        return {
          ready: parsed.ready,
          questions: (parsed.questions ?? []).slice(0, 6),
          missing: parsed.missing ?? [],
          summary: parsed.summary,
          answers: input.priorAnswers,
        };
      }
    } catch {
      /* fall through to rules */
    }
  }

  if (ruled) return { ...ruled, answers: input.priorAnswers };

  // Fail closed: do not proceed with ambiguous requests when rules and LLM both defer.
  const missing: string[] = [];
  if (input.repoProfile.projectMode === "greenfield") {
    if (input.repoProfile.platform === "unknown") missing.push("platform");
    if (
      input.repoProfile.frameworks.length === 0 &&
      input.repoProfile.languages.length === 0
    ) {
      missing.push("stack");
    }
    if (input.request.trim().split(/\s+/).length < 12) missing.push("scope");
  }

  return {
    ready: false,
    questions: buildDefaultQuestions(
      missing.length > 0 ? missing : ["platform", "stack", "scope"],
      input.repoProfile,
    ),
    missing: missing.length > 0 ? missing : ["platform", "stack", "scope"],
    summary: "Insufficient detail and no agent available to clarify — intake blocked.",
    answers: input.priorAnswers,
  };
}

/** Merges Q&A answers into an enriched request string. */
export function enrichRequest(
  baseRequest: string,
  answers: Record<string, string>,
): string {
  const lines = Object.entries(answers)
    .filter(([, v]) => v.trim())
    .map(([q, a]) => `- Q: ${q}\n  A: ${a}`);
  if (lines.length === 0) return baseRequest;
  return `${baseRequest.trim()}\n\nAdditional context from intake:\n${lines.join("\n")}`;
}
