import chalk from "chalk";

const sky = chalk.rgb(77, 209, 249);
const skyBold = chalk.rgb(77, 209, 249).bold;

// ── Wispy ghost icon (14 chars wide, 7 lines tall) ──
// Pixel art ghost with dome head, eyes, and wavy bottom
const ICON = [
  `    ${sky("▄████▄")}    `,                     //     ▄████▄     (narrow rounded top)
  `  ${sky("▄████████▄")}  `,                     //   ▄████████▄   (expanded dome)
  `${sky("██████████████")}`,                     // ██████████████ (full body)
  `${sky("████")}  ${sky("██")}  ${sky("████")}`, // ████  ██  ████ (eyes row 1)
  `${sky("████")}  ${sky("██")}  ${sky("████")}`, // ████  ██  ████ (eyes row 2)
  `${sky("██████████████")}`,                     // ██████████████ (body below eyes)
  `  ${sky("▀██▀██▀██▀")}  `,                     //   ▀██▀██▀██▀   (wavy ghost bottom)
];

export interface BannerOptions {
  modelName?: string;
  vertexai?: boolean;
  project?: string;
  location?: string;
}

export function showBanner(modelNameOrOptions?: string | BannerOptions): void {
  const cwd = process.cwd();
  const version = "v1.0.0";

  // Handle both old signature (string) and new signature (options object)
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
    .replace("-pro", " Pro")
    .replace("-flash", " Flash")
    .replace("-it", "");

  // Truncate cwd if too long
  const maxCwd = 40;
  const shortCwd = cwd.length > maxCwd ? "..." + cwd.slice(-maxCwd) : cwd;

  // Provider info
  const providerInfo = vertexai
    ? chalk.green("Vertex AI") + chalk.dim(` (${project || "default"}${location ? `, ${location}` : ""})`)
    : chalk.dim(displayModel);

  console.log();
  console.log(`  ${ICON[0]}`);
  console.log(`  ${ICON[1]}`);
  console.log(`  ${ICON[2]}   ${skyBold("Wispy")} ${chalk.dim(version)}`);
  console.log(`  ${ICON[3]}   ${providerInfo}`);
  console.log(`  ${ICON[4]}   ${chalk.dim(shortCwd)}`);
  console.log(`  ${ICON[5]}`);
  console.log(`  ${ICON[6]}`);
  console.log();
}

export function showOnboardBanner(): void {
  console.log();
  console.log(`  ${ICON[0]}`);
  console.log(`  ${ICON[1]}`);
  console.log(`  ${ICON[2]}   ${skyBold("Welcome to Wispy")}`);
  console.log(`  ${ICON[3]}   ${chalk.dim("Your autonomous AI agent")}`);
  console.log(`  ${ICON[4]}   ${chalk.dim("Powered by Gemini")}`);
  console.log(`  ${ICON[5]}`);
  console.log(`  ${ICON[6]}`);
  console.log();
}

export function getScaledLogo(): string[] {
  return ICON;
}
