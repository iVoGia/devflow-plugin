import type { AgentBackend } from "../agent/index.js";
import type { DevflowConfig } from "../config.js";
import type { RepoProfile } from "../util/stack-detect.js";

export type IntentType = "feature" | "bug" | "refactor";

export type StageStatus = "passed" | "failed" | "skipped";

export interface StageResult {
  status: StageStatus;
  /** Short human-readable summary shown in the run report. */
  message?: string;
  /** Files produced by this stage (relative to project root). */
  artifacts?: string[];
  /** Arbitrary structured data merged into the shared run context. */
  data?: Record<string, unknown>;
  /**
   * If true and status is "failed", the pipeline halts. Defaults to the
   * stage's configured `gate`. Non-gating stages only warn on failure.
   */
  gate?: boolean;
}

export interface PreflightResult {
  ok: boolean;
  reason?: string;
}

export interface StageContext {
  /** The raw user request that started the run. */
  request: string;
  /** Absolute path to the target project root. */
  cwd: string;
  config: DevflowConfig;
  agent: AgentBackend;
  /** Absolute path to this run's artifact directory (.devflow/runs/<id>). */
  runDir: string;
  /** Shared, growing bag of data accumulated across stages. */
  shared: SharedState;
  /** When true, intake stage asks clarifying questions in the terminal. */
  interactive?: boolean;
}

export interface SharedState {
  intent?: IntentType;
  intentRationale?: string;
  knowledge?: string;
  repoProfile?: RepoProfile;
  intakeReady?: boolean;
  intakeAnswers?: Record<string, string>;
  intakeQuestions?: string[];
  enrichedRequest?: string;
  specPath?: string;
  planPath?: string;
  contextDocs?: string;
  relevantFiles?: string[];
  branch?: string;
  prUrl?: string;
  [key: string]: unknown;
}

export interface Stage {
  /** Stable id, matches the config.stages key. */
  id: string;
  /** Title shown in logs. */
  title: string;
  /** Whether this stage is enabled given the config. */
  enabled(config: DevflowConfig): boolean;
  /** Verify external tools/keys are present before running. */
  preflight?(ctx: StageContext): Promise<PreflightResult>;
  /** Execute the stage. */
  run(ctx: StageContext): Promise<StageResult>;
}
