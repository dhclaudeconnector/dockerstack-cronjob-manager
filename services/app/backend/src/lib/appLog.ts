import { generatePushKey } from "../db/rtdbClient.js";
import type { RtdbClient } from "../db/rtdb.js";
import type { Logger } from "../logger.js";

/**
 * Centralized application log stored in RTDB at /logs/app, surfaced by the
 * Logs UI. Complements the pino file/stdout logs (machine logs) with a
 * queryable, human-facing timeline that ALWAYS masks secrets.
 *
 * scope:
 *  - "backend"  : internal backend events (route errors, business steps)
 *  - "frontend" : events reported by the browser (via /api/logs/app POST)
 *  - "provider" : outbound calls to cronjob.org / github / azure
 */
export type AppLogScope = "backend" | "frontend" | "provider";
export type AppLogLevel = "debug" | "info" | "warn" | "error";
export type AppLogProvider = "cronjob" | "github" | "azure" | "none";

export interface AppLogEntry {
  id: string;
  timestamp: number;
  scope: AppLogScope;
  level: AppLogLevel;
  provider?: AppLogProvider;
  action: string; // short machine-readable action, e.g. "job.create"
  message: string; // human readable
  /** Structured, already-masked context. Never put raw secrets here. */
  context?: Record<string, unknown>;
  /** Populated on errors — where in the code it happened. */
  location?: string;
  reqId?: string;
}

const SECRET_KEY_RE = /(authorization|token|secret|password|pat|apikey|api[-_]?key|cookie|private[-_]?key)/i;

/** Deep-mask secret-looking values in an arbitrary object for safe logging. */
export function maskDeep(value: unknown, keyHint = ""): unknown {
  if (typeof value === "string") {
    if (SECRET_KEY_RE.test(keyHint) && value.length > 0) {
      const m = value.match(/^(\s*(?:Bearer|Basic|token)\s+)(.+)$/i);
      if (m) return `${m[1]}****${m[2].slice(-4)}`;
      return value.length <= 8 ? "****" : `****${value.slice(-4)}`;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => maskDeep(v, keyHint));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = maskDeep(v, k);
    }
    return out;
  }
  return value;
}

export interface AppLogInput {
  scope: AppLogScope;
  level?: AppLogLevel;
  provider?: AppLogProvider;
  action: string;
  message: string;
  context?: Record<string, unknown>;
  location?: string;
  reqId?: string;
}

export class AppLogRepo {
  private path = "logs/app";
  constructor(private rtdb: RtdbClient, private logger?: Logger) {}

  async write(input: AppLogInput): Promise<AppLogEntry> {
    const id = generatePushKey();
    const entry: AppLogEntry = {
      id,
      timestamp: Date.now(),
      scope: input.scope,
      level: input.level ?? "info",
      provider: input.provider,
      action: input.action,
      message: input.message,
      context: input.context ? (maskDeep(input.context) as Record<string, unknown>) : undefined,
      location: input.location,
      reqId: input.reqId,
    };
    try {
      await this.rtdb.set(`${this.path}/${id}`, entry);
    } catch (err) {
      // Never let logging break the request path.
      this.logger?.warn({ err: (err as Error).message }, "appLog write failed");
    }
    return entry;
  }

  async list(filter: { scope?: AppLogScope; level?: AppLogLevel; provider?: AppLogProvider; limit?: number } = {}): Promise<AppLogEntry[]> {
    const all = (await this.rtdb.get<Record<string, AppLogEntry>>(this.path)) ?? {};
    let items = Object.values(all);
    if (filter.scope) items = items.filter((e) => e.scope === filter.scope);
    if (filter.level) items = items.filter((e) => e.level === filter.level);
    if (filter.provider) items = items.filter((e) => e.provider === filter.provider);
    items.sort((a, b) => b.timestamp - a.timestamp);
    return items.slice(0, filter.limit ?? 300);
  }

  async clear(): Promise<void> {
    await this.rtdb.remove(this.path);
  }
}
