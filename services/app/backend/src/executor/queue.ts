import type { RtdbClient } from "../db/rtdb.js";
import type { Logger } from "../logger.js";
import type { Runner } from "./runner.js";
import type { QueueJob } from "../types.js";
import { generatePushKey } from "../db/rtdbClient.js";

/**
 * RTDB-backed exec queue consumer (spec §5.3).
 *  - FIFO by push key (single-consumer to preserve order)
 *  - marks pending → processing → done|failed
 *  - resume after restart: reset dangling "processing" → "pending",
 *    then process smallest not-yet-done key
 *  - idempotency by push key (a done/failed job is never re-run)
 */
export class QueueConsumer {
  private unsub?: () => void;
  private running = false;
  private processing = false;
  private pending: string[] = [];
  private seen = new Set<string>();

  constructor(
    private rtdb: RtdbClient,
    private runner: Runner,
    private queuePath: string,
    private logger: Logger,
  ) {}

  /** Enqueue a job. Returns the push key. */
  async enqueue(target: QueueJob["target"], data: unknown): Promise<string> {
    const key = generatePushKey();
    const job: QueueJob = {
      target,
      data,
      status: "pending",
      createdAt: Date.now(),
    };
    await this.rtdb.set(`${this.queuePath}/${key}`, job);
    this.logger.info({ key, target }, "enqueued job");
    return key;
  }

  /** Reset dangling "processing" nodes back to "pending" (crash recovery). */
  async resume(): Promise<number> {
    const all = (await this.rtdb.get<Record<string, QueueJob>>(this.queuePath)) ?? {};
    let reset = 0;
    for (const [key, job] of Object.entries(all)) {
      if (job.status === "processing") {
        await this.rtdb.set(`${this.queuePath}/${key}`, { ...job, status: "pending" });
        reset++;
      }
    }
    if (reset > 0) this.logger.warn({ reset }, "queue resume: reset dangling processing jobs");
    return reset;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    await this.resume();

    this.unsub = this.rtdb.onChildAdded(this.queuePath, (key) => {
      if (this.seen.has(key)) return;
      this.seen.add(key);
      this.pending.push(key);
      this.pending.sort(); // push keys sort chronologically → FIFO
      void this.drain();
    });
    this.logger.info({ queuePath: this.queuePath }, "queue consumer started");
  }

  private async drain(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      while (this.pending.length > 0) {
        const key = this.pending.shift()!;
        await this.processKey(key);
      }
    } finally {
      this.processing = false;
    }
  }

  private async processKey(key: string): Promise<void> {
    const job = await this.rtdb.get<QueueJob>(`${this.queuePath}/${key}`);
    if (!job) return;
    // idempotency: never re-run finished jobs
    if (job.status === "done" || job.status === "failed") return;

    await this.rtdb.set(`${this.queuePath}/${key}`, {
      ...job,
      status: "processing",
      startedAt: Date.now(),
    });

    const result = await this.runner.run(job.target, job.data, "queue");

    await this.rtdb.set(`${this.queuePath}/${key}`, {
      ...job,
      status: result.status === "ok" ? "done" : "failed",
      execId: result.execId,
      error: result.error,
      startedAt: job.startedAt ?? Date.now(),
      finishedAt: Date.now(),
    });
    this.logger.info({ key, status: result.status }, "queue job processed");
  }

  /** Process the whole backlog once (used by tests / one-shot runs). */
  async processBacklogOnce(): Promise<void> {
    const all = (await this.rtdb.get<Record<string, QueueJob>>(this.queuePath)) ?? {};
    const keys = Object.keys(all).sort();
    for (const key of keys) {
      await this.processKey(key);
    }
  }

  async list(): Promise<Array<{ key: string } & QueueJob>> {
    const all = (await this.rtdb.get<Record<string, QueueJob>>(this.queuePath)) ?? {};
    return Object.entries(all)
      .map(([key, job]) => ({ key, ...job }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }

  stop(): void {
    this.running = false;
    this.unsub?.();
  }
}
