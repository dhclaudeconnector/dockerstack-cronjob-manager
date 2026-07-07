import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Logger } from "../logger.js";

export interface HandlerEntry {
  name: string;
  file: string;
  description?: string;
}

export type HandlerFn = (data: unknown, ctx: HandlerContext) => Promise<unknown> | unknown;

export interface HandlerContext {
  execId: string;
  logger: Logger;
  signal?: AbortSignal;
}

/**
 * Scans the handlers directory for .mjs/.js files. Each file default-exports an
 * async (data, ctx) => result. Optional whitelist (EXEC_ALLOWED) restricts which
 * names may run, guarding against executing untrusted files (spec §5.1 / §13).
 */
export class HandlerRegistry {
  private dir: string;
  private allowed: Set<string>;
  private logger: Logger;
  private mtimeCache = new Map<string, number>();

  constructor(opts: { dir: string; allowed: string[]; logger: Logger }) {
    this.dir = path.resolve(opts.dir);
    this.allowed = new Set(opts.allowed);
    this.logger = opts.logger;
  }

  private stripExt(f: string): string {
    return f.replace(/\.(mjs|js|cjs)$/, "");
  }

  list(): HandlerEntry[] {
    if (!fs.existsSync(this.dir)) return [];
    return fs
      .readdirSync(this.dir)
      .filter((f) => /\.(mjs|js|cjs)$/.test(f))
      .map((f) => ({ name: this.stripExt(f), file: path.join(this.dir, f) }))
      .filter((e) => this.isAllowed(e.name));
  }

  isAllowed(name: string): boolean {
    if (this.allowed.size === 0) return true;
    return this.allowed.has(name);
  }

  resolve(name: string): HandlerEntry | null {
    if (!this.isAllowed(name)) return null;
    for (const ext of [".mjs", ".js", ".cjs"]) {
      const file = path.join(this.dir, `${name}${ext}`);
      if (fs.existsSync(file)) return { name, file };
    }
    return null;
  }

  /** Dynamically import a handler's default export (cache-busted by mtime). */
  async load(name: string): Promise<HandlerFn | null> {
    const entry = this.resolve(name);
    if (!entry) return null;
    const stat = fs.statSync(entry.file);
    const mtime = stat.mtimeMs;
    this.mtimeCache.set(name, mtime);
    const url = `${pathToFileURL(entry.file).href}?v=${mtime}`;
    const mod = (await import(url)) as { default?: HandlerFn };
    if (typeof mod.default !== "function") {
      this.logger.warn({ name }, "handler has no default export function");
      return null;
    }
    return mod.default;
  }
}
