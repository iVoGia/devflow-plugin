import { promises as fs } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { generateClaude } from "./claude.js";
import { generateCopilot } from "./copilot.js";
import { generateCursor } from "./cursor.js";
import { generateSkill } from "./skill.js";
import { commandSchema, type CommandDef, type GeneratedFile } from "./types.js";

export type { CommandDef, GeneratedFile } from "./types.js";

export async function loadCommands(commandsDir: string): Promise<CommandDef[]> {
  const entries = await fs.readdir(commandsDir).catch(() => [] as string[]);
  const yamls = entries.filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
  const commands: CommandDef[] = [];
  for (const file of yamls) {
    const raw = await fs.readFile(path.join(commandsDir, file), "utf8");
    const parsed = commandSchema.parse(parseYaml(raw));
    commands.push(parsed);
  }
  return commands;
}

/** Produces every generated file (not written) for a set of commands. */
export function generateFiles(commands: CommandDef[]): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  for (const cmd of commands) {
    files.push(generateCursor(cmd));
    files.push(generateClaude(cmd));
    files.push(generateCopilot(cmd));
    files.push(generateSkill(cmd));
  }
  return files;
}

/** Generates and writes all IDE command files into the target project. */
export async function generateAll(
  targetRoot: string,
  commandsDir: string,
): Promise<string[]> {
  const commands = await loadCommands(commandsDir);
  const files = generateFiles(commands);
  const written: string[] = [];
  for (const file of files) {
    const full = path.join(targetRoot, file.path);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, file.contents, "utf8");
    written.push(file.path);
  }
  return written;
}
