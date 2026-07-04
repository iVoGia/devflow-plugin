import * as vscode from "vscode";
import { RunsProvider } from "./runsView.js";

/** A status bar item that surfaces the latest run status and starts a workflow. */
export class DevflowStatusBar {
  private readonly item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100,
    );
    this.item.command = "devflow.start";
    this.update();
    this.item.show();
  }

  update(): void {
    const summary = RunsProvider.latestSummary();
    if (!summary) {
      this.item.text = "$(rocket) DevFlow";
      this.item.tooltip = "Start a DevFlow workflow";
    } else {
      const icon = summary.failed ? "$(error)" : "$(pass)";
      this.item.text = `${icon} DevFlow ${summary.text}`;
      this.item.tooltip = summary.failed
        ? "Last DevFlow run failed a gate. Click to start a new run."
        : "Last DevFlow run passed. Click to start a new run.";
    }
  }

  dispose(): void {
    this.item.dispose();
  }
}
