import { request } from "undici";
import type { Logger } from "../logger.js";

/**
 * Thin wrapper over the cron-job.org REST API (https://api.cron-job.org).
 * Each call is made with a per-account API key (stored in RTDB /accounts).
 *
 * The base URL is configurable so tests can point at the fake emulator server.
 */
export interface CronjobClientOptions {
  base: string;
  apiKey: string;
  logger?: Logger;
  retries?: number;
}

export interface RawCronJob {
  jobId: number | string;
  title: string;
  url: string;
  enabled: boolean;
  schedule?: unknown;
  nextExecution?: number | null;
  lastStatus?: number;
}

export interface CronJobLogItem {
  jobLogId: number | string;
  jobId: number | string;
  date: number;
  status: number; // 1 = ok
  statusText?: string;
  duration?: number;
  httpStatus?: number;
}

export class CronjobClient {
  private base: string;
  private apiKey: string;
  private logger?: Logger;
  private retries: number;

  constructor(opts: CronjobClientOptions) {
    this.base = opts.base.replace(/\/+$/, "");
    this.apiKey = opts.apiKey;
    this.logger = opts.logger;
    this.retries = opts.retries ?? 2;
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.base}${path}`;
    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        const res = await request(url, {
          method: method as never,
          headers: {
            authorization: `Bearer ${this.apiKey}`,
            "content-type": "application/json",
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        if (res.statusCode >= 500) {
          throw new Error(`cronjob.org ${res.statusCode}`);
        }
        const text = await res.body.text();
        if (res.statusCode >= 400) {
          throw new Error(`cronjob.org ${res.statusCode}: ${text}`);
        }
        return (text ? JSON.parse(text) : {}) as T;
      } catch (err) {
        lastErr = err;
        this.logger?.warn({ url, attempt, err: (err as Error).message }, "cronjob.org call failed");
        if (attempt < this.retries) {
          await new Promise((r) => setTimeout(r, 100 * (attempt + 1)));
        }
      }
    }
    throw lastErr;
  }

  async listJobs(): Promise<RawCronJob[]> {
    const res = await this.call<{ jobs: RawCronJob[] }>("GET", "/jobs");
    return res.jobs ?? [];
  }

  async getJob(jobId: string | number): Promise<RawCronJob | null> {
    const res = await this.call<{ jobDetails: RawCronJob }>("GET", `/jobs/${jobId}`);
    return res.jobDetails ?? null;
  }

  async createJob(job: Partial<RawCronJob> & { url: string; title: string }): Promise<RawCronJob> {
    const res = await this.call<{ jobId: number | string; jobDetails?: RawCronJob }>(
      "PUT",
      "/jobs",
      { job },
    );
    return res.jobDetails ?? ({ ...job, jobId: res.jobId, enabled: job.enabled ?? true } as RawCronJob);
  }

  async updateJob(jobId: string | number, patch: Partial<RawCronJob>): Promise<void> {
    await this.call("PATCH", `/jobs/${jobId}`, { job: patch });
  }

  async setEnabled(jobId: string | number, enabled: boolean): Promise<void> {
    await this.updateJob(jobId, { enabled });
  }

  async deleteJob(jobId: string | number): Promise<void> {
    await this.call("DELETE", `/jobs/${jobId}`);
  }

  async getJobLogs(jobId: string | number): Promise<CronJobLogItem[]> {
    const res = await this.call<{ jobLog: CronJobLogItem[] }>("GET", `/jobs/${jobId}/history`);
    return res.jobLog ?? [];
  }
}
