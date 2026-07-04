import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";

/**
 * Resolves how to invoke the devflow CLI, as a shell command prefix.
 * Priority:
 *   1. devflow.cliPath setting (explicit executable)
 *   2. bundled CLI shipped inside the extension (node <ext>/media/cli/dist/cli.js)
 *   3. global `devflow` on PATH
 */
export function resolveCliPrefix(context: vscode.ExtensionContext): string {
  const cfg = vscode.workspace.getConfiguration("devflow");
  const custom = (cfg.get<string>("cliPath") ?? "").trim();
  if (custom) {
    return quoteArg(custom);
  }

  const useBundled = cfg.get<boolean>("useBundledCli", true);
  if (useBundled) {
    const bundled = path.join(
      context.extensionPath,
      "media",
      "cli",
      "dist",
      "cli.js",
    );
    if (fs.existsSync(bundled)) {
      return `node ${quoteArg(bundled)}`;
    }
  }

  return "devflow";
}

/** Builds a full shell command string from a prefix and arguments. */
export function buildCommand(prefix: string, args: string[]): string {
  return [prefix, ...args.map(quoteArg)].join(" ");
}

/** Quotes a single shell argument (POSIX-style, safe for the integrated terminal). */
export function quoteArg(arg: string): string {
  if (arg.length > 0 && /^[A-Za-z0-9_./:-]+$/.test(arg)) {
    return arg;
  }
  // Wrap in double quotes and escape backslashes, double quotes, backticks, $.
  const escaped = arg.replace(/([\\"`$])/g, "\\$1");
  return `"${escaped}"`;
}
