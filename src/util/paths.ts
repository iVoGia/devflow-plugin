import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Resolves a directory that ships with the package (commands/, templates/).
 * Works both in dev (tsx, files under src/) and after build (bundled dist/).
 */
function resolvePackaged(sub: string): string {
  const candidates = [
    path.resolve(here, "..", sub), // dist/cli.js -> ../commands
    path.resolve(here, "..", "..", sub), // src/util/*.ts -> ../../commands
    path.resolve(here, "..", "..", "..", sub),
    path.resolve(process.cwd(), sub),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return candidates[0];
}

export function commandsDir(): string {
  return resolvePackaged("commands");
}

export function templatesDir(): string {
  return resolvePackaged("templates");
}
