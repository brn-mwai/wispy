import * as readline from "readline";
import chalk from "chalk";
import type { ApprovalRequest } from "../security/action-guard.js";

const sessionAllowed = new Set<string>();

export async function showApprovalDialog(req: ApprovalRequest): Promise<boolean> {
  // Auto-approve if user said "always allow" this session
  if (sessionAllowed.has(req.toolName)) return true;

  const categoryColor = req.category === "destructive" ? chalk.red : chalk.yellow;
  const icon = req.category === "destructive" ? "!" : "?";

  console.log();
  console.log(categoryColor(`  ${icon} ${req.category.toUpperCase()} action requires approval`));
  console.log(chalk.white(`    Tool: ${req.toolName}`));
  console.log(chalk.dim(`    ${req.description}`));

  const argsStr = JSON.stringify(req.params);
  if (argsStr.length > 2) {
    console.log(chalk.dim(`    Args: ${argsStr.slice(0, 120)}${argsStr.length > 120 ? "..." : ""}`));
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const answer = await new Promise<string>((resolve) => {
    rl.question(chalk.cyan("    [A]llow  [D]eny  [S]ession: "), (a) => resolve(a.trim().toLowerCase()));
  });
  rl.close();

  if (answer === "s" || answer === "session") {
    sessionAllowed.add(req.toolName);
    console.log(chalk.green(`    Allowed for this session.`));
    return true;
  }

  if (answer === "a" || answer === "allow" || answer === "y" || answer === "yes") {
    return true;
  }

  console.log(chalk.dim("    Denied."));
  return false;
}
