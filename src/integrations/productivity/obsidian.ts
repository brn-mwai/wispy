/**
 * Obsidian Integration
 *
 * Provides filesystem-based access to a local Obsidian vault.
 * Reads, writes, searches, and lists markdown notes.
 *
 * @requires OBSIDIAN_VAULT_PATH - Absolute path to the Obsidian vault directory.
 * @see https://obsidian.md
 */

import { Integration, type IntegrationManifest, type ToolResult } from "../base.js";
import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { join, relative, dirname, extname } from "node:path";

export default class ObsidianIntegration extends Integration {
  readonly manifest: IntegrationManifest = {
    id: "obsidian",
    name: "Obsidian",
    category: "productivity",
    version: "1.0.0",
    description: "Read, write, search, and list notes in a local Obsidian vault.",
    auth: { type: "none" },
    requires: { env: ["OBSIDIAN_VAULT_PATH"] },
    capabilities: { offline: true },
    tools: [
      {
        name: "obsidian_read_note",
        description: "Read the contents of a note.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "Relative path to the note (e.g. folder/note.md)." },
          },
          required: ["path"],
        },
      },
      {
        name: "obsidian_write_note",
        description: "Create or overwrite a note.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "Relative path for the note." },
            content: { type: "string", description: "Markdown content to write." },
          },
          required: ["path", "content"],
        },
      },
      {
        name: "obsidian_search",
        description: "Search for notes containing a query string.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Text to search for." },
          },
          required: ["query"],
        },
      },
      {
        name: "obsidian_list_notes",
        description: "List all notes in a folder.",
        parameters: {
          type: "object",
          properties: {
            folder: { type: "string", description: "Relative folder path (empty string for vault root).", default: "" },
          },
        },
      },
    ],
  };

  private get vaultPath(): string {
    const p = process.env.OBSIDIAN_VAULT_PATH;
    if (!p) throw new Error("OBSIDIAN_VAULT_PATH is not set");
    return p;
  }

  private resolve(relPath: string): string {
    const full = join(this.vaultPath, relPath);
    if (!full.startsWith(this.vaultPath)) throw new Error("Path traversal detected");
    return full;
  }

  async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      switch (toolName) {
        case "obsidian_read_note":
          return await this.readNote(args.path as string);
        case "obsidian_write_note":
          return await this.writeNote(args.path as string, args.content as string);
        case "obsidian_search":
          return await this.search(args.query as string);
        case "obsidian_list_notes":
          return await this.listNotes((args.folder as string) ?? "");
        default:
          return this.error(`Unknown tool: ${toolName}`);
      }
    } catch (err) {
      return this.error(`Obsidian error: ${(err as Error).message}`);
    }
  }

  private async readNote(path: string): Promise<ToolResult> {
    const content = await readFile(this.resolve(path), "utf-8");
    return this.ok(content, { path });
  }

  private async writeNote(path: string, content: string): Promise<ToolResult> {
    const fullPath = this.resolve(path);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content, "utf-8");
    return this.ok(`Note written: ${path}`, { path });
  }

  private async search(query: string): Promise<ToolResult> {
    const matches: string[] = [];
    const lowerQuery = query.toLowerCase();

    const walk = async (dir: string): Promise<void> => {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith(".")) {
          await walk(full);
        } else if (entry.isFile() && extname(entry.name) === ".md") {
          const content = await readFile(full, "utf-8");
          if (content.toLowerCase().includes(lowerQuery)) {
            matches.push(relative(this.vaultPath, full));
          }
        }
      }
    };

    await walk(this.vaultPath);
    return this.ok(matches.join("\n") || "No matching notes found.", { count: matches.length });
  }

  private async listNotes(folder: string): Promise<ToolResult> {
    const dir = this.resolve(folder);
    const entries = await readdir(dir, { withFileTypes: true });
    const items = entries
      .filter((e) => e.isFile() ? extname(e.name) === ".md" : !e.name.startsWith("."))
      .map((e) => `${e.isDirectory() ? "[folder] " : ""}${e.name}`);
    return this.ok(items.join("\n") || "Empty folder.", { count: items.length });
  }
}
