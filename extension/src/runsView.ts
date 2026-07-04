import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";

type StageStatus = "passed" | "failed" | "skipped";

interface StageRecord {
  id: string;
  title: string;
  status: StageStatus;
  message?: string;
}

interface RunState {
  id: string;
  request: string;
  updatedAt: string;
  agent: string;
  stages: StageRecord[];
}

export interface RunNode {
  kind: "run";
  state: RunState;
  dir: string;
}

export interface StageNode {
  kind: "stage";
  stage: StageRecord;
}

export type DevflowNode = RunNode | StageNode;

function runsRoot(): string | undefined {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return undefined;
  return path.join(folder.uri.fsPath, ".devflow", "runs");
}

function readRuns(): RunNode[] {
  const root = runsRoot();
  if (!root || !fs.existsSync(root)) return [];
  const nodes: RunNode[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const stateFile = path.join(root, entry.name, "state.json");
    try {
      const state = JSON.parse(fs.readFileSync(stateFile, "utf8")) as RunState;
      nodes.push({ kind: "run", state, dir: path.join(root, entry.name) });
    } catch {
      // ignore runs without a valid state.json
    }
  }
  // Most recent first (run ids are timestamp-prefixed).
  nodes.sort((a, b) => b.state.id.localeCompare(a.state.id));
  return nodes;
}

function statusIcon(status: StageStatus): vscode.ThemeIcon {
  switch (status) {
    case "passed":
      return new vscode.ThemeIcon(
        "pass-filled",
        new vscode.ThemeColor("testing.iconPassed"),
      );
    case "failed":
      return new vscode.ThemeIcon(
        "error",
        new vscode.ThemeColor("testing.iconFailed"),
      );
    case "skipped":
      return new vscode.ThemeIcon(
        "circle-slash",
        new vscode.ThemeColor("testing.iconSkipped"),
      );
  }
}

function runIcon(state: RunState): vscode.ThemeIcon {
  if (state.stages.some((s) => s.status === "failed")) {
    return new vscode.ThemeIcon("error", new vscode.ThemeColor("testing.iconFailed"));
  }
  return new vscode.ThemeIcon("pass", new vscode.ThemeColor("testing.iconPassed"));
}

export class RunsProvider implements vscode.TreeDataProvider<DevflowNode> {
  private readonly emitter = new vscode.EventEmitter<DevflowNode | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;
  private watcher?: vscode.FileSystemWatcher;

  constructor() {
    this.setupWatcher();
  }

  private setupWatcher(): void {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) return;
    const pattern = new vscode.RelativePattern(folder, ".devflow/runs/**");
    this.watcher = vscode.workspace.createFileSystemWatcher(pattern);
    this.watcher.onDidChange(() => this.refresh());
    this.watcher.onDidCreate(() => this.refresh());
    this.watcher.onDidDelete(() => this.refresh());
  }

  refresh(): void {
    this.emitter.fire(undefined);
  }

  dispose(): void {
    this.watcher?.dispose();
    this.emitter.dispose();
  }

  getTreeItem(node: DevflowNode): vscode.TreeItem {
    if (node.kind === "run") {
      const item = new vscode.TreeItem(
        node.state.request || node.state.id,
        vscode.TreeItemCollapsibleState.Expanded,
      );
      item.description = node.state.id;
      item.iconPath = runIcon(node.state);
      item.tooltip = `Agent: ${node.state.agent}\nUpdated: ${node.state.updatedAt}`;
      item.contextValue = "devflowRun";
      item.command = {
        command: "devflow.openRun",
        title: "Open Run Report",
        arguments: [node.dir],
      };
      return item;
    }

    const item = new vscode.TreeItem(
      node.stage.title,
      vscode.TreeItemCollapsibleState.None,
    );
    item.iconPath = statusIcon(node.stage.status);
    if (node.stage.message) item.description = node.stage.message;
    item.tooltip = node.stage.message ?? node.stage.status;
    item.contextValue = "devflowStage";
    return item;
  }

  getChildren(node?: DevflowNode): DevflowNode[] {
    if (!node) return readRuns();
    if (node.kind === "run") {
      return node.state.stages.map((stage) => ({ kind: "stage", stage }));
    }
    return [];
  }

  /** Returns the latest run id, if any. */
  static latestRunId(): string | undefined {
    return readRuns()[0]?.state.id;
  }

  /** Returns a one-line summary of the latest run for the status bar. */
  static latestSummary(): { text: string; failed: boolean } | undefined {
    const latest = readRuns()[0];
    if (!latest) return undefined;
    const failed = latest.state.stages.some((s) => s.status === "failed");
    const passed = latest.state.stages.filter((s) => s.status === "passed").length;
    const total = latest.state.stages.length;
    return { text: `${passed}/${total}`, failed };
  }
}
