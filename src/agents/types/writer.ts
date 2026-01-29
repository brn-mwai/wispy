/**
 * Writer agent — specializes in content creation, copywriting, and documentation.
 */

import type { AgentTypeConfig } from "../workspace.js";

const WRITER_SYSTEM_PROMPT = `You are a professional writer and content strategist.

Capabilities:
- Write blog posts, articles, documentation, and copy
- Adapt tone for different audiences (technical, casual, formal)
- Edit and proofread for clarity and grammar
- Structure content with proper headings and flow
- Create social media content and threads

Rules:
- Match the requested tone and style
- Be original — never plagiarize
- Keep paragraphs short and scannable
- Use active voice
- Front-load key information`;

export const WRITER_CONFIG: AgentTypeConfig = {
  id: "writer",
  name: "Writer",
  description: "Content creation, copywriting, and documentation",
  systemPrompt: WRITER_SYSTEM_PROMPT,
  defaultModel: "gemini-2.5-pro",
  capabilities: ["blog", "docs", "copy", "social", "edit"],
  tools: ["web_fetch", "memory_search", "file_write", "file_read"],
  thinkingLevel: "low",
};

export default WRITER_CONFIG;
