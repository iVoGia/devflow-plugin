import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { logger, pc } from "../logger.js";
import type { IntakeVerdict } from "./types.js";

const MAX_ROUNDS = 5;

/** Asks intake questions in the terminal until the user skips or answers all. */
export async function askIntakeQuestions(
  questions: string[],
): Promise<Record<string, string>> {
  const answers: Record<string, string> = {};
  if (questions.length === 0) return answers;

  if (!process.stdin.isTTY) {
    throw new Error(
      "Interactive intake requires a TTY. Use gate+resume instead: " +
        "answer the printed questions, then `devflow run --resume <id> --from intake \"...\"`",
    );
  }

  logger.heading("DevFlow Intake — please answer");
  logger.info(
    pc.dim("Press Enter on an empty line to skip a question. Type 'done' to finish early."),
  );

  const rl = readline.createInterface({ input, output });
  try {
    for (const q of questions) {
      const a = await rl.question(`\n${pc.cyan("?")} ${q}\n> `);
      const trimmed = a.trim();
      if (trimmed.toLowerCase() === "done") break;
      if (trimmed) answers[q] = trimmed;
    }
  } finally {
    rl.close();
  }

  return answers;
}

/**
 * Interactive intake loop: evaluate → ask → re-evaluate until ready or max rounds.
 * The evaluateFn must return an updated verdict each round.
 */
export async function runInteractiveIntakeLoop(
  evaluateFn: (priorAnswers: Record<string, string>) => Promise<IntakeVerdict>,
): Promise<{ verdict: IntakeVerdict; answers: Record<string, string> }> {
  let answers: Record<string, string> = {};

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const verdict = await evaluateFn(answers);
    if (verdict.ready) {
      return { verdict, answers };
    }

    const newQuestions = verdict.questions.filter((q) => !answers[q]);
    if (newQuestions.length === 0) {
      logger.warn("No new questions; proceeding with collected answers.");
      return { verdict: { ...verdict, ready: true }, answers };
    }

    logger.info(`\nRound ${round}/${MAX_ROUNDS} — need more information:`);
    const batch = await askIntakeQuestions(newQuestions);
    answers = { ...answers, ...batch };

    if (Object.keys(batch).length === 0) {
      logger.warn("No answers provided; stopping interactive intake.");
      return { verdict, answers };
    }
  }

  const finalVerdict = await evaluateFn(answers);
  return { verdict: finalVerdict, answers };
}
