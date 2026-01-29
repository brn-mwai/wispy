import { config } from "dotenv";
import { resolve } from "path";

export function loadEnv(rootDir: string) {
  config({ path: resolve(rootDir, ".env") });
  config({ path: resolve(rootDir, ".env.local"), override: true });
}
