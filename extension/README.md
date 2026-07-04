# DevFlow for VS Code

Run the **DevFlow** spec-driven development pipeline directly from VS Code or
Cursor. This extension is a thin launcher around the `devflow` CLI: it starts the
workflow in an integrated terminal and shows each run's stages in a tree view.

> Pipeline: Intent Classification -> Repository Harness -> SpecKit -> Requirement
> Validation -> BMAD (plan + task split) -> Context7 + Existing Code -> Coding
> Agent -> Static Validation -> Playwright/Maestro -> Strix (security) ->
> Documentation -> GitHub PR -> Human Review.

## Features

- **DevFlow: Start Workflow** — enter a request (idea/bug/feature) and run the
  full pipeline in an integrated terminal.
- **DevFlow: Initialize / Doctor / Resume Last Run** — one-click access to the
  core CLI commands.
- **Runs tree view** (DevFlow icon in the Activity Bar) — every run and its 12
  stages with pass/fail/skip status, updated live as `.devflow/runs/*/state.json`
  changes.
- **Status bar** — shows the latest run result; click to start a new workflow.

The extension bundles the `devflow` CLI, so you do not need a separate install
to run it. It runs the pipeline in a terminal, which uses whichever agent backend
is configured in `.devflow/config.yaml` (`claude`, `cursor`, or `api`).

## Requirements

The pipeline shells out to external tools depending on your config. Run
**DevFlow: Doctor** to see what is missing. Typically:

- An agent CLI: **Claude Code** (`claude`) or **Cursor** (`cursor-agent`).
- **Node.js 18+**, **git**, and **GitHub CLI** (`gh`, authenticated) for PRs.
- Optional per stage: `specify`/`uvx` (SpecKit), Docker + `strix` (security),
  Playwright, or Maestro + Java (mobile E2E).
- Env keys as needed: `CONTEXT7_API_KEY`, `STRIX_LLM`, `LLM_API_KEY`.

## Getting started

1. Open a project folder.
2. Run **DevFlow: Initialize** (Command Palette) to scaffold `.devflow/` and the
   IDE commands. Fill in `.devflow/knowledge/*.md`.
3. Run **DevFlow: Doctor** to verify prerequisites.
4. Run **DevFlow: Start Workflow** and describe your task.

## Settings

- `devflow.cliPath` — absolute path to a `devflow` executable (overrides the
  bundled CLI).
- `devflow.useBundledCli` — prefer the bundled CLI over a global `devflow`
  (default `true`).

## Notes

- **Claude Code** (a terminal CLI, not a VS Code app) is supported via generated
  slash commands rather than this extension. Running **DevFlow: Initialize**
  also generates `.claude/commands` for it.
- This extension does not deploy or monitor; the pipeline stops at the GitHub PR
  for human review.

## License

MIT
