import type { CommandDef, GeneratedFile } from "./types.js";

/**
 * SKILL.md: the cross-tool open standard read by both Cursor and Claude Code
 * (Cursor also reads .claude/skills). Emitted with disable-model-invocation so
 * it behaves as an explicit /name command rather than being auto-fired.
 */
export function generateSkill(cmd: CommandDef): GeneratedFile {
  const frontmatter = [
    "---",
    `name: ${cmd.name}`,
    `description: ${cmd.description}`,
    "disable-model-invocation: true",
    "---",
  ].join("\n");

  const body = cmd.body.replace(/<REQUEST>/g, "the request");
  const contents = `${frontmatter}\n\n# ${cmd.name}\n\n${body}\n`;
  return { path: `.claude/skills/${cmd.name}/SKILL.md`, contents };
}
