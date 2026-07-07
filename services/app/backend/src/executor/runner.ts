import { nanoid } from "nanoid";
import type { RtdbClient } from "../db/rtdb.js";
import type { Logger } from "../logger.js";
import type { AppConfig } from "../config/env.js";
import { HandlerRegistry, type HandlerFn } from "./registry.js";
import type { ExecLog, ExecTarget } from "../types.js";

export interface RunResult {
  execId: string;
  status: "ok" | "failed";
  durationMs: number;
  output?: unknown;
  error?: string;
}

/** Registry for in-code "fn" handlers registered programmatically. */
export class FnRegistry {
  private fns = new Map<string, HandlerFn>();
  register(name: string, fn: HandlerFn) {
    this.fns.set(name, fn);
  }
  get(name: string): HandlerFn | undefined {
    return this.fns.get(name);
  }
  list(): string[] {
    return [...this.fns.keys()];
  }
}

/**
 * Runner: imports a handler dynamically (file) or looks up a registered fn,
 * runs it with a timeout, captures output, logs to RTDB /logs/exec.
 */
export class Runner {
  constructor(
    private registry: HandlerRegistry,
    private fnRegistry: FnRegistry,
    private rtdb: RtdbClient,
    private config: Pick<AppConfig, "exec">,
    private logger: Logger,
  ) {}

  private preview(output: unknown): string | undefined {
    if (output === undefined) return undefined;
    try {
      const s = typeof output === "string" ? output : JSON.stringify(output);
      return s.length > 500 ? `${s.slice(0, 500)}…` : s;
    } catch {
      return String(output);
    }
  }

  async run(
    target: ExecTarget,
    data: unknown,
    source: "http" | "queue",
    execId = nanoid(12),
  ): Promise<RunResult> {
    const startedAt = Date.now();
    const logData = this.config.exec.logPayload ? data : "[redacted]";
    this.logger.info({ execId, target, source, data: logData }, "exec start");

    let fn: HandlerFn | undefined | null;
    if (target.type === "file") {
      fn = await this.registry.load(target.name);
    } else {
      fn = this.fnRegistry.get(target.name);
    }

    if (!fn) {
      const finishedAt = Date.now();
      const error = `handler not found or not allowed: ${target.type}:${target.name}`;
      await this.writeLog({
        execId,
        target,
        source,
        status: "failed",
        startedAt,
        finishedAt,
        durationMs: finishedAt - startedAt,
        error,
      });
      this.logger.warn({ execId, target }, error);
      return { execId, status: "failed", durationMs: finishedAt - startedAt, error };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.exec.timeoutMs);
    let result: RunResult;
    try {
      const output = await Promise.race([
        Promise.resolve(fn(data, { execId, logger: this.logger, signal: controller.signal })),
        new Promise((_, reject) => {
          controller.signal.addEventListener("abort", () =>
            reject(new Error(`timeout after ${this.config.exec.timeoutMs}ms`)),
          );
        }),
      ]);
      const finishedAt = Date.now();
      result = {
        execId,
        status: "ok",
        durationMs: finishedAt - startedAt,
        output,
      };
      await this.writeLog({
        execId,
        target,
        source,
        status: "ok",
        startedAt,
        finishedAt,
        durationMs: finishedAt - startedAt,
        outputPreview: this.preview(output),
      });
      this.logger.info({ execId, durationMs: result.durationMs }, "exec ok");
    } catch (err) {
      const finishedAt = Date.now();
      const error = (err as Error).message;
      result = { execId, status: "failed", durationMs: finishedAt - startedAt, error };
      await this.writeLog({
        execId,
        target,
        source,
        status: "failed",
        startedAt,
        finishedAt,
        durationMs: finishedAt - startedAt,
        error,
      });
      this.logger.error({ execId, error }, "exec failed");
    } finally {
      clearTimeout(timeout);
    }
    return result;
  }

  private async writeLog(log: ExecLog): Promise<void> {
    await this.rtdb.set(`logs/exec/${log.execId}`, log);
  }

  async getLog(execId: string): Promise<ExecLog | null> {
    return this.rtdb.get<ExecLog>(`logs/exec/${execId}`);
  }
}
