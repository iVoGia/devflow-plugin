import { promises as fs } from "node:fs";
import path from "node:path";
import { exists, walk } from "./fsx.js";

export type ProjectMode = "greenfield" | "existing";
export type Platform =
  | "web"
  | "ios"
  | "android"
  | "flutter"
  | "mobile"
  | "backend"
  | "fullstack"
  | "unknown";

export interface RepoProfile {
  projectMode: ProjectMode;
  platform: Platform;
  languages: string[];
  frameworks: string[];
  markers: string[];
  sourceFileCount: number;
  e2eSuggestion: "playwright" | "maestro" | "none";
  confidence: number;
}

const SOURCE_EXT = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".vue",
  ".swift",
  ".kt",
  ".kts",
  ".java",
  ".dart",
  ".py",
  ".go",
  ".rs",
  ".rb",
  ".php",
  ".cs",
]);

/** Scans the repository and infers stack, platform, and project mode. */
export async function detectRepoProfile(root: string): Promise<RepoProfile> {
  const markers: string[] = [];
  const languages = new Set<string>();
  const frameworks = new Set<string>();
  let platform: Platform = "unknown";

  const checks: [string, () => Promise<boolean>][] = [
    ["package.json", () => exists(path.join(root, "package.json"))],
    ["tsconfig.json", () => exists(path.join(root, "tsconfig.json"))],
    ["vite.config", () => globExists(root, ["vite.config.ts", "vite.config.js"])],
    ["next.config", () => globExists(root, ["next.config.js", "next.config.mjs", "next.config.ts"])],
    ["Podfile", () => exists(path.join(root, "Podfile"))],
    ["Package.swift", () => exists(path.join(root, "Package.swift"))],
    ["pubspec.yaml", () => exists(path.join(root, "pubspec.yaml"))],
    ["android/", () => exists(path.join(root, "android"))],
    ["build.gradle", () => globExists(root, ["build.gradle", "build.gradle.kts"])],
    ["go.mod", () => exists(path.join(root, "go.mod"))],
    ["Cargo.toml", () => exists(path.join(root, "Cargo.toml"))],
    ["requirements.txt", () => exists(path.join(root, "requirements.txt"))],
    ["pyproject.toml", () => exists(path.join(root, "pyproject.toml"))],
    ["composer.json", () => exists(path.join(root, "composer.json"))],
    ["Gemfile", () => exists(path.join(root, "Gemfile"))],
    ["playwright.config", () => globExists(root, ["playwright.config.ts", "playwright.config.js"])],
    [".maestro/", () => exists(path.join(root, ".maestro"))],
    ["*.xcodeproj", () => globExists(root, ["*.xcodeproj"])],
  ];

  for (const [name, fn] of checks) {
    if (await fn()) markers.push(name);
  }

  // package.json deep read
  const pkgPath = path.join(root, "package.json");
  if (await exists(pkgPath)) {
    try {
      const pkg = JSON.parse(await fs.readFile(pkgPath, "utf8")) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps.react || deps["react-dom"]) frameworks.add("react");
      if (deps.next) frameworks.add("next");
      if (deps.vue) frameworks.add("vue");
      if (deps["@angular/core"]) frameworks.add("angular");
      if (deps.express || deps.fastify || deps["@nestjs/core"]) frameworks.add("node-backend");
      if (deps["react-native"]) frameworks.add("react-native");
      if (deps.electron) frameworks.add("electron");
      languages.add("typescript/javascript");
    } catch {
      /* ignore */
    }
  }

  if (markers.some((m) => m.startsWith("next") || m.startsWith("vite") || frameworks.has("react") || frameworks.has("vue"))) {
    platform = "web";
  }
  if (markers.includes("Podfile") || markers.includes("*.xcodeproj") || markers.includes("Package.swift")) {
    platform = platform === "web" ? "fullstack" : "ios";
    languages.add("swift");
  }
  if (markers.includes("android/") || markers.includes("build.gradle")) {
    if (platform === "web") platform = "fullstack";
    else if (platform === "ios") platform = "mobile";
    else if (platform === "unknown") platform = "android";
    languages.add("kotlin/java");
  }
  if (markers.includes("pubspec.yaml")) {
    platform = "flutter";
    languages.add("dart");
  }
  if (frameworks.has("react-native")) {
    platform = "mobile";
  }
  if (markers.includes("go.mod")) {
    if (platform === "unknown") platform = "backend";
    languages.add("go");
  }
  if (markers.includes("Cargo.toml")) {
    if (platform === "unknown") platform = "backend";
    languages.add("rust");
  }
  if (markers.includes("requirements.txt") || markers.includes("pyproject.toml")) {
    if (platform === "unknown") platform = "backend";
    languages.add("python");
  }

  const files = await walk(root, 5000);
  let sourceFileCount = 0;
  for (const f of files) {
    const ext = path.extname(f).toLowerCase();
    if (SOURCE_EXT.has(ext)) sourceFileCount++;
  }

  const projectMode: ProjectMode =
    sourceFileCount < 3 && !markers.includes("package.json") && !markers.includes("Podfile")
      ? "greenfield"
      : "existing";

  let e2eSuggestion: RepoProfile["e2eSuggestion"] = "none";
  if (markers.includes("playwright.config")) e2eSuggestion = "playwright";
  else if (markers.includes(".maestro/")) e2eSuggestion = "maestro";
  else if (platform === "web" || platform === "fullstack") e2eSuggestion = "playwright";
  else if (
    platform === "ios" ||
    platform === "android" ||
    platform === "mobile" ||
    platform === "flutter"
  ) {
    e2eSuggestion = "maestro";
  }

  const confidence =
    markers.length === 0
      ? 0.2
      : Math.min(0.95, 0.45 + markers.length * 0.08 + (sourceFileCount > 0 ? 0.15 : 0));

  return {
    projectMode,
    platform,
    languages: [...languages],
    frameworks: [...frameworks],
    markers,
    sourceFileCount,
    e2eSuggestion,
    confidence,
  };
}

async function globExists(root: string, patterns: string[]): Promise<boolean> {
  for (const p of patterns) {
    if (p.includes("*")) {
      const dir = path.dirname(p);
      const base = path.basename(p);
      const searchDir = dir === "." ? root : path.join(root, dir);
      try {
        const entries = await fs.readdir(searchDir);
        const re = new RegExp("^" + base.replace(/\*/g, ".*") + "$");
        if (entries.some((e) => re.test(e))) return true;
      } catch {
        /* skip */
      }
    } else if (await exists(path.join(root, p))) {
      return true;
    }
  }
  return false;
}
