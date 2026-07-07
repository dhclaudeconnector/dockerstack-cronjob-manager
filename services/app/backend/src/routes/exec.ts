import type { App } from "./appType.js";
import { z } from "zod";
import type { Container } from "../container.js";

const enqueueSchema = z.object({
  target: z.object({
    type: z.enum(["file", "fn"]),
    name: z.string().min(1),
  }),
  data: z.unknown().optional(),
});

export function registerExecRoutes(app: App, c: Container) {
  // List available handlers (files + registered fns)
  app.get("/api/exec/handlers", async () => ({
    files: c.registry.list().map((h) => ({ name: h.name, file: h.file })),
    fns: c.fnRegistry.list(),
  }));

  // Run a file handler directly with request body as data (sync).
  app.post<{ Params: { name: string } }>("/api/exec/file/:name", async (req, reply) => {
    if (!c.registry.resolve(req.params.name)) {
      return reply.code(404).send({ error: `handler not found or not allowed: ${req.params.name}` });
    }
    const result = await c.runner.run({ type: "file", name: req.params.name }, req.body, "http");
    return reply.code(result.status === "ok" ? 200 : 500).send(result);
  });

  // Run a registered fn handler directly.
  app.post<{ Params: { name: string } }>("/api/exec/fn/:name", async (req, reply) => {
    if (!c.fnRegistry.get(req.params.name)) {
      return reply.code(404).send({ error: `fn not found: ${req.params.name}` });
    }
    const result = await c.runner.run({ type: "fn", name: req.params.name }, req.body, "http");
    return reply.code(result.status === "ok" ? 200 : 500).send(result);
  });

  // Enqueue a job into the RTDB queue for async processing.
  app.post("/api/exec/enqueue", async (req, reply) => {
    const parsed = enqueueSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const key = await c.queue.enqueue(parsed.data.target, parsed.data.data ?? null);
    return reply.code(202).send({ enqueued: true, key });
  });

  // Queue listing (for the Executor/Queue UI).
  app.get("/api/exec/queue", async () => c.queue.list());

  // Exec status + output + log for a single execution.
  app.get<{ Params: { execId: string } }>("/api/exec/:execId", async (req, reply) => {
    const log = await c.runner.getLog(req.params.execId);
    if (!log) return reply.code(404).send({ error: "not found" });
    return log;
  });
}
