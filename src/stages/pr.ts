import { promises as fs } from "node:fs";
import path from "node:path";
import { run } from "../util/exec.js";
import which from "../util/which.js";
import { logger } from "../logger.js";
import {
  commit,
  currentBranch,
  diffAgainst,
  hasUncommittedChanges,
  isGitRepo,
  push,
  stageAll,
} from "../util/git.js";
import { isFixbugMode } from "../workflow/fixbug.js";
import type { Stage, StageContext } from "./types.js";

/**
 * GitHub PR stage: commits and pushes the work, then opens a PR with a
 * generated description (Summary + Test plan). The pipeline then stops for
 * Human Review; merge is a separate, opt-in step.
 */
export const prStage: Stage = {
  id: "pr",
  title: "GitHub PR",
  enabled: (c) => c.stages.pr.enabled,

  async preflight(ctx) {
    if (!(await isGitRepo(ctx.cwd))) {
      return { ok: false, reason: "Not a git repository." };
    }
    if (!(await which("gh"))) {
      return { ok: false, reason: "GitHub CLI `gh` not installed / not authenticated." };
    }
    return { ok: true };
  },

  async run(ctx) {
    const cfg = ctx.config.stages.pr;
    const branch = (await currentBranch(ctx.cwd)) || ctx.shared.branch || "";

    // Commit any pending work.
    if (await hasUncommittedChanges(ctx.cwd)) {
      await stageAll(ctx.cwd);
      const subject = commitSubject(ctx);
      const ok = await commit(ctx.cwd, subject);
      if (!ok) logger.warn("Nothing committed (empty or hook rejected).");
    }

    // Push branch.
    logger.step(`Pushing ${branch}`);
    const pushed = await push(ctx.cwd, branch);
    if (!pushed) {
      return {
        status: "failed",
        message: `Failed to push ${branch}. Check remote/auth.`,
        gate: false,
      };
    }

    // Build a PR description from the full branch diff.
    const body = await buildPrBody(ctx, cfg.base);
    const bodyFile = path.join(ctx.runDir, "pr-body.md");
    await fs.writeFile(bodyFile, body, "utf8");

    const title = commitSubject(ctx);
    const args = [
      "pr",
      "create",
      "--base",
      cfg.base,
      "--head",
      branch,
      "--title",
      title,
      "--body-file",
      bodyFile,
    ];
    if (cfg.draft) args.push("--draft");

    logger.step("Creating pull request");
    const res = await run("gh", args, { cwd: ctx.cwd });
    if (!res.ok) {
      return {
        status: "failed",
        message: `gh pr create failed: ${res.stderr.slice(0, 300)}`,
        gate: false,
      };
    }

    const url = extractUrl(res.stdout);
    logger.divider();
    logger.success("Pull request opened. Pausing for Human Review.");
    if (url) logger.info(`  ${url}`);

    return {
      status: "passed",
      message: url ? `PR opened: ${url}` : "PR opened.",
      artifacts: [path.relative(ctx.cwd, bodyFile)],
      data: { prUrl: url },
    };
  },
};

function commitSubject(ctx: StageContext): string {
  const type =
    ctx.shared.intent === "bug"
      ? "fix"
      : ctx.shared.intent === "refactor"
        ? "refactor"
        : "feat";
  const summary = ctx.request.split("\n")[0].slice(0, 60).trim();
  return `${type}: ${summary}`;
}

/**
 * Generates a Summary + Test plan PR body. Uses the agent to summarize the
 * full branch diff when available, otherwise falls back to a template.
 */
async function buildPrBody(ctx: StageContext, base: string): Promise<string> {
  const diff = await diffAgainst(ctx.cwd, base).catch(() => "");
  const fallback = isFixbugMode(ctx)
    ? `## Summary
- ${ctx.request.split("\n")[0]}

## Root cause (5 Whys)
${ctx.shared.rootCauseSummary ? ctx.shared.rootCauseSummary.split("\n").map((l) => `- ${l}`).join("\n") : `- See ${ctx.shared.rootCausePath ?? "docs/rootcause.md"}`}

## Test plan
- [ ] Review the changes on this branch
- [ ] Run the test suite locally
- [ ] Verify the regression test covers the root cause`
    : `## Summary
- ${ctx.request.split("\n")[0]}

## Test plan
- [ ] Review the changes on this branch
- [ ] Run the test suite locally
- [ ] Verify the acceptance criteria in the spec`;

  if (!diff.trim()) return fallback;

  try {
    const fixbugNote = isFixbugMode(ctx)
      ? ` Include a "## Root cause (5 Whys)" section (keep it to 2-3 bullets).${
          ctx.shared.rootCauseSummary
            ? ` Root cause summary:\n${ctx.shared.rootCauseSummary}`
            : ` Summarize from ${ctx.shared.rootCausePath ?? "docs/rootcause.md"}.`
        }`
      : "";
    const summary = await ctx.agent.prompt(
      `Write a concise GitHub PR description in Markdown with exactly these sections: "## Summary" (1-3 bullets on WHAT changed and WHY) and "## Test plan" (a checklist a reviewer can follow).${fixbugNote} Base it on this diff. Output only the Markdown.\n\nOriginal request:\n${ctx.request}\n\nDiff (truncated):\n${diff.slice(0, 12000)}`,
      { cwd: ctx.cwd, timeoutMs: 3 * 60_000 },
    );
    return summary.trim() || fallback;
  } catch {
    return fallback;
  }
}

function extractUrl(stdout: string): string | undefined {
  const match = stdout.match(/https?:\/\/\S+/);
  return match?.[0];
}
