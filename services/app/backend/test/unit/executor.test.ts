import { describe, it, expect, beforeAll } from "vitest";
import path from "node:path";
import { pino } from "pino";
import { HandlerRegistry } from "../../src/executor/registry.js";
import { Runner, FnRegistry } from "../../src/executor/runner.js";
import { MemoryRtdb } from "../../src/db/memoryRtdb.js";

const logger = pino({ level: "silent" });
const handlersDir = path.resolve(__dirname, "../../handlers");

describe("HandlerRegistry", () => {
  it("lists .mjs handlers in dir", () => {
    const reg = new HandlerRegistry({ dir: handlersDir, allowed: [], logger });
    const names = reg.list().map((h) => h.name);
    expect(names).toContain("data_sync");
    expect(names).toContain("cache_purge");
  });

  it("respects whitelist (blocks non-listed)", () => {
    const reg = new HandlerRegistry({ dir: handlersDir, allowed: ["data_sync"], logger });
    expect(reg.isAllowed("data_sync")).toBe(true);
    expect(reg.isAllowed("cache_purge")).toBe(false);
    expect(reg.resolve("cache_purge")).toBeNull();
  });

  it("loads default export fn", async () => {
    const reg = new HandlerRegistry({ dir: handlersDir, allowed: [], logger });
    const fn = await reg.load("data_sync");
    expect(typeof fn).toBe("function");
  });
});

describe("Runner", () => {
  const makeRunner = (allowed: string[] = []) => {
    const reg = new HandlerRegistry({ dir: handlersDir, allowed, logger });
    const fnReg = new FnRegistry();
    const rtdb = new MemoryRtdb();
    const runner = new Runner(
      reg,
      fnReg,
      rtdb,
      { exec: { handlersDir, allowed, timeoutMs: 1000, concurrency: 1, logPayload: true } },
      logger,
    );
    return { runner, fnReg, rtdb };
  };

  it("runs a file handler with data and returns output", async () => {
    const { runner, rtdb } = makeRunner();
    const res = await runner.run({ type: "file", name: "data_sync" }, { region: "eu", batch: 7 }, "http");
    expect(res.status).toBe("ok");
    expect((res.output as any).region).toBe("eu");
    expect((res.output as any).synced).toBe(7);
    const log = await rtdb.get(`logs/exec/${res.execId}`);
    expect(log).toBeTruthy();
  });

  it("fails when handler not whitelisted", async () => {
    const { runner } = makeRunner(["data_sync"]);
    const res = await runner.run({ type: "file", name: "cache_purge" }, {}, "http");
    expect(res.status).toBe("failed");
    expect(res.error).toMatch(/not found or not allowed/);
  });

  it("runs a registered fn handler", async () => {
    const { runner, fnReg } = makeRunner();
    fnReg.register("adder", (data: any) => ({ sum: data.a + data.b }));
    const res = await runner.run({ type: "fn", name: "adder" }, { a: 2, b: 3 }, "http");
    expect(res.status).toBe("ok");
    expect((res.output as any).sum).toBe(5);
  });

  it("times out slow handlers with a reason", async () => {
    const { runner, fnReg } = makeRunner();
    fnReg.register("slow", () => new Promise((r) => setTimeout(r, 5000)));
    const res = await runner.run({ type: "fn", name: "slow" }, {}, "http");
    expect(res.status).toBe("failed");
    expect(res.error).toMatch(/timeout/);
  });

  it("captures thrown errors", async () => {
    const { runner, fnReg } = makeRunner();
    fnReg.register("boom", () => {
      throw new Error("kaboom");
    });
    const res = await runner.run({ type: "fn", name: "boom" }, {}, "http");
    expect(res.status).toBe("failed");
    expect(res.error).toBe("kaboom");
  });
});
