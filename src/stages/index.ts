import { bmadStage } from "./bmad.js";
import { codingStage } from "./coding.js";
import { contextStage } from "./context.js";
import { docsStage } from "./docs.js";
import { e2eStage } from "./e2e.js";
import { harnessStage } from "./harness.js";
import { intentStage } from "./intent.js";
import { prStage } from "./pr.js";
import { speckitStage } from "./speckit.js";
import { staticStage } from "./static.js";
import { strixStage } from "./strix.js";
import { validateStage } from "./validate.js";
import type { Stage } from "./types.js";

/** The full pipeline, in execution order (matches the workflow diagram). */
export const allStages: Stage[] = [
  intentStage,
  harnessStage,
  speckitStage,
  validateStage,
  bmadStage,
  contextStage,
  codingStage,
  staticStage,
  e2eStage,
  strixStage,
  docsStage,
  prStage,
];

export const stageIds = allStages.map((s) => s.id);
