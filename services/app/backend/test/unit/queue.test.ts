import { describe, it, expect } from "vitest";
import path from "node:path";
import { pino } from "pino";
import { MemoryRtdb } from "../../src/db/memoryRtdb.js";
import { HandlerRegistry } from "../../src/executor/registry.js";
import { Runner, FnRegistry } from "../../src/executor/runner.js";
import { QueueConsumer } from "../../src/executor/queue.js";
import type { QueueJob } from "../../src/types.js";

const logger = pino({ level: "silent" });
const handlersDir = path.resolve(__dirname, "../../handlers");

function makeQueue(rtdb = new MemoryRtdb()) {
  const reg = new HandlerRegistry({ dir: handlersDir, allowed: [], logger });
  const fnReg = new FnRegistry();
  const runner = new Runner(
    reg,
    fnReg,
    rtdb,
    { exec: { handlersDir, allowed: [], timeoutMs: 2000, concurrency: 1, logPayload: true } },
    logger,
  );
  const queue = new QueueConsumer(rtdb, runner, "/exec-queue", logger);
  return { rtdb, queue, fnReg };
}

describe("QueueConsumer", () => {
  it("processes enqueued jobs and marks done", async () => {
    const { rtdb, queue } = makeQueue();
    const key = await queue.enqueue({ type: "file", name: "data_sync" }, { region: "us" });
    await queue.processBacklogOnce();
    const job = await rtdb.get<QueueJob>(`/exec-queue/${key}`);
    expect(job?.status).toBe("done");
    expect(job?.execId).toBeTruthy();
  });

  it("preserves FIFO order by push key", async () => {
    const { rtdb, queue, fnReg } = makeQueue();
    const order: string[] = [];
    fnReg.register("track", (data: any) => {
      order.push(data.id);
      return { ok: true };
    });
    const k1 = await queue.enqueue({ type: "fn", name: "track" }, { id: "a" });
    const k2 = await queue.enqueue({ type: "fn", name: "track" }, { id: "b" });
    const k3 = await queue.enqueue({ type: "fn", name: "track" }, { id: "c" });
    expect([k1, k2, k3]).toEqual([...[k1, k2, k3]].sort());
    await queue.processBacklogOnce();
    expect(order).toEqual(["a", "b", "c"]);
  });

  it("resume resets dangling processing → pending and does not lose jobs", async () => {
    const { rtdb, queue } = makeQueue();
    const key = await queue.enqueue({ type: "file", name: "data_sync" }, { region: "x" });
    // simulate crash mid-flight: mark processing
    const job = await rtdb.get<QueueJob>(`/exec-queue/${key}`);
    await rtdb.set(`/exec-queue/${key}`, { ...job, status: "processing" });

    const reset = await queue.resume();
    expect(reset).toBe(1);
    const after = await rtdb.get<QueueJob>(`/exec-queue/${key}`);
    expect(after?.status).toBe("pending");

    await queue.processBacklogOnce();
    const done = await rtdb.get<QueueJob>(`/exec-queue/${key}`);
    expect(done?.status).toBe("done");
  });

  it("idempotency: never re-runs done/failed jobs", async () => {
    const { rtdb, queue, fnReg } = makeQueue();
    let runs = 0;
    fnReg.register("count", () => {
      runs++;
      return { ok: true };
    });
    const key = await queue.enqueue({ type: "fn", name: "count" }, {});
    await queue.processBacklogOnce();
    await queue.processBacklogOnce(); // second pass must be a no-op
    expect(runs).toBe(1);
    const job = await rtdb.get<QueueJob>(`/exec-queue/${key}`);
    expect(job?.status).toBe("done");
  });

  it("live subscription processes newly enqueued jobs", async () => {
    const { rtdb, queue } = makeQueue();
    await queue.start();
    const key = await queue.enqueue({ type: "file", name: "data_sync" }, { region: "live" });
    // wait for async drain
    await new Promise((r) => setTimeout(r, 100));
    const job = await rtdb.get<QueueJob>(`/exec-queue/${key}`);
    expect(job?.status).toBe("done");
    queue.stop();
  });
});
