// Bootstrap entry point with process respawn
import { spawn } from "child_process";
import { resolve } from "path";
import { createLogger } from "./infra/logger.js";

const log = createLogger("entry");

const MAX_RESTARTS = 5;
const RESTART_DELAY_MS = 3000;
let restartCount = 0;

export function bootstrapWithRespawn() {
  const child = spawn(
    process.execPath,
    [resolve(import.meta.dirname || ".", "cli", "program.js"), "gateway"],
    {
      stdio: "inherit",
      env: process.env,
    }
  );

  child.on("exit", (code) => {
    if (code !== 0 && restartCount < MAX_RESTARTS) {
      restartCount++;
      log.warn("Process exited with code %d, restarting (%d/%d)...", code ?? -1, restartCount, MAX_RESTARTS);
      setTimeout(bootstrapWithRespawn, RESTART_DELAY_MS);
    } else if (restartCount >= MAX_RESTARTS) {
      log.error("Max restarts reached. Exiting.");
      process.exit(1);
    }
  });
}
