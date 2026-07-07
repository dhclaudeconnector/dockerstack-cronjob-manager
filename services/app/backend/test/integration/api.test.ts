import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import type { App } from "../../src/routes/appType.js";
import { loadConfig } from "../../src/config/env.js";
import { createLogger } from "../../src/logger.js";
import { buildContainer } from "../../src/container.js";
import { buildServer } from "../../src/server.js";
import { MemoryRtdb } from "../../src/db/memoryRtdb.js";
import { startFakeCronjob, type FakeCronjobServer } from "../emulator/fakeCronjob.js";
import type { Container } from "../../src/container.js";

const handlersDir = path.resolve(__dirname, "../../handlers");
const SECRET = "int-secret";

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
  const logger = createLogger({ ...config, logLevel: "silent" });
  container = buildContainer(config, logger, new MemoryRtdb());
  app = buildServer(container);
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await fake.close();
});

const auth = { "x-api-secret": SECRET };

describe("API secret guard", () => {
  it("rejects missing/wrong secret with 401", async () => {
    const r1 = await app.inject({ method: "GET", url: "/api/accounts" });
    expect(r1.statusCode).toBe(401);
    const r2 = await app.inject({ method: "GET", url: "/api/accounts", headers: { "x-api-secret": "wrong" } });
    expect(r2.statusCode).toBe(401);
  });

  it("allows correct secret", async () => {
    const r = await app.inject({ method: "GET", url: "/api/accounts", headers: auth });
    expect(r.statusCode).toBe(200);
  });

  it("health is public", async () => {
    const r = await app.inject({ method: "GET", url: "/health" });
    expect(r.statusCode).toBe(200);
  });
});

describe("Resource CRUD e2e", () => {
  it("creates, lists (masked), patches, deletes", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/api/github-tokens",
      headers: auth,
      payload: { label: "gh-ci", secret: "ghp_supersecret", tags: ["ci"] },
    });
    expect(create.statusCode).toBe(201);
    const id = create.json().id;
    expect(create.json().secret).not.toContain("ghp_supersecret");

    const list = await app.inject({ method: "GET", url: "/api/github-tokens", headers: auth });
    expect(list.json()).toHaveLength(1);

    const patch = await app.inject({
      method: "PATCH",
      url: `/api/github-tokens/${id}`,
      headers: auth,
      payload: { label: "gh-renamed" },
    });
    expect(patch.json().label).toBe("gh-renamed");

    const del = await app.inject({ method: "DELETE", url: `/api/github-tokens/${id}`, headers: auth });
    expect(del.json().deleted).toBe(true);
  });

  it("batch import reports per-row errors", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/api/azure-pats/batch-import",
      headers: auth,
      payload: {
        format: "json",
        data: [
          { label: "a", secret: "s1" },
          { label: "", secret: "s2" },
        ],
      },
    });
    expect(r.json().imported).toBe(1);
    expect(r.json().errors).toHaveLength(1);
  });
});

describe("Cronjob management vs emulator", () => {
  let accountId: string;
  let jobId: string;

  it("creates an account and syncs jobs", async () => {
    const acc = await app.inject({
      method: "POST",
      url: "/api/accounts",
      headers: auth,
      payload: { label: "cronjob-acct-1", secret: "api-key-xyz" },
    });
    accountId = acc.json().id;
    expect(accountId).toBeTruthy();
  });

  it("create → list → disable → enable → nextRun → delete → logs", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/api/jobs",
      headers: auth,
      payload: { accountId, title: "daily-backup", url: "https://example.com/hook", tags: ["prod"] },
    });
    expect(create.statusCode).toBe(201);
    jobId = create.json().id;
    expect(create.json().nextRunAt).toBeGreaterThan(Date.now());

    const list = await app.inject({ method: "GET", url: `/api/jobs?accountId=${accountId}`, headers: auth });
    expect(list.json().length).toBe(1);

    const disable = await app.inject({ method: "POST", url: `/api/jobs/${jobId}/disable`, headers: auth });
    expect(disable.json().enabled).toBe(false);

    const enable = await app.inject({ method: "POST", url: `/api/jobs/${jobId}/enable`, headers: auth });
    expect(enable.json().enabled).toBe(true);

    const logs = await app.inject({ method: "GET", url: `/api/jobs/${jobId}/logs`, headers: auth });
    expect(Array.isArray(logs.json())).toBe(true);
    expect(logs.json().length).toBeGreaterThan(0);

    const del = await app.inject({ method: "DELETE", url: `/api/jobs/${jobId}`, headers: auth });
    expect(del.json().deleted).toBe(true);
  });
});

describe("Executor over HTTP", () => {
  it("POST data into a .mjs file runs it and returns result", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/api/exec/file/data_sync",
      headers: auth,
      payload: { region: "ap-southeast-1", batch: 42 },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().status).toBe("ok");
    expect(r.json().output.region).toBe("ap-southeast-1");
    expect(r.json().output.synced).toBe(42);
  });

  it("404 for unknown handler", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/api/exec/file/does_not_exist",
      headers: auth,
      payload: {},
    });
    expect(r.statusCode).toBe(404);
  });

  it("enqueue → processed via queue", async () => {
    await container.queue.start();
    const r = await app.inject({
      method: "POST",
      url: "/api/exec/enqueue",
      headers: auth,
      payload: { target: { type: "file", name: "cache_purge" }, data: { keys: ["a", "b"] } },
    });
    expect(r.statusCode).toBe(202);
    const key = r.json().key;
    await new Promise((res) => setTimeout(res, 150));
    const queue = await app.inject({ method: "GET", url: "/api/exec/queue", headers: auth });
    const item = queue.json().find((j: any) => j.key === key);
    expect(item.status).toBe("done");
    container.queue.stop();
  });
});
