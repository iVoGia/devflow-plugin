import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const extRoot = path.resolve(here, "..");
const repoRoot = path.resolve(extRoot, "..");
const target = path.join(extRoot, "media", "cli");

console.log("[bundle-cli] Building root devflow CLI...");
execSync("npm run build", { cwd: repoRoot, stdio: "inherit" });

console.log("[bundle-cli] Copying CLI into extension/media/cli ...");
rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });

for (const dir of ["dist", "commands", "templates"]) {
  const src = path.join(repoRoot, dir);
  if (!existsSync(src)) {
    throw new Error(`[bundle-cli] Missing ${src}. Did the root build succeed?`);
  }
  cpSync(src, path.join(target, dir), { recursive: true });
}

// The CLI is ESM. Mark this subtree as a module so Node runs it without the
// MODULE_TYPELESS_PACKAGE_JSON warning (the extension itself is CommonJS).
writeFileSync(
  path.join(target, "package.json"),
  JSON.stringify({ name: "devflow-cli-bundled", private: true, type: "module" }, null, 2),
);

console.log("[bundle-cli] Done. Bundled CLI at media/cli/");
