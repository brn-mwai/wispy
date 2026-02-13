/**
 * StatusLine - Bottom status bar displayed above the input prompt.
 *
 * Matches GitHub Copilot CLI layout:
 *   ~[⎇ main*]                                  gemini-2.5-pro
 *
 * Left: cwd + [branch indicator + branch name + dirty marker]
 * Right: model name
 */

import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { execSync } from "child_process";

interface StatusLineProps {
  model: string;
  contextPercent: number;
  sessionName: string;
}

function getGitBranch(): string | null {
  try {
    const branch = execSync("git rev-parse --abbrev-ref HEAD", {
      encoding: "utf-8",
      timeout: 1000,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    if (!branch || branch === "HEAD") return null;

    // Check if dirty
    const status = execSync("git status --porcelain", {
      encoding: "utf-8",
      timeout: 1000,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    const dirty = status.length > 0 ? "*" : "";
    return `${branch}${dirty}`;
  } catch {
    return null;
  }
}

function shortenCwd(cwd: string): string {
  const home = process.env.HOME || process.env.USERPROFILE || "";
  if (home && cwd.startsWith(home)) {
    return "~" + cwd.slice(home.length).replace(/\\/g, "/");
  }
  return cwd.replace(/\\/g, "/");
}

function formatModel(model: string): string {
  return model
    .replace("gemini-", "")
    .replace("-preview-05-06", "")
    .replace("-preview-05-20", "")
    .replace("-preview", "");
}

export function StatusLine({ model }: StatusLineProps) {
  const [branch, setBranch] = useState<string | null>(null);
  const cols = process.stdout.columns || 80;

  useEffect(() => {
    setBranch(getGitBranch());
  }, []);

  const cwd = shortenCwd(process.cwd());
  // Build left side: ~[⎇ main*]
  const left = branch ? `${cwd}[\u2387 ${branch}]` : cwd;
  const right = formatModel(model);
  const gap = Math.max(1, cols - left.length - right.length);

  return (
    <Box>
      <Text dimColor>{left}</Text>
      <Text>{" ".repeat(gap)}</Text>
      <Text dimColor>{right}</Text>
    </Box>
  );
}
