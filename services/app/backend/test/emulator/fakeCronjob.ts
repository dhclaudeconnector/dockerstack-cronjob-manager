import http from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Fake cron-job.org REST server for integration/smoke tests. Implements the
 * subset the CronjobClient uses: list/get/create/update/delete/history.
 * Jobs are kept in-memory keyed by an incrementing jobId.
 */
export interface FakeJob {
  jobId: number;
  title: string;
  url: string;
  enabled: boolean;
  schedule?: unknown;
  nextExecution: number;
  lastStatus?: number;
}

export interface FakeCronjobServer {
  url: string;
  close: () => Promise<void>;
  jobs: Map<number, FakeJob>;
}

export async function startFakeCronjob(): Promise<FakeCronjobServer> {
  const jobs = new Map<number, FakeJob>();
  const history = new Map<number, unknown[]>();
  let nextId = 1;

  const readBody = (req: http.IncomingMessage): Promise<any> =>
    new Promise((resolve) => {
      let buf = "";
      req.on("data", (c) => (buf += c));
      req.on("end", () => resolve(buf ? JSON.parse(buf) : {}));
    });

  const server = http.createServer(async (req, res) => {
    const send = (code: number, obj: unknown) => {
      res.writeHead(code, { "content-type": "application/json" });
      res.end(JSON.stringify(obj));
    };
    const url = req.url ?? "";
    const method = req.method ?? "GET";

    // /jobs
    if (url === "/jobs" && method === "GET") {
      return send(200, { jobs: [...jobs.values()] });
    }
    if (url === "/jobs" && method === "PUT") {
      const body = await readBody(req);
      const j = body.job ?? {};
      const jobId = nextId++;
      const job: FakeJob = {
        jobId,
        title: j.title ?? "untitled",
        url: j.url ?? "",
        enabled: j.enabled ?? true,
        schedule: j.schedule,
        nextExecution: Math.floor(Date.now() / 1000) + 3600,
      };
      jobs.set(jobId, job);
      history.set(jobId, []);
      return send(200, { jobId, jobDetails: job });
    }

    // /jobs/:id  and /jobs/:id/history
    const m = url.match(/^\/jobs\/(\d+)(\/history)?$/);
    if (m) {
      const id = Number(m[1]);
      const isHistory = Boolean(m[2]);
      const job = jobs.get(id);
      if (!job) return send(404, { error: "not found" });

      if (isHistory && method === "GET") {
        return send(200, {
          jobLog: [
            {
              jobLogId: 1,
              jobId: id,
              date: Math.floor(Date.now() / 1000) - 60,
              status: job.lastStatus === 0 ? 0 : 1,
              statusText: job.lastStatus === 0 ? "Connection failed" : "OK",
              duration: 245,
              httpStatus: job.lastStatus === 0 ? 500 : 200,
            },
          ],
        });
      }
      if (method === "GET") return send(200, { jobDetails: job });
      if (method === "PATCH") {
        const body = await readBody(req);
        const patch = body.job ?? {};
        Object.assign(job, patch);
        jobs.set(id, job);
        return send(200, { jobId: id });
      }
      if (method === "DELETE") {
        jobs.delete(id);
        return send(200, { jobId: id });
      }
    }

    send(404, { error: "unknown route", url, method });
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    jobs,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
