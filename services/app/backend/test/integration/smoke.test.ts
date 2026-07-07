import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { loadConfig } from "../../src/config/env.js";
import { createLogger } from "../../src/logger.js";
import { buildContainer } from "../../src/container.js";
import { buildServer } from "../../src/server.js";
import { MemoryRtdb } from "../../src/db/memoryRtdb.js";
import { startFakeCronjob, type FakeCronjobServer } from "../emulator/fakeCronjob.js";
import type { Container } from "../../src/container.js";
import type { App } from "../../src/routes/appType.js";

/**
 * End-to-end smoke: fake cronjob.org + in-memory RTDB. Runs the full lifecycle
 * described in spec §11 (Emulator / Smoke), entirely offline / in CI.
 */
const SECRET = "smoke-secret";
const handlersDir = path.resolve(__dirname, "../../handlers");
const auth = { "x-api-secret": SECRET };

let app: App;
let container: Container;
let fake: FakeCronjobServer;

beforeAll(async () => {
  fake = await startFakeCronjob();
  const config = loadConfig(
    {
      API_SECRET: SECRET,
      FIREBASE_DB_URL: "x",
      CRONJOB_API_BASE: fake.url,
      EXEC_HANDLERS_DIR: handlersDir,
      LOG_LEVEL: "silent",
    },
    { allowNone: true },
  );
  container = buildContainer(config, createLogger({ ...config, logLevel: "silent" }), new MemoryRtdb());
  await container.queue.start();
  app = buildServer(container);
  await app.ready();
});

afterAll(async () => {
  container.queue.stop();
  await app.close();
  await fake.close();
});

describe("SMOKE: full lifecycle", () => {
  it("create account → create job → disable → logs → exec file → enqueue → assert", async () => {
    // 1. create account
    const acc = await app.inject({
      method: "POST",
      url: "/api/accounts",
      headers: auth,
      payload: { label: "smoke-acct", secret: "smoke-api-key" },
    });
    const accountId = acc.json().id;
    expect(accountId).toBeTruthy();

    // 2. create job on (fake) cronjob.org
    const job = await app.inject({
      method: "POST",
      url: "/api/jobs",
      headers: auth,
      payload: { accountId, title: "smoke-job", url: "https://example.com/x" },
    });
    const jobId = job.json().id;
    expect(job.json().nextRunAt).toBeGreaterThan(0);

    // 3. disable
    const dis = await app.inject({ method: "POST", url: `/api/jobs/${jobId}/disable`, headers: auth });
    expect(dis.json().enabled).toBe(false);

    // 4. view logs (mirrored from cronjob.org into RTDB)
    const logs = await app.inject({ method: "GET", url: `/api/jobs/${jobId}/logs`, headers: auth });
    expect(logs.json().length).toBeGreaterThan(0);

    // 5. exec a .mjs file over HTTP with data
    const exec = await app.inject({
      method: "POST",
      url: "/api/exec/file/data_sync",
      headers: auth,
      payload: { region: "smoke", batch: 3 },
    });
    expect(exec.json().status).toBe("ok");
    expect(exec.json().output.synced).toBe(3);

    // 6. enqueue a job → queue consumer runs it
    const enq = await app.inject({
      method: "POST",
      url: "/api/exec/enqueue",
      headers: auth,
      payload: { target: { type: "file", name: "cache_purge" }, data: { keys: ["k1"] } },
    });
    const key = enq.json().key;
    await new Promise((r) => setTimeout(r, 150));
    const queue = await app.inject({ method: "GET", url: "/api/exec/queue", headers: auth });
    const item = queue.json().find((j: any) => j.key === key);
    expect(item.status).toBe("done");

    // 7. exec log persisted
    const execLog = await app.inject({ method: "GET", url: `/api/exec/${exec.json().execId}`, headers: auth });
    expect(execLog.statusCode).toBe(200);
    expect(execLog.json().status).toBe("ok");
  });
});
