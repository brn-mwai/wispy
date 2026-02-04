/**
 * Daemon Runner for Wispy Gateway
 *
 * Provides process persistence with auto-restart on crash.
 * Supports both foreground (--persist) and background (--daemon) modes.
 */

import { spawn, ChildProcess } from "child_process";
import { writeFileSync, readFileSync, existsSync, unlinkSync, mkdirSync, appendFileSync } from "fs";
import { resolve, dirname } from "path";
import { createLogger } from "../infra/logger.js";

const log = createLogger("daemon");

interface DaemonConfig {
  rootDir: string;
  runtimeDir: string;
  soulDir: string;
  port: number;
  maxRestarts: number;
  restartDelay: number; // ms
  logFile?: string;
}

interface DaemonState {
  pid: number;
  startedAt: string;
  restarts: number;
  lastRestartAt?: string;
  status: "running" | "stopped" | "restarting";
}

const PID_FILENAME = "gateway.pid";
const STATE_FILENAME = "daemon-state.json";

/**
 * Get paths for daemon files
 */
function getDaemonPaths(runtimeDir: string) {
  const daemonDir = resolve(runtimeDir, "daemon");
  return {
    dir: daemonDir,
    pid: resolve(daemonDir, PID_FILENAME),
    state: resolve(daemonDir, STATE_FILENAME),
    log: resolve(daemonDir, "gateway.log"),
    err: resolve(daemonDir, "gateway.err"),
  };
}

/**
 * Check if daemon is already running
 */
export function isDaemonRunning(runtimeDir: string): boolean {
  const paths = getDaemonPaths(runtimeDir);

  if (!existsSync(paths.pid)) {
    return false;
  }

  try {
    const pid = parseInt(readFileSync(paths.pid, "utf8").trim(), 10);
    // Check if process exists
    process.kill(pid, 0);
    return true;
  } catch {
    // Process doesn't exist, clean up stale PID file
    try { unlinkSync(paths.pid); } catch {}
    return false;
  }
}

/**
 * Get daemon status
 */
export function getDaemonStatus(runtimeDir: string): DaemonState | null {
  const paths = getDaemonPaths(runtimeDir);

  if (!existsSync(paths.state)) {
    return null;
  }

  try {
    const state = JSON.parse(readFileSync(paths.state, "utf8")) as DaemonState;

    // Verify process is actually running
    try {
      process.kill(state.pid, 0);
      return state;
    } catch {
      // Process died, update state
      state.status = "stopped";
      return state;
    }
  } catch {
    return null;
  }
}

/**
 * Save daemon state
 */
function saveDaemonState(runtimeDir: string, state: DaemonState): void {
  const paths = getDaemonPaths(runtimeDir);
  mkdirSync(paths.dir, { recursive: true });
  writeFileSync(paths.state, JSON.stringify(state, null, 2), "utf8");
}

/**
 * Log to daemon log file
 */
function logToDaemonFile(runtimeDir: string, message: string): void {
  const paths = getDaemonPaths(runtimeDir);
  const timestamp = new Date().toISOString();
  appendFileSync(paths.log, `[${timestamp}] ${message}\n`, "utf8");
}

/**
 * Stop the daemon
 */
export function stopDaemon(runtimeDir: string): boolean {
  const paths = getDaemonPaths(runtimeDir);

  if (!existsSync(paths.pid)) {
    return false;
  }

  try {
    const pid = parseInt(readFileSync(paths.pid, "utf8").trim(), 10);
    process.kill(pid, "SIGTERM");

    // Clean up
    try { unlinkSync(paths.pid); } catch {}

    const state = getDaemonStatus(runtimeDir);
    if (state) {
      state.status = "stopped";
      saveDaemonState(runtimeDir, state);
    }

    logToDaemonFile(runtimeDir, "Daemon stopped via CLI");
    return true;
  } catch {
    return false;
  }
}

/**
 * Start gateway in daemon mode (background with auto-restart)
 */
export async function startDaemon(config: DaemonConfig): Promise<{ pid: number; logFile: string }> {
  const paths = getDaemonPaths(config.runtimeDir);

  // Check if already running
  if (isDaemonRunning(config.runtimeDir)) {
    const state = getDaemonStatus(config.runtimeDir);
    throw new Error(`Daemon already running (PID: ${state?.pid})`);
  }

  mkdirSync(paths.dir, { recursive: true });

  // Find the entry point
  const entryPoint = resolve(config.rootDir, "dist", "cli", "program.js");
  const tsEntry = resolve(config.rootDir, "src", "cli", "program.ts");

  // Use node for compiled JS, tsx for TypeScript
  const useTs = !existsSync(entryPoint);
  const cmd = useTs ? "npx" : "node";
  const args = useTs
    ? ["tsx", tsEntry, "gateway", "--port", String(config.port)]
    : [entryPoint, "gateway", "--port", String(config.port)];

  // Spawn detached process
  const child = spawn(cmd, args, {
    cwd: config.rootDir,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      WISPY_DAEMON_MODE: "1",
    },
  });

  // Write logs
  child.stdout?.on("data", (data) => {
    appendFileSync(paths.log, data, "utf8");
  });

  child.stderr?.on("data", (data) => {
    appendFileSync(paths.err, data, "utf8");
  });

  // Save PID
  writeFileSync(paths.pid, String(child.pid), "utf8");

  // Save state
  const state: DaemonState = {
    pid: child.pid!,
    startedAt: new Date().toISOString(),
    restarts: 0,
    status: "running",
  };
  saveDaemonState(config.runtimeDir, state);

  // Disconnect so parent can exit
  child.unref();

  logToDaemonFile(config.runtimeDir, `Daemon started (PID: ${child.pid})`);

  return {
    pid: child.pid!,
    logFile: paths.log,
  };
}

/**
 * Run gateway in foreground with auto-restart (persist mode)
 */
export async function runWithPersistence(config: DaemonConfig): Promise<void> {
  const paths = getDaemonPaths(config.runtimeDir);
  mkdirSync(paths.dir, { recursive: true });

  let restartCount = 0;
  let shouldRun = true;

  // Handle shutdown signals
  const cleanup = () => {
    shouldRun = false;
    log.info("Shutdown signal received, stopping gateway...");
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  while (shouldRun && restartCount < config.maxRestarts) {
    log.info("Starting gateway (attempt %d/%d)...", restartCount + 1, config.maxRestarts);

    try {
      // Import and run gateway directly
      const { startGateway } = await import("../gateway/server.js");

      await startGateway({
        rootDir: config.rootDir,
        runtimeDir: config.runtimeDir,
        soulDir: config.soulDir,
        port: config.port,
      });

      // If we reach here, gateway exited normally
      log.info("Gateway exited normally");
      break;

    } catch (err) {
      restartCount++;
      log.error({ err }, "Gateway crashed");
      logToDaemonFile(config.runtimeDir, `Gateway crashed: ${err}`);

      if (shouldRun && restartCount < config.maxRestarts) {
        log.info("Restarting in %dms...", config.restartDelay);
        await new Promise(resolve => setTimeout(resolve, config.restartDelay));
      }
    }
  }

  if (restartCount >= config.maxRestarts) {
    log.error("Max restarts (%d) reached, giving up", config.maxRestarts);
    logToDaemonFile(config.runtimeDir, `Max restarts (${config.maxRestarts}) reached`);
    process.exit(1);
  }
}

/**
 * Display daemon status in CLI-friendly format
 */
export function displayDaemonStatus(runtimeDir: string): void {
  const state = getDaemonStatus(runtimeDir);
  const paths = getDaemonPaths(runtimeDir);

  if (!state) {
    console.log("\n  \x1b[33m○\x1b[0m Gateway daemon is not running\n");
    console.log("  Start with: wispy gateway --daemon");
    console.log("  Or persist: wispy gateway --persist\n");
    return;
  }

  const statusColor = state.status === "running" ? "\x1b[32m" : "\x1b[31m";
  const statusIcon = state.status === "running" ? "✓" : "✗";

  console.log(`\n  ${statusColor}${statusIcon}\x1b[0m Gateway Daemon Status\n`);
  console.log(`  PID:        ${state.pid}`);
  console.log(`  Status:     ${statusColor}${state.status}\x1b[0m`);
  console.log(`  Started:    ${state.startedAt}`);
  console.log(`  Restarts:   ${state.restarts}`);
  if (state.lastRestartAt) {
    console.log(`  Last crash: ${state.lastRestartAt}`);
  }
  console.log(`  Logs:       ${paths.log}`);
  console.log();
}

/**
 * Tail daemon logs
 */
export function tailDaemonLogs(runtimeDir: string, lines: number = 50): string[] {
  const paths = getDaemonPaths(runtimeDir);

  if (!existsSync(paths.log)) {
    return [];
  }

  try {
    const content = readFileSync(paths.log, "utf8");
    const allLines = content.split("\n").filter(l => l.trim());
    return allLines.slice(-lines);
  } catch {
    return [];
  }
}
