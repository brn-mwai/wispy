import chalk from "chalk";

const sky = chalk.rgb(49, 204, 255);
const skyBold = chalk.rgb(49, 204, 255).bold;
const dim = chalk.dim;

// ── Wispy ghost icon (14 chars wide, 7 lines tall) ──
const ICON = [
  `    ${sky("▄████▄")}    `,
  `  ${sky("▄████████▄")}  `,
  `${sky("██████████████")}`,
  `${sky("████")}  ${sky("██")}  ${sky("████")}`,
  `${sky("████")}  ${sky("██")}  ${sky("████")}`,
  `${sky("██████████████")}`,
  `  ${sky("▀██▀██▀██▀")}  `,
];

export const WISPY_VERSION = "1.2.0";

export interface BannerOptions {
  modelName?: string;
  vertexai?: boolean;
  project?: string;
  location?: string;
}

export function showBanner(modelNameOrOptions?: string | BannerOptions): void {
  const cwd = process.cwd();
  const version = `v${WISPY_VERSION}`;

  let modelName: string | undefined;
  let vertexai = false;
  let project: string | undefined;
  let location: string | undefined;

  if (typeof modelNameOrOptions === "string") {
    modelName = modelNameOrOptions;
  } else if (modelNameOrOptions) {
    modelName = modelNameOrOptions.modelName;
    vertexai = modelNameOrOptions.vertexai || false;
    project = modelNameOrOptions.project;
    location = modelNameOrOptions.location;
  }

  const model = modelName || "Gemini";

  // Format model name nicely
  const displayModel = model
    .replace("gemini-", "Gemini ")
    .replace("gemma-", "Gemma ")
    .replace("-preview-05-06", "")
    .replace("-preview-05-20", "")
    .replace("-pro", " Pro")
    .replace("-flash", " Flash")
    .replace("-it", "");

  // Truncate cwd if too long
  const maxCwd = 45;
  const shortCwd = cwd.length > maxCwd ? "..." + cwd.slice(-maxCwd) : cwd;

  // Provider info
  const providerInfo = vertexai
    ? chalk.green("Vertex AI") + dim(` (${project || "default"}${location ? `, ${location}` : ""})`)
    : dim(displayModel);

  // Session time
  const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  console.log();
  console.log(`  ${ICON[0]}`);
  console.log(`  ${ICON[1]}`);
  console.log(`  ${ICON[2]}   ${skyBold("Wispy")} ${dim(version)} ${dim("·")} ${dim(timeStr)}`);
  console.log(`  ${ICON[3]}   ${providerInfo}`);
  console.log(`  ${ICON[4]}   ${dim(shortCwd)}`);
  console.log(`  ${ICON[5]}`);
  console.log(`  ${ICON[6]}`);
  console.log();
}

export function showOnboardBanner(): void {
  console.log();
  console.log(`  ${ICON[0]}`);
  console.log(`  ${ICON[1]}`);
  console.log(`  ${ICON[2]}   ${skyBold("Welcome to Wispy")}`);
  console.log(`  ${ICON[3]}   ${dim("Your autonomous AI agent")}`);
  console.log(`  ${ICON[4]}   ${dim("Powered by Gemini")}`);
  console.log(`  ${ICON[5]}`);
  console.log(`  ${ICON[6]}`);
  console.log();
}

export function getScaledLogo(): string[] {
  return ICON;
}
