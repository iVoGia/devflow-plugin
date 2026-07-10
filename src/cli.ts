import { Command } from "commander";
import { generateAll } from "../generators/index.js";
import { loadConfig } from "./config.js";
import { doctor } from "./doctor.js";
import { init } from "./init.js";
import { logger, setVerbose } from "./logger.js";
import { runPipeline } from "./pipeline.js";
import type { WorkflowMode } from "./workflow/fixbug.js";
import { run as execRun } from "./util/exec.js";
import { commandsDir } from "./util/paths.js";

const program = new Command();

program
  .name("devflow")
  .description(
    "DevFlow: a workflow-as-plugin orchestrator that runs a full spec-driven pipeline and exposes it as slash commands for Cursor, Claude Code and GitHub Copilot.",
  )
  .version("0.2.2")
  .option("-v, --verbose", "verbose logging", false)
  .hook("preAction", (thisCommand) => {
    if (thisCommand.opts().verbose) setVerbose(true);
  });

program
  .command("init")
  .description("Scaffold DevFlow into the current project")
  .option("-f, --force", "overwrite existing files", false)
  .action(async (opts: { force?: boolean }) => {
    await init(process.cwd(), { force: opts.force });
  });

program
  .command("run")
  .description("Run the DevFlow pipeline for a request")
  .argument("[request...]", "the request (idea, bug, feature, or new project)")
  .option("--from <stage>", "start from this stage id")
  .option("--only <stages>", "comma-separated stage ids to run")
  .option("--resume [id]", "resume a previous run (id or 'latest')")
  .option("--dry-run", "print the planned stages without executing", false)
  .option(
    "-i, --interactive",
    "ask clarifying questions in the terminal during intake (Analyst role)",
    false,
  )
  .option(
    "--mode <mode>",
    "workflow mode: default | fixbug (shorter bug-fix pipeline with 5 Whys)",
    "default",
  )
  .action(
    async (
      requestParts: string[],
      opts: {
        from?: string;
        only?: string;
        resume?: string | boolean;
        dryRun?: boolean;
        interactive?: boolean;
        mode?: string;
      },
    ) => {
      const cwd = process.cwd();
      const config = await loadConfig(cwd);
      const request = (requestParts ?? []).join(" ").trim();

      const resume =
        opts.resume === true ? "latest" : (opts.resume as string | undefined);

      const modeRaw = (opts.mode ?? "default").toLowerCase();
      if (modeRaw !== "default" && modeRaw !== "fixbug") {
        logger.error(`Unknown --mode: ${opts.mode}. Use "default" or "fixbug".`);
        process.exitCode = 1;
        return;
      }
      const mode = modeRaw as WorkflowMode;

      if (!request && !resume) {
        logger.error('Provide a request, e.g. devflow run "Add dark mode toggle"');
        process.exitCode = 1;
        return;
      }

      const state = await runPipeline({
        request,
        cwd,
        config,
        from: opts.from,
        only: opts.only ? opts.only.split(",").map((s) => s.trim()) : undefined,
        resume,
        dryRun: opts.dryRun,
        interactive: opts.interactive,
        mode,
      });

      const failed = state.stages.some((s) => s.status === "failed");
      process.exitCode = failed ? 1 : 0;
    },
  );

program
  .command("doctor")
  .description("Check that required tools and API keys are available")
  .action(async () => {
    const ok = await doctor(process.cwd());
    process.exitCode = ok ? 0 : 1;
  });

program
  .command("generate")
  .description("Regenerate IDE command files (Cursor/Claude/Copilot)")
  .action(async () => {
    const written = await generateAll(process.cwd(), commandsDir());
    logger.success(`Generated ${written.length} command file(s).`);
    for (const p of written) logger.info(`  ${p}`);
  });

program
  .command("merge")
  .description("Merge the PR for the current branch (opt-in, after review)")
  .option("--squash", "squash merge", false)
  .action(async (opts: { squash?: boolean }) => {
    const args = ["pr", "merge", "--auto"];
    args.push(opts.squash ? "--squash" : "--merge");
    const res = await execRun("gh", args, { cwd: process.cwd() });
    if (res.ok) logger.success("Merge requested via gh.");
    else {
      logger.error(res.stderr || "gh pr merge failed.");
      process.exitCode = 1;
    }
  });

program.parseAsync(process.argv).catch((err) => {
  logger.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
