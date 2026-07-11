import { promises as fs } from "node:fs";
import path from "node:path";
import { logger } from "../logger.js";
import { exists } from "../util/fsx.js";
import { templatesDir } from "../util/paths.js";

/** Installs vendored caveman SKILL.md for IDE slash /caveman in chat. */
export async function installCavemanSkill(cwd: string): Promise<boolean> {
  const src = path.join(templatesDir(), "caveman", "skills", "caveman", "SKILL.md");
  const dest = path.join(cwd, ".claude", "skills", "caveman", "SKILL.md");

  if (!(await exists(src))) {
    logger.warn("Caveman skill template missing; skip IDE skill install.");
    return false;
  }

  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(src, dest);
  logger.success(`Installed ${path.relative(cwd, dest)}`);
  return true;
}
