import type { App } from "./appType.js";
import { z } from "zod";
import type { Container } from "../container.js";
import { RESOURCE_TYPES, type ResourceUrlType } from "../types.js";
import { parseImport, serializeExport } from "../lib/importExport.js";

const createSchema = z.object({
  label: z.string().min(1),
  secret: z.string().min(1),
  meta: z.record(z.unknown()).optional(),
  tags: z.array(z.string()).optional(),
  project: z.string().optional(),
  collection: z.string().optional(),
  disabled: z.boolean().optional(),
});

const patchSchema = createSchema.partial();

const importSchema = z.object({
  format: z.enum(["json", "csv"]).default("json"),
  data: z.union([z.string(), z.array(z.unknown())]),
});

function isValidType(t: string): t is ResourceUrlType {
  return t in RESOURCE_TYPES;
}

export function registerResourceRoutes(app: App, c: Container) {
  const repoFor = (type: string) => (isValidType(type) ? c.resources[type] : null);

  app.get<{ Params: { type: string }; Querystring: Record<string, string> }>(
    "/api/:type",
    async (req, reply) => {
      const repo = repoFor(req.params.type);
      if (!repo) return reply.code(404).send({ error: "unknown resource type" });
      const { tag, project, collection, q } = req.query;
      return repo.list({ tag, project, collection, q });
    },
  );

  app.get<{ Params: { type: string; id: string } }>(
    "/api/:type/:id",
    async (req, reply) => {
      const repo = repoFor(req.params.type);
      if (!repo) return reply.code(404).send({ error: "unknown resource type" });
      const item = await repo.get(req.params.id);
      if (!item) return reply.code(404).send({ error: "not found" });
      return item;
    },
  );

  app.post<{ Params: { type: string } }>("/api/:type", async (req, reply) => {
    const repo = repoFor(req.params.type);
    if (!repo) return reply.code(404).send({ error: "unknown resource type" });
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const created = await repo.create(parsed.data);
    return reply.code(201).send(created);
  });

  app.patch<{ Params: { type: string; id: string } }>(
    "/api/:type/:id",
    async (req, reply) => {
      const repo = repoFor(req.params.type);
      if (!repo) return reply.code(404).send({ error: "unknown resource type" });
      const parsed = patchSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
      const updated = await repo.patch(req.params.id, parsed.data);
      if (!updated) return reply.code(404).send({ error: "not found" });
      return updated;
    },
  );

  app.delete<{ Params: { type: string; id: string } }>(
    "/api/:type/:id",
    async (req, reply) => {
      const repo = repoFor(req.params.type);
      if (!repo) return reply.code(404).send({ error: "unknown resource type" });
      const ok = await repo.remove(req.params.id);
      if (!ok) return reply.code(404).send({ error: "not found" });
      return { deleted: true };
    },
  );

  app.post<{ Params: { type: string } }>(
    "/api/:type/batch-import",
    async (req, reply) => {
      const repo = repoFor(req.params.type);
      if (!repo) return reply.code(404).send({ error: "unknown resource type" });
      const parsed = importSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
      let report;
      try {
        report = parseImport(parsed.data.data, parsed.data.format);
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message });
      }
      const created = await repo.bulkCreate(report.valid);
      return {
        total: report.total,
        imported: created.length,
        errors: report.errors,
        items: created,
      };
    },
  );

  app.get<{ Params: { type: string }; Querystring: Record<string, string> }>(
    "/api/:type/batch-export",
    async (req, reply) => {
      const repo = repoFor(req.params.type);
      if (!repo) return reply.code(404).send({ error: "unknown resource type" });
      const format = req.query.format === "csv" ? "csv" : "json";
      const { tag, project, collection } = req.query;
      const items = await repo.exportAll({ tag, project, collection });
      const body = serializeExport(items, format);
      reply.header(
        "content-type",
        format === "csv" ? "text/csv" : "application/json",
      );
      reply.header(
        "content-disposition",
        `attachment; filename="${req.params.type}-export.${format}"`,
      );
      return reply.send(body);
    },
  );
}
