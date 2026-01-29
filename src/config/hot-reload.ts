import { watch } from "chokidar";
import { getConfigPath, loadConfig } from "./config.js";
import type { WispyConfig } from "./schema.js";
import { createLogger } from "../infra/logger.js";

const log = createLogger("hot-reload");

export function watchConfig(
  runtimeDir: string,
  onUpdate: (config: WispyConfig) => void
) {
  const configPath = getConfigPath(runtimeDir);
  const watcher = watch(configPath, { ignoreInitial: true });

  watcher.on("change", () => {
    log.info("Config changed, reloading...");
    try {
      const config = loadConfig(runtimeDir);
      onUpdate(config);
      log.info("Config reloaded successfully");
    } catch (err) {
      log.error({ err }, "Failed to reload config");
    }
  });

  return watcher;
}
