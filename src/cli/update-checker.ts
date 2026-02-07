import chalk from "chalk";
import { createLogger } from "../infra/logger.js";

const log = createLogger("update-checker");

interface NpmRegistryResponse {
  "dist-tags": { latest: string };
}

const PACKAGE_NAME = "wispy-ai";
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours
let lastCheck = 0;
let cachedLatest: string | null = null;

/**
 * Check npm registry for the latest version of wispy-ai.
 * Results are cached for 4 hours to avoid excessive requests.
 */
export async function checkForUpdate(currentVersion: string): Promise<string | null> {
  const now = Date.now();
  if (cachedLatest && now - lastCheck < CHECK_INTERVAL_MS) {
    return compareVersions(currentVersion, cachedLatest) ? cachedLatest : null;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(`https://registry.npmjs.org/${PACKAGE_NAME}/latest`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(timeout);

    if (!res.ok) return null;
    const data = (await res.json()) as { version?: string };
    const latest = data.version;
    if (!latest) return null;

    lastCheck = now;
    cachedLatest = latest;

    return compareVersions(currentVersion, latest) ? latest : null;
  } catch {
    log.debug("Update check failed (offline or timeout)");
    return null;
  }
}

/**
 * Returns true if latest > current (simple semver compare)
 */
function compareVersions(current: string, latest: string): boolean {
  const c = current.replace(/^v/, "").split(".").map(Number);
  const l = latest.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((l[i] || 0) > (c[i] || 0)) return true;
    if ((l[i] || 0) < (c[i] || 0)) return false;
  }
  return false;
}

/**
 * Print update notification banner if a new version is available.
 */
export async function printUpdateNotification(currentVersion: string): Promise<void> {
  const latest = await checkForUpdate(currentVersion);
  if (!latest) return;

  const border = chalk.dim("─".repeat(50));
  console.log(border);
  console.log(
    `  ${chalk.yellow("Update available!")} ${chalk.dim(currentVersion)} ${chalk.dim("→")} ${chalk.green.bold(latest)}`
  );
  console.log(`  Run ${chalk.cyan("npm i -g wispy-ai")} to update`);
  console.log(border);
}
