import { resolve } from "path";
import { readJSON, writeJSON, ensureDir } from "../utils/file.js";

interface HistoryStore {
  entries: string[];
}

const MAX_ENTRIES = 500;

export class CliHistory {
  private path: string;
  private entries: string[];

  constructor(runtimeDir: string) {
    const dir = resolve(runtimeDir, "cli");
    ensureDir(dir);
    this.path = resolve(dir, "history.json");
    const store = readJSON<HistoryStore>(this.path);
    this.entries = store?.entries || [];
  }

  add(line: string) {
    if (!line.trim()) return;
    // Dedupe consecutive
    if (this.entries[this.entries.length - 1] === line) return;
    this.entries.push(line);
    if (this.entries.length > MAX_ENTRIES) {
      this.entries = this.entries.slice(-MAX_ENTRIES);
    }
  }

  getAll(): string[] {
    return [...this.entries];
  }

  getRecent(n: number): string[] {
    return this.entries.slice(-n);
  }

  search(query: string): string[] {
    const q = query.toLowerCase();
    return this.entries.filter(e => e.toLowerCase().includes(q));
  }

  save() {
    writeJSON(this.path, { entries: this.entries });
  }
}
