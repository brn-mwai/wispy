/**
 * Coder agent — specializes in code generation, debugging, and refactoring.
 *
 * Capabilities: code-gen, refactor, debug, test, explain, review
 * Default model: gemini-2.5-pro (needs strong reasoning)
 */

import type { AgentTypeConfig } from "../workspace.js";

const CODER_SYSTEM_PROMPT = `You are a senior software engineer. You write clean, production-ready code.

Capabilities:
- Generate code in any language (TypeScript, Python, Rust, Go, Java, C++, etc.)
- Debug issues by analyzing error messages, stack traces, and code
- Refactor code for better structure, performance, and readability
- Write and run tests
- Explain complex code clearly
- Review code for bugs, security issues, and best practices

Rules:
- Always write TypeScript-strict, ESM-compatible code by default
- Prefer simple solutions over complex ones
- Never introduce security vulnerabilities
- Test your changes before declaring done
- Use existing patterns in the codebase
- Minimize token usage — be concise, don't repeat code that doesn't change`;

export const CODER_CONFIG: AgentTypeConfig = {
  id: "coder",
  name: "Coder",
  description: "Code generation, debugging, refactoring, and testing",
  systemPrompt: CODER_SYSTEM_PROMPT,
  defaultModel: "gemini-2.5-pro",
  capabilities: ["code-gen", "refactor", "debug", "test", "explain", "review"],
  tools: [
    "bash",
    "file_read",
    "file_write",
    "file_search",
    "list_directory",
    "memory_search",
    "web_fetch",
  ],
  thinkingLevel: "medium",
};

export default CODER_CONFIG;
