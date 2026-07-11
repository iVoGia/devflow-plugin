import { promises as fs } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

export const DEVFLOW_DIR = ".devflow";
export const CONFIG_FILENAME = "config.yaml";

const stageBase = z.object({
  enabled: z.boolean().default(true),
});

const configSchema = z.object({
  /** Which agent backend drives the LLM-dependent stages. */
  agent: z.enum(["claude", "cursor", "api"]).default("claude"),

  /** Where the knowledge harness lives, relative to project root. */
  knowledgeDir: z.string().default(".devflow/knowledge"),

  stages: z
    .object({
      intent: stageBase.default({ enabled: true }),
      harness: stageBase.default({ enabled: true }),
      discover: stageBase.default({ enabled: true }),
      rootcause: stageBase.default({ enabled: true }),
      intake: stageBase
        .extend({ gate: z.boolean().default(true) })
        .default({ enabled: true, gate: true }),
      speckit: stageBase
        .extend({
          /** Passed to `specify init --integration <value>`. */
          integration: z.string().default("claude"),
        })
        .default({ enabled: true, integration: "claude" }),
      validate: stageBase
        .extend({ gate: z.boolean().default(true) })
        .default({ enabled: true, gate: true }),
      bmad: stageBase
        .extend({
          /** BMAD modules to install, e.g. "bmm". */
          modules: z.string().default("bmm"),
          /** IDE integration passed to `bmad-method install --tools`. */
          tools: z.string().default("claude-code"),
        })
        .default({ enabled: true, modules: "bmm", tools: "claude-code" }),
      context: stageBase.default({ enabled: true }),
      coding: stageBase.default({ enabled: true }),
      static: stageBase
        .extend({
          unit: z.string().optional(),
          integration: z.string().optional(),
          lint: z.string().optional(),
          format: z.string().optional(),
          gate: z.boolean().default(true),
        })
        .default({ enabled: true, gate: true }),
      e2e: stageBase
        .extend({
          engine: z.enum(["playwright", "maestro", "none"]).default("none"),
          /** When engine is none, use repo-profile e2eSuggestion from discover stage. */
          autoDetect: z.boolean().default(false),
          cmd: z.string().optional(),
          gate: z.boolean().default(true),
        })
        .default({ enabled: true, engine: "none", autoDetect: false, gate: true }),
      strix: stageBase
        .extend({
          mode: z.enum(["quick", "deep"]).default("quick"),
          gate: z.boolean().default(true),
        })
        .default({ enabled: true, mode: "quick", gate: true }),
      docs: stageBase.default({ enabled: true }),
      pr: stageBase
        .extend({
          base: z.string().default("main"),
          draft: z.boolean().default(false),
          /** If true, run `gh pr merge` automatically after review. Defaults off. */
          autoMerge: z.boolean().default(false),
        })
        .default({ enabled: true, base: "main", draft: false, autoMerge: false }),
    })
    .default({}),

  context7: z
    .object({
      enabled: z.boolean().default(true),
      baseUrl: z.string().default("https://context7.com/api/v2"),
    })
    .default({ enabled: true, baseUrl: "https://context7.com/api/v2" }),

  /** Optional overrides for the agent backend command. */
  agentCommand: z
    .object({
      claude: z.string().default("claude"),
      cursor: z.string().default("cursor-agent"),
    })
    .default({ claude: "claude", cursor: "cursor-agent" }),

  /** Caveman terse-output mode (https://github.com/JuliusBrussee/caveman). */
  caveman: z
    .object({
      enabled: z.boolean().default(true),
      level: z.enum(["lite", "full", "ultra"]).default("lite"),
      compressKnowledge: z.boolean().default(true),
      /** Pipeline stage ids that receive the caveman system prompt. */
      stages: z
        .array(z.string())
        .default(["intent", "intake", "context", "pr"]),
    })
    .default({
      enabled: true,
      level: "lite",
      compressKnowledge: true,
      stages: ["intent", "intake", "context", "pr"],
    }),
});

export type DevflowConfig = z.infer<typeof configSchema>;

export function defaultConfig(): DevflowConfig {
  return configSchema.parse({});
}

export function configPath(projectRoot: string): string {
  return path.join(projectRoot, DEVFLOW_DIR, CONFIG_FILENAME);
}

export async function loadConfig(projectRoot: string): Promise<DevflowConfig> {
  const file = configPath(projectRoot);
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch {
    // No config yet: fall back to sensible defaults so `devflow` still runs.
    return defaultConfig();
  }
  const parsed = parseYaml(raw) ?? {};
  const result = configSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid ${file}:\n${issues}`);
  }
  return result.data;
}

export async function configExists(projectRoot: string): Promise<boolean> {
  try {
    await fs.access(configPath(projectRoot));
    return true;
  } catch {
    return false;
  }
}
