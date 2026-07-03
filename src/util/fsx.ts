import { promises as fs } from "node:fs";
import path from "node:path";

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".venv",
  "venv",
  "__pycache__",
  ".devflow",
]);

/** Recursively list files under root (relative paths, POSIX separators). */
export async function walk(root: string, maxEntries = 20_000): Promise<string[]> {
  const out: string[] = [];
  async function recurse(dir: string): Promise<void> {
    if (out.length >= maxEntries) return;
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (out.length >= maxEntries) return;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        await recurse(full);
      } else if (entry.isFile()) {
        out.push(path.relative(root, full).split(path.sep).join("/"));
      }
    }
  }
  await recurse(root);
  return out;
}

/** Converts a simple glob (supporting ** and *) to a RegExp. */
export function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        // ** matches across path separators
        re += ".*";
        i++;
        if (glob[i + 1] === "/") i++;
      } else {
        re += "[^/]*";
      }
    } else if (".+^${}()|[]\\".includes(c)) {
      re += `\\${c}`;
    } else {
      re += c;
    }
  }
  return new RegExp(`^${re}$`);
}

/** Returns the absolute path to the first file matching any pattern. */
export async function findFirst(
  root: string,
  patterns: string[],
): Promise<string | null> {
  const files = await walk(root);
  const regexps = patterns.map(globToRegExp);
  for (const rel of files) {
    if (regexps.some((r) => r.test(rel))) {
      return path.join(root, rel);
    }
  }
  return null;
}

/** Returns all relative paths matching any pattern. */
export async function findAll(
  root: string,
  patterns: string[],
): Promise<string[]> {
  const files = await walk(root);
  const regexps = patterns.map(globToRegExp);
  return files.filter((rel) => regexps.some((r) => r.test(rel)));
}

export async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
