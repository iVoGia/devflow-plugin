import type { CommandDef, GeneratedFile } from "./types.js";

/**
 * Cursor slash commands: plain Markdown, NO frontmatter. Filename becomes the
 * command name. Description/arg-hint are folded into the body as prose, and the
 * CLI invocation is expressed as an instruction (Cursor's agent runs it).
 */
export function generateCursor(cmd: CommandDef): GeneratedFile {
  const argLine = cmd.argument_hint
    ? `Arguments: \`${cmd.argument_hint}\` (available as $1, provided after the command).\n\n`
    : "";
  const contents = `# /${cmd.name}

${cmd.description}

${argLine}${cmd.body.replace(/<REQUEST>/g, "$1")}
`;
  return { path: `.cursor/commands/${cmd.name}.md`, contents };
}
