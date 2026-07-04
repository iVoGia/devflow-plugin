import * as path from "node:path";
import * as vscode from "vscode";
import { buildCommand, resolveCliPrefix } from "./cli.js";
import { RunsProvider } from "./runsView.js";
import { DevflowStatusBar } from "./statusBar.js";
import { runInTerminal } from "./terminal.js";

function workspaceCwd(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function requireWorkspace(): string | undefined {
  const cwd = workspaceCwd();
  if (!cwd) {
    void vscode.window.showErrorMessage(
      "DevFlow: open a folder/workspace first.",
    );
    return undefined;
  }
  return cwd;
}

export function activate(context: vscode.ExtensionContext): void {
  const provider = new RunsProvider();
  const statusBar = new DevflowStatusBar();

  const treeView = vscode.window.createTreeView("devflowRuns", {
    treeDataProvider: provider,
  });

  provider.onDidChangeTreeData(() => statusBar.update());

  const runCli = (args: string[]): void => {
    const cwd = requireWorkspace();
    if (!cwd) return;
    const prefix = resolveCliPrefix(context);
    runInTerminal(buildCommand(prefix, args), cwd);
  };

  context.subscriptions.push(
    provider,
    statusBar,
    treeView,

    vscode.commands.registerCommand("devflow.start", async () => {
      if (!requireWorkspace()) return;
      const request = await vscode.window.showInputBox({
        title: "DevFlow: Start Workflow",
        prompt: "Describe the idea, bug, feature, or new project",
        placeHolder: "e.g. Add a dark mode toggle to settings",
        ignoreFocusOut: true,
      });
      if (!request || !request.trim()) return;
      runCli(["run", request.trim()]);
    }),

    vscode.commands.registerCommand("devflow.init", () => runCli(["init"])),

    vscode.commands.registerCommand("devflow.doctor", () => runCli(["doctor"])),

    vscode.commands.registerCommand("devflow.resume", () =>
      runCli(["run", "--resume", "latest"]),
    ),

    vscode.commands.registerCommand("devflow.refreshRuns", () =>
      provider.refresh(),
    ),

    vscode.commands.registerCommand("devflow.openRun", async (dir?: string) => {
      if (!dir) return;
      const stateFile = vscode.Uri.file(path.join(dir, "state.json"));
      try {
        const doc = await vscode.workspace.openTextDocument(stateFile);
        await vscode.window.showTextDocument(doc, { preview: true });
      } catch {
        void vscode.window.showWarningMessage("DevFlow: run report not found.");
      }
    }),
  );
}

export function deactivate(): void {
  // Subscriptions are disposed automatically by VS Code.
}
