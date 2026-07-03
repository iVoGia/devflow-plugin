import { execa } from "execa";

/**
 * Returns true if a command is resolvable on the current PATH.
 * Cross-platform: uses `command -v` on POSIX and `where` on Windows.
 */
export default async function which(command: string): Promise<boolean> {
  const isWindows = process.platform === "win32";
  const finder = isWindows ? "where" : "command";
  const args = isWindows ? [command] : ["-v", command];
  try {
    await execa(finder, args, { reject: true });
    return true;
  } catch {
    return false;
  }
}
