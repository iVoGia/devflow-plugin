import * as vscode from "vscode";

const TERMINAL_NAME = "DevFlow";

/** Returns the shared DevFlow terminal, creating it if needed. */
export function getDevflowTerminal(cwd?: string): vscode.Terminal {
  const existing = vscode.window.terminals.find((t) => t.name === TERMINAL_NAME);
  if (existing) return existing;
  return vscode.window.createTerminal({ name: TERMINAL_NAME, cwd });
}

/** Runs a command string in the shared DevFlow terminal and reveals it. */
export function runInTerminal(command: string, cwd?: string): void {
  const terminal = getDevflowTerminal(cwd);
  terminal.show(true);
  terminal.sendText(command, true);
}
