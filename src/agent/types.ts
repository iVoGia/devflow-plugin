export interface AgentPromptOptions {
  /** Working directory for the agent process. */
  cwd?: string;
  /** Extra system-style guidance prepended to the prompt. */
  system?: string;
  /** Milliseconds before the agent call is aborted. */
  timeoutMs?: number;
}

export interface AgentBackend {
  /** Stable identifier: "claude" | "cursor" | "api". */
  readonly name: string;
  /** Human readable label for logs. */
  readonly label: string;
  /** Whether the backend can be used right now (binary present / key set). */
  isAvailable(): Promise<{ ok: boolean; reason?: string }>;
  /** Send a prompt and return the model's text response. */
  prompt(input: string, opts?: AgentPromptOptions): Promise<string>;
}
