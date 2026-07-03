import { run } from "./exec.js";

export async function isGitRepo(cwd: string): Promise<boolean> {
  const res = await run("git", ["rev-parse", "--is-inside-work-tree"], { cwd });
  return res.ok && res.stdout.trim() === "true";
}

export async function currentBranch(cwd: string): Promise<string> {
  const res = await run("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd });
  return res.stdout.trim();
}

export async function createBranch(cwd: string, name: string): Promise<boolean> {
  const res = await run("git", ["checkout", "-b", name], { cwd });
  return res.ok;
}

export async function checkout(cwd: string, name: string): Promise<boolean> {
  const res = await run("git", ["checkout", name], { cwd });
  return res.ok;
}

export async function hasUncommittedChanges(cwd: string): Promise<boolean> {
  const res = await run("git", ["status", "--porcelain"], { cwd });
  return res.stdout.trim().length > 0;
}

export async function stageAll(cwd: string): Promise<boolean> {
  const res = await run("git", ["add", "-A"], { cwd });
  return res.ok;
}

export async function commit(cwd: string, message: string): Promise<boolean> {
  const res = await run("git", ["commit", "-m", message], { cwd });
  return res.ok;
}

export async function push(cwd: string, branch: string): Promise<boolean> {
  const res = await run("git", ["push", "-u", "origin", branch], { cwd });
  return res.ok;
}

/** Returns a combined diff of committed changes vs a base branch. */
export async function diffAgainst(cwd: string, base: string): Promise<string> {
  const res = await run("git", ["diff", `${base}...HEAD`], { cwd });
  return res.stdout;
}

export function slugify(input: string, max = 40): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, max) || "change"
  );
}
