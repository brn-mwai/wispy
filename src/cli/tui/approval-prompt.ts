import * as readline from "readline";
import chalk from "chalk";

/**
 * CLI Trust Control Approval Prompt
 *
 * Presents a clear, formatted approval dialog when the agent
 * wants to execute a potentially destructive or sensitive action.
 */

export type ApprovalDecision = "allow" | "deny" | "always_allow";

export interface ApprovalRequest {
  action: string;
  description: string;
  tool?: string;
  args?: Record<string, unknown>;
  risk?: "low" | "medium" | "high";
}

const RISK_COLORS = {
  low: chalk.green,
  medium: chalk.yellow,
  high: chalk.red,
};

const RISK_ICONS = {
  low: "○",
  medium: "◑",
  high: "●",
};

/**
 * Show an approval prompt in the CLI and wait for user response.
 */
export async function showCliApproval(request: ApprovalRequest): Promise<ApprovalDecision> {
  const risk = request.risk || "medium";
  const color = RISK_COLORS[risk];
  const icon = RISK_ICONS[risk];

  console.log();
  console.log(chalk.dim("─".repeat(60)));
  console.log(`  ${color.bold(`${icon} Approval Required`)}`);
  console.log();
  console.log(`  ${chalk.bold("Action:")}  ${request.action}`);
  console.log(`  ${chalk.bold("Detail:")}  ${chalk.dim(request.description)}`);

  if (request.tool) {
    console.log(`  ${chalk.bold("Tool:")}    ${chalk.cyan(request.tool)}`);
  }

  if (request.args && Object.keys(request.args).length > 0) {
    const argStr = Object.entries(request.args)
      .slice(0, 3)
      .map(([k, v]) => {
        const val = typeof v === "string" ? v : JSON.stringify(v);
        return `${k}=${val.length > 50 ? val.slice(0, 47) + "..." : val}`;
      })
      .join(", ");
    console.log(`  ${chalk.bold("Args:")}    ${chalk.dim(argStr)}`);
  }

  console.log(`  ${chalk.bold("Risk:")}    ${color(risk.toUpperCase())}`);
  console.log();
  console.log(`  ${chalk.green("[y]")} Allow   ${chalk.red("[n]")} Deny   ${chalk.blue("[a]")} Always allow this action`);
  console.log(chalk.dim("─".repeat(60)));

  return new Promise<ApprovalDecision>((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(chalk.yellow("  Decision: "), (answer) => {
      rl.close();
      const a = answer.trim().toLowerCase();
      if (a === "y" || a === "yes" || a === "allow") {
        console.log(`  ${chalk.green("✓ Allowed")}\n`);
        resolve("allow");
      } else if (a === "a" || a === "always") {
        console.log(`  ${chalk.blue("✓ Always allowed")}\n`);
        resolve("always_allow");
      } else {
        console.log(`  ${chalk.red("✗ Denied")}\n`);
        resolve("deny");
      }
    });
  });
}
