import type { App } from "./appType.js";
import { z } from "zod";
import type { Container } from "../container.js";

const createSchema = z.object({
  accountId: z.string().min(1),
  title: z.string().min(1),
  url: z.string().url(),
  schedule: z.unknown().optional(),
  enabled: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  project: z.string().optional(),
  collection: z.string().optional(),
});

const patchSchema = z.object({
  title: z.string().optional(),
  url: z.string().url().optional(),
  schedule: z.unknown().optional(),
  tags: z.array(z.string()).optional(),
  project: z.string().optional(),
  collection: z.string().optional(),
});

export function registerJobRoutes(app: App, c: Container) {
  app.get<{ Querystring: Record<string, string> }>("/api/jobs", async (req) => {
    const { accountId, tag, project, collection } = req.query;
    return c.jobs.list({ accountId, tag, project, collection });
  });

  app.post("/api/jobs", async (req, reply) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    try {
      return reply.code(201).send(await c.jobs.create(parsed.data));
    } catch (err) {
      return reply.code(502).send({ error: (err as Error).message });
    }
  });

  app.post<{ Querystring: { accountId?: string } }>("/api/jobs/sync", async (req, reply) => {
    const accountId = req.query.accountId;
    if (!accountId) return reply.code(400).send({ error: "accountId required" });
    try {
      return await c.jobs.sync(accountId);
    } catch (err) {
      return reply.code(502).send({ error: (err as Error).message });
    }
  });

  app.get<{ Params: { jobId: string } }>("/api/jobs/:jobId", async (req, reply) => {
    const job = await c.jobs.get(req.params.jobId);
    if (!job) return reply.code(404).send({ error: "not found" });
    return job;
  });

  app.patch<{ Params: { jobId: string } }>("/api/jobs/:jobId", async (req, reply) => {
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const updated = await c.jobs.patch(req.params.jobId, parsed.data);
    if (!updated) return reply.code(404).send({ error: "not found" });
    return updated;
  });

  app.post<{ Params: { jobId: string } }>("/api/jobs/:jobId/enable", async (req, reply) => {
    const updated = await c.jobs.setEnabled(req.params.jobId, true);
    if (!updated) return reply.code(404).send({ error: "not found" });
    return updated;
  });

  app.post<{ Params: { jobId: string } }>("/api/jobs/:jobId/disable", async (req, reply) => {
    const updated = await c.jobs.setEnabled(req.params.jobId, false);
    if (!updated) return reply.code(404).send({ error: "not found" });
    return updated;
  });

  app.delete<{ Params: { jobId: string } }>("/api/jobs/:jobId", async (req, reply) => {
    const ok = await c.jobs.remove(req.params.jobId);
    if (!ok) return reply.code(404).send({ error: "not found" });
    return { deleted: true };
  });

  app.get<{ Params: { jobId: string } }>("/api/jobs/:jobId/logs", async (req, reply) => {
    try {
      return await c.jobs.logs(req.params.jobId);
    } catch (err) {
      return reply.code(502).send({ error: (err as Error).message });
    }
  });
}
