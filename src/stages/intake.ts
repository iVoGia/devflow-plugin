import { promises as fs } from "node:fs";
import path from "node:path";
import { enrichRequest, evaluateIntake } from "../intake/evaluate.js";
import { runInteractiveIntakeLoop } from "../intake/interactive.js";
import type { RepoProfile } from "../util/stack-detect.js";
import { logger, pc } from "../logger.js";
import type { Stage } from "./types.js";

/**
 * Intake / Clarify: Analyst role — ensures the request is actionable before
 * SpecKit. Gates the pipeline when information is missing (gate+resume), or
 * runs an interactive Q&A loop when `ctx.interactive` is true.
 */
export const intakeStage: Stage = {
  id: "intake",
  title: "Intake / Clarify (Analyst)",
  enabled: (c) => c.stages.intake.enabled,

  async run(ctx) {
    const profile = (ctx.shared.repoProfile as RepoProfile | undefined) ?? {
      projectMode: "greenfield" as const,
      platform: "unknown" as const,
      languages: [],
      frameworks: [],
      markers: [],
      sourceFileCount: 0,
      e2eSuggestion: "none" as const,
      confidence: 0.2,
    };

    const priorAnswers = (ctx.shared.intakeAnswers as Record<string, string>) ?? {};

    const evaluate = (answers: Record<string, string>) =>
      evaluateIntake(
        {
          request: ctx.request,
          repoProfile: profile,
          knowledge: ctx.shared.knowledge,
          priorAnswers: answers,
        },
        ctx.agent,
      );

    let verdict;
    let answers = priorAnswers;

    if (ctx.interactive) {
      logger.step("Interactive intake — asking clarifying questions");
      const loop = await runInteractiveIntakeLoop(evaluate);
      verdict = loop.verdict;
      answers = loop.answers;

      if (!verdict.ready && Object.keys(answers).length > 0) {
        logger.warn("Still not fully ready; proceeding with collected answers.");
        verdict = { ...verdict, ready: true };
      }
    } else {
      verdict = await evaluate(priorAnswers);
    }

    const artifact = path.join(ctx.runDir, "intake-verdict.json");
    await fs.writeFile(
      artifact,
      JSON.stringify({ ...verdict, answers }, null, 2),
      "utf8",
    );

    if (verdict.ready) {
      const enriched = enrichRequest(ctx.request, answers);
      return {
        status: "passed",
        message: verdict.summary ?? "Intake complete — ready to specify.",
        artifacts: [path.relative(ctx.cwd, artifact)],
        data: {
          intakeReady: true,
          intakeAnswers: answers,
          enrichedRequest: enriched !== ctx.request ? enriched : undefined,
        },
      };
    }

    // Gate: save questions for resume
    const questionsFile = path.join(ctx.runDir, "intake-questions.json");
    await fs.writeFile(
      questionsFile,
      JSON.stringify({ questions: verdict.questions, missing: verdict.missing }, null, 2),
      "utf8",
    );

    logger.heading("Intake — more information needed");
    for (const q of verdict.questions) {
      logger.info(`  ${pc.cyan("?")} ${q}`);
    }
    logger.divider();
    logger.info("Options:");
    logger.info(`  1) Interactive:  devflow run --resume ${path.basename(ctx.runDir)} --from intake --interactive`);
    logger.info(`  2) One-shot:      devflow run --resume ${path.basename(ctx.runDir)} --from intake "your full request with answers"`);
    logger.info(`  3) In Cursor:     answer the questions in chat, then resume with an enriched request`);

    return {
      status: "failed",
      message: `Missing: ${verdict.missing.join(", ") || "details"}. ${verdict.questions.length} question(s) to answer.`,
      artifacts: [
        path.relative(ctx.cwd, artifact),
        path.relative(ctx.cwd, questionsFile),
      ],
      data: {
        intakeReady: false,
        intakeQuestions: verdict.questions,
        intakeMissing: verdict.missing,
      },
      gate: ctx.config.stages.intake.gate,
    };
  },
};
