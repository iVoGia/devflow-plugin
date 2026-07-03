import pc from "picocolors";

export type LogLevel = "debug" | "info" | "warn" | "error";

let verbose = false;

export function setVerbose(value: boolean): void {
  verbose = value;
}

export const logger = {
  debug(message: string): void {
    if (verbose) {
      process.stderr.write(pc.dim(`  · ${message}\n`));
    }
  },
  info(message: string): void {
    process.stdout.write(`${message}\n`);
  },
  step(message: string): void {
    process.stdout.write(`${pc.cyan("→")} ${message}\n`);
  },
  success(message: string): void {
    process.stdout.write(`${pc.green("✓")} ${message}\n`);
  },
  warn(message: string): void {
    process.stdout.write(`${pc.yellow("!")} ${pc.yellow(message)}\n`);
  },
  error(message: string): void {
    process.stderr.write(`${pc.red("✗")} ${pc.red(message)}\n`);
  },
  heading(message: string): void {
    process.stdout.write(`\n${pc.bold(pc.magenta(message))}\n`);
  },
  divider(): void {
    process.stdout.write(pc.dim("────────────────────────────────────────\n"));
  },
};

export { pc };
