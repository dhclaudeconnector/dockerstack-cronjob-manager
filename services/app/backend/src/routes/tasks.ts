import type { App } from "./appType.js";
import { z } from "zod";
import type { Container } from "../container.js";
import type { TaskKind, TaskPriority, TaskStatus } from "../lib/taskRepo.js";

/**
 * Task tracker routes: CRUD + export Markdown for the "Tasks" section of the
 * Logs page. Enables operators to record TODOs / bugs / improvements, mark
 * them done, and export as Markdown for AI agents.
 */
const createSchema = z.object({
  title: z.string().min(1),
  detail: z.string().optional(),
  kind: z.enum(["task", "bug", "improvement"]).optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  status: z.enum(["todo", "in_progress", "done"]).optional(),
  tags: z.array(z.string()).optional(),
});

const patchSchema = createSchema.partial();

export function registerTaskRoutes(app: App, c: Container) {
  app.get<{ Querystring: { status?: TaskStatus; kind?: TaskKind } }>(
    "/api/tasks",
    async (req) => c.tasks.list(req.query),
  );

  app.post("/api/tasks", async (req, reply) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const created = await c.tasks.create(parsed.data);
    return reply.code(201).send(created);
  });

  app.get<{ Params: { id: string } }>("/api/tasks/:id", async (req, reply) => {
    const all = await c.tasks.list();
    const item = all.find((t) => t.id === req.params.id);
    if (!item) return reply.code(404).send({ error: "not found" });
    return item;
  });

  app.patch<{ Params: { id: string } }>("/api/tasks/:id", async (req, reply) => {
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const updated = await c.tasks.patch(req.params.id, parsed.data);
    if (!updated) return reply.code(404).send({ error: "not found" });
    return updated;
  });

  app.delete<{ Params: { id: string } }>("/api/tasks/:id", async (req, reply) => {
    const ok = await c.tasks.remove(req.params.id);
    if (!ok) return reply.code(404).send({ error: "not found" });
    return { deleted: true };
  });

  /** Export all tasks as a Markdown checklist. */
  app.get("/api/tasks/export/markdown", async () => {
    const md = await c.tasks.toMarkdown();
    return { markdown: md };
  });
}
