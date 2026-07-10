import { promises as fs } from "node:fs";
import path from "node:path";
import { generateAll } from "../generators/index.js";
import { loadConfig, DEVFLOW_DIR } from "./config.js";
import { bootstrapDependencies } from "./deps/bootstrap.js";
import { logger, pc } from "./logger.js";
import { exists } from "./util/fsx.js";
import { commandsDir, templatesDir } from "./util/paths.js";

export interface InitOptions {
  force?: boolean;
  /** Skip auto-installing missing workflow dependencies. */
  skipInstall?: boolean;
}

/**
 * Scaffolds DevFlow into the target project:
 *  - .devflow/config.yaml
 *  - .devflow/knowledge/{business,architecture,coding-rules}.md
 *  - IDE commands for Cursor, Claude Code, and GitHub Copilot.
 */
export async function init(cwd: string, opts: InitOptions = {}): Promise<void> {
  const templates = templatesDir();
  const devflowDir = path.join(cwd, DEVFLOW_DIR);

  logger.heading("Initializing DevFlow");

  // config.yaml
  const configDest = path.join(devflowDir, "config.yaml");
  await fs.mkdir(devflowDir, { recursive: true });
  if ((await exists(configDest)) && !opts.force) {
    logger.warn(`${path.relative(cwd, configDest)} exists (use --force to overwrite).`);
  } else {
    await fs.copyFile(path.join(templates, "config.yaml"), configDest);
    logger.success(`Wrote ${path.relative(cwd, configDest)}`);
  }

  // knowledge files
  const knowledgeDest = path.join(devflowDir, "knowledge");
  await fs.mkdir(knowledgeDest, { recursive: true });
  const knowledgeSrc = path.join(templates, "knowledge");
  for (const file of await fs.readdir(knowledgeSrc)) {
    const dest = path.join(knowledgeDest, file);
    if ((await exists(dest)) && !opts.force) {
      logger.warn(`${path.relative(cwd, dest)} exists (skipped).`);
      continue;
    }
    await fs.copyFile(path.join(knowledgeSrc, file), dest);
    logger.success(`Wrote ${path.relative(cwd, dest)}`);
  }

  // IDE commands
  const written = await generateAll(cwd, commandsDir());
  logger.step("Generated IDE commands:");
  for (const p of written) logger.info(`    ${pc.dim(p)}`);

  logger.divider();
  logger.success("DevFlow initialized.");

  logger.step("Checking workflow dependencies…");
  const config = await loadConfig(cwd);
  const { allRequiredOk } = await bootstrapDependencies(config, {
    skipInstall: opts.skipInstall,
  });

  logger.divider();
  logger.info(
    `Next:\n` +
      `  1. Fill in ${pc.cyan(".devflow/knowledge/*.md")}\n` +
      (allRequiredOk
        ? `  2. Use ${pc.cyan("/devflow <request>")} or ${pc.cyan("/devflow-fixbug <bug>")} in your editor\n`
        : `  2. Fix remaining dependencies (see above), then ${pc.cyan("devflow doctor")}\n` +
          `  3. Use ${pc.cyan("/devflow <request>")} in Cursor / Claude / Copilot`),
  );
}
