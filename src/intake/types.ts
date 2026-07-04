import type { RepoProfile } from "../util/stack-detect.js";

export interface IntakeVerdict {
  ready: boolean;
  questions: string[];
  missing: string[];
  summary?: string;
  answers?: Record<string, string>;
}

export interface IntakeEvaluateInput {
  request: string;
  repoProfile: RepoProfile;
  knowledge?: string;
  priorAnswers?: Record<string, string>;
}
