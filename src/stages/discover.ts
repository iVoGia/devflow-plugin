import { promises as fs } from "node:fs";
import path from "node:path";
import { logger } from "../logger.js";
import { detectRepoProfile, type RepoProfile } from "../util/stack-detect.js";
import type { Stage } from "./types.js";

/**
 * Repo Discovery: detects project mode (greenfield vs existing), platform
 * (web/mobile/backend), languages, frameworks, and E2E suggestions.
 */
export const discoverStage: Stage = {
  id: "discover",
  title: "Repo Discovery (stack detect)",
  enabled: (c) => c.stages.discover.enabled,

  async run(ctx) {
    logger.step("Scanning repository for stack markers");
    const profile: RepoProfile = await detectRepoProfile(ctx.cwd);

    const out = path.join(ctx.runDir, "repo-profile.json");
    await fs.writeFile(out, JSON.stringify(profile, null, 2), "utf8");

    const summary =
      `${profile.projectMode} | ${profile.platform} | ` +
      `langs=[${profile.languages.join(", ") || "unknown"}] | ` +
      `frameworks=[${profile.frameworks.join(", ") || "none"}] | ` +
      `sources=${profile.sourceFileCount} | e2e→${profile.e2eSuggestion}`;

    logger.info(`  confidence: ${(profile.confidence * 100).toFixed(0)}%`);
    if (profile.markers.length > 0) {
      logger.debug(`  markers: ${profile.markers.join(", ")}`);
    }

    if (
      profile.e2eSuggestion !== "none" &&
      ctx.config.stages.e2e.engine === "none"
    ) {
      logger.info(
        `  Tip: set stages.e2e.engine to "${profile.e2eSuggestion}" in .devflow/config.yaml (or this run will auto-use it if e2e is enabled).`,
      );
    }

    return {
      status: "passed",
      message: summary,
      artifacts: [path.relative(ctx.cwd, out)],
      data: { repoProfile: profile },
    };
  },
};
