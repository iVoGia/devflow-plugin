import { z } from "zod";

export const commandSchema = z.object({
  name: z.string(),
  description: z.string(),
  argument_hint: z.string().default(""),
  model: z.string().optional(),
  run: z
    .object({
      cli: z.string(),
      args: z.string().default("$ARGUMENTS"),
      capture_output: z.boolean().default(false),
    })
    .optional(),
  allowed_shell: z.array(z.string()).default([]),
  body: z.string(),
});

export type CommandDef = z.infer<typeof commandSchema>;

export interface GeneratedFile {
  /** Path relative to the target project root. */
  path: string;
  contents: string;
}
