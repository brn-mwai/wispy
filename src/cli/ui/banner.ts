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

export function showBanner(modelName?: string): void {
  const cwd = process.cwd();
  const version = "v0.6.1";
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

  console.log();
  console.log(`  ${ICON[0]}`);
  console.log(`  ${ICON[1]}`);
  console.log(`  ${ICON[2]}   ${skyBold("Wispy")} ${chalk.dim(version)}`);
  console.log(`  ${ICON[3]}   ${chalk.dim(displayModel)}`);
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
