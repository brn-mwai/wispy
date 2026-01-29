import chalk from "chalk";

/**
 * Simple markdown-to-terminal renderer.
 * Handles headers, bold, italic, code blocks, inline code, lists, and links.
 */
export function renderMarkdown(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let inCodeBlock = false;

  for (const line of lines) {
    if (line.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      if (inCodeBlock) {
        out.push(chalk.dim("─".repeat(40)));
      } else {
        out.push(chalk.dim("─".repeat(40)));
      }
      continue;
    }

    if (inCodeBlock) {
      out.push(chalk.gray("  " + line));
      continue;
    }

    let l = line;

    // Headers
    if (l.startsWith("### ")) { out.push(chalk.bold.cyan(l.slice(4))); continue; }
    if (l.startsWith("## ")) { out.push(chalk.bold.magenta(l.slice(3))); continue; }
    if (l.startsWith("# ")) { out.push(chalk.bold.yellow(l.slice(2))); continue; }

    // Bullet lists
    if (/^(\s*)[-*] /.test(l)) {
      l = l.replace(/^(\s*)[-*] /, "$1• ");
    }

    // Inline code
    l = l.replace(/`([^`]+)`/g, (_, code) => chalk.bgGray.white(` ${code} `));
    // Bold
    l = l.replace(/\*\*(.+?)\*\*/g, (_, text) => chalk.bold(text));
    // Italic
    l = l.replace(/\*(.+?)\*/g, (_, text) => chalk.italic(text));
    // Links
    l = l.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) => `${chalk.underline.blue(text)} ${chalk.dim(`(${url})`)}`);

    out.push(l);
  }

  return out.join("\n");
}
