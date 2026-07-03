import type { CommandDef, GeneratedFile } from "./types.js";

/**
 * GitHub Copilot prompt files: YAML frontmatter + body, run in agent mode with
 * terminal tools listed explicitly (the `runCommands` group is unreliable).
 */
export function generateCopilot(cmd: CommandDef): GeneratedFile {
  const tools = [
    "runInTerminal",
    "getTerminalOutput",
    "terminalLastCommand",
  ];
  const frontmatter = [
    "---",
    `description: ${cmd.description}`,
    cmd.argument_hint ? `argument-hint: ${cmd.argument_hint}` : null,
    "agent: agent",
    cmd.model ? `model: ${cmd.model}` : null,
    `tools: [${tools.join(", ")}]`,
    "---",
  ]
    .filter(Boolean)
    .join("\n");

  const body = cmd.body.replace(/<REQUEST>/g, "${input:request}");
  const contents = `${frontmatter}\n\n${body}\n`;
  return { path: `.github/prompts/${cmd.name}.prompt.md`, contents };
}
