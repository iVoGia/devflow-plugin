import type { CommandDef, GeneratedFile } from "./types.js";

/**
 * Claude Code slash commands: YAML frontmatter + body. Supports the `!` inline
 * shell exec and `allowed-tools` pre-approval. When capture_output is set we use
 * the `!` prefix so the CLI runs before the model responds.
 */
export function generateClaude(cmd: CommandDef): GeneratedFile {
  const allowed = cmd.allowed_shell.map((s) => `Bash(${s})`).join(", ");
  const frontmatter = [
    "---",
    `description: ${cmd.description}`,
    cmd.argument_hint ? `argument-hint: ${cmd.argument_hint}` : null,
    allowed ? `allowed-tools: ${allowed}` : null,
    cmd.model ? `model: ${cmd.model}` : null,
    "---",
  ]
    .filter(Boolean)
    .join("\n");

  let body = cmd.body.replace(/<REQUEST>/g, "$ARGUMENTS");

  if (cmd.run?.capture_output) {
    const invocation = `\n\nRun now:\n\n!\`${cmd.run.cli} ${cmd.run.args}\`\n`;
    body += invocation;
  }

  const contents = `${frontmatter}\n\n${body}\n`;
  return { path: `.claude/commands/${cmd.name}.md`, contents };
}
