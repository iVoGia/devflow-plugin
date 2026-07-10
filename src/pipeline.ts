import { promises as fs } from "node:fs";
import path from "node:path";
import { createAgent } from "./agent/index.js";
import type { DevflowConfig } from "./config.js";
import { logger, pc } from "./logger.js";
import { allStages } from "./stages/index.js";
import type {
  SharedState,
  Stage,
  StageContext,
  StageResult,
  StageStatus,
} from "./stages/types.js";
import {
  FIXBUG_STAGE_IDS,
  presetFixbugShared,
  type WorkflowMode,
} from "./workflow/fixbug.js";

export interface StageRecord {
  id: string;
  title: string;
  status: StageStatus;
  message?: string;
  artifacts?: string[];
  startedAt?: string;
  finishedAt?: string;
}

export interface RunState {
  id: string;
  request: string;
  createdAt: string;
  updatedAt: string;
  agent: string;
  mode?: WorkflowMode;
  shared: SharedState;
  stages: StageRecord[];
}

export interface RunOptions {
  request: string;
  cwd: string;
  config: DevflowConfig;
  /** Resume an existing run id, or "latest". */
  resume?: string;
  /** Start from this stage id (skip earlier ones). */
  from?: string;
  /** Only run these stage ids. */
  only?: string[];
  /** Print planned stages without executing. */
  dryRun?: boolean;
  /** Ask clarifying questions in the terminal during intake. */
  interactive?: boolean;
  /** Workflow mode: default (full pipeline) or fixbug (shorter bug-fix path). */
  mode?: WorkflowMode;
}

const RUNS_SUBDIR = path.join(".devflow", "runs");

function newRunId(): string {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\..+/, "");
  const rand = Math.random().toString(36).slice(2, 6);
  return `${stamp}-${rand}`;
}

function runsRoot(cwd: string): string {
  return path.join(cwd, RUNS_SUBDIR);
}

async function saveState(cwd: string, state: RunState): Promise<void> {
  state.updatedAt = new Date().toISOString();
  const dir = path.join(runsRoot(cwd), state.id);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "state.json"),
    JSON.stringify(state, null, 2),
    "utf8",
  );
}

async function loadState(cwd: string, id: string): Promise<RunState> {
  const resolvedId = id === "latest" ? await latestRunId(cwd) : id;
  if (!resolvedId) throw new Error("No previous run found to resume.");
  const file = path.join(runsRoot(cwd), resolvedId, "state.json");
  const raw = await fs.readFile(file, "utf8");
  return JSON.parse(raw) as RunState;
}

async function latestRunId(cwd: string): Promise<string | null> {
  try {
    const entries = await fs.readdir(runsRoot(cwd), { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    dirs.sort();
    return dirs.at(-1) ?? null;
  } catch {
    return null;
  }
}

function resolveMode(opts: RunOptions, state?: RunState): WorkflowMode {
  if (opts.mode && opts.mode !== "default") return opts.mode;
  if (state?.mode) return state.mode;
  if (state?.shared.workflowMode === "fixbug") return "fixbug";
  return "default";
}

function planStages(
  stages: Stage[],
  config: DevflowConfig,
  opts: RunOptions,
  mode: WorkflowMode,
): Stage[] {
  let selected = stages.filter((s) => s.enabled(config));

  if (mode === "fixbug") {
    const allow = new Set<string>(FIXBUG_STAGE_IDS);
    selected = selected.filter((s) => allow.has(s.id));
  } else {
    selected = selected.filter((s) => s.id !== "rootcause");
  }

  if (opts.only && opts.only.length > 0) {
    const set = new Set(opts.only);
    selected = selected.filter((s) => set.has(s.id));
  }
  if (opts.from) {
    const idx = selected.findIndex((s) => s.id === opts.from);
    if (idx === -1) {
      throw new Error(`Unknown --from stage: ${opts.from}`);
    }
    selected = selected.slice(idx);
  }
  return selected;
}

function statusIcon(status: StageStatus): string {
  switch (status) {
    case "passed":
      return pc.green("✓");
    case "failed":
      return pc.red("✗");
    case "skipped":
      return pc.dim("∅");
  }
}

export async function runPipeline(opts: RunOptions): Promise<RunState> {
  const { cwd, config } = opts;
  const agent = createAgent(config);

  let state: RunState;
  if (opts.resume) {
    state = await loadState(cwd, opts.resume);
    if (opts.request.trim()) {
      state.request = opts.request.trim();
      logger.info(`${pc.dim("Updated request:")} ${state.request}`);
    }
    logger.info(`Resuming run ${pc.bold(state.id)}`);
  } else {
    state = {
      id: newRunId(),
      request: opts.request,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      agent: agent.name,
      mode: opts.mode ?? "default",
      shared: {},
      stages: [],
    };
    if (opts.mode === "fixbug") {
      Object.assign(state.shared, presetFixbugShared());
    }
  }

  const mode = resolveMode(opts, state);
  state.mode = mode;

  const runDir = path.join(runsRoot(cwd), state.id);
  const plan = planStages(allStages, config, opts, mode);

  logger.heading(`DevFlow run ${state.id}`);
  logger.info(`${pc.dim("Request:")} ${state.request}`);
  logger.info(`${pc.dim("Agent:  ")} ${agent.label}`);
  if (mode === "fixbug") logger.info(`${pc.dim("Mode:   ")} fixbug (5 Whys, no intent classification)`);
  else if (opts.interactive) logger.info(`${pc.dim("Mode:   ")} interactive intake`);
  logger.info(`${pc.dim("Stages: ")} ${plan.map((s) => s.id).join(" → ")}`);

  if (opts.dryRun) {
    logger.warn("Dry run: no stages executed.");
    return state;
  }

  await fs.mkdir(runDir, { recursive: true });

  const passedIds = new Set(
    state.stages.filter((s) => s.status === "passed").map((s) => s.id),
  );

  for (const stage of plan) {
    // Skip stages already passed on a resume, unless explicitly re-selected.
    if (opts.resume && passedIds.has(stage.id) && !opts.only) {
      logger.info(`${statusIcon("passed")} ${stage.title} ${pc.dim("(cached)")}`);
      continue;
    }

    logger.divider();
    logger.step(pc.bold(stage.title));

    const record: StageRecord = {
      id: stage.id,
      title: stage.title,
      status: "skipped",
      startedAt: new Date().toISOString(),
    };

    const ctx: StageContext = {
      request: state.request,
      cwd,
      config,
      agent,
      runDir,
      shared: state.shared,
      interactive: opts.interactive,
    };

    // Preflight
    if (stage.preflight) {
      const pf = await stage.preflight(ctx);
      if (!pf.ok) {
        record.status = "skipped";
        record.message = `preflight: ${pf.reason}`;
        record.finishedAt = new Date().toISOString();
        upsertStage(state, record);
        await saveState(cwd, state);
        logger.warn(`Skipped (${pf.reason})`);
        continue;
      }
    }

    // Run
    let result: StageResult;
    try {
      result = await stage.run(ctx);
    } catch (err) {
      result = {
        status: "failed",
        message: err instanceof Error ? err.message : String(err),
        gate: true,
      };
    }

    record.status = result.status;
    record.message = result.message;
    record.artifacts = result.artifacts;
    record.finishedAt = new Date().toISOString();
    if (result.data) Object.assign(state.shared, result.data);
    if (result.data?.enrichedRequest && typeof result.data.enrichedRequest === "string") {
      state.request = result.data.enrichedRequest;
    }
    upsertStage(state, record);
    await saveState(cwd, state);

    if (result.status === "passed") {
      logger.success(result.message ?? `${stage.title} done`);
    } else if (result.status === "skipped") {
      logger.warn(result.message ?? `${stage.title} skipped`);
    } else {
      logger.error(result.message ?? `${stage.title} failed`);
      const gate = result.gate ?? true;
      if (gate) {
        logger.divider();
        const resumeHint =
          stage.id === "intake"
            ? `devflow run --resume ${state.id} --from intake --interactive\n` +
              `    or: devflow run --resume ${state.id} --from intake "full request with your answers"`
            : `devflow run --resume ${state.id}`;
        logger.error(`Pipeline halted at "${stage.id}". Resume with:\n  ${resumeHint}`);
        printSummary(state);
        return state;
      }
      logger.warn("Non-gating failure: continuing.");
    }
  }

  logger.divider();
  logger.success("Pipeline completed.");
  printSummary(state);
  return state;
}

function upsertStage(state: RunState, record: StageRecord): void {
  const idx = state.stages.findIndex((s) => s.id === record.id);
  if (idx === -1) state.stages.push(record);
  else state.stages[idx] = record;
}

function printSummary(state: RunState): void {
  logger.heading("Summary");
  for (const s of state.stages) {
    const extra = s.message ? pc.dim(` — ${s.message}`) : "";
    logger.info(`  ${statusIcon(s.status)} ${s.title}${extra}`);
  }
  if (state.shared.prUrl) {
    logger.info(`\n${pc.bold("PR:")} ${state.shared.prUrl}`);
  }
}
