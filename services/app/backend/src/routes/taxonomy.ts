import type { App } from "./appType.js";
import { z } from "zod";
import type { Container } from "../container.js";
import type { TaxonomyRepo } from "../lib/taxonomyRepo.js";

const inputSchema = z.object({
  name: z.string().min(1),
  color: z.string().optional(),
  description: z.string().optional(),
});

const KINDS = ["tags", "projects", "collections"] as const;
type Kind = (typeof KINDS)[number];

export function registerTaxonomyRoutes(app: App, c: Container) {
  const repoFor = (kind: string): TaxonomyRepo | null =>
    (KINDS as readonly string[]).includes(kind) ? c.taxonomy[kind as Kind] : null;

  for (const kind of KINDS) {
    app.get(`/api/${kind}`, async () => repoFor(kind)!.list());

    app.get<{ Params: { id: string } }>(`/api/${kind}/:id`, async (req, reply) => {
      const item = await repoFor(kind)!.get(req.params.id);
      if (!item) return reply.code(404).send({ error: "not found" });
      return item;
    });

    app.post(`/api/${kind}`, async (req, reply) => {
      const parsed = inputSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
      return reply.code(201).send(await repoFor(kind)!.create(parsed.data));
    });

    app.patch<{ Params: { id: string } }>(`/api/${kind}/:id`, async (req, reply) => {
      const parsed = inputSchema.partial().safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
      const updated = await repoFor(kind)!.patch(req.params.id, parsed.data);
      if (!updated) return reply.code(404).send({ error: "not found" });
      return updated;
    });

    app.delete<{ Params: { id: string } }>(`/api/${kind}/:id`, async (req, reply) => {
      const ok = await repoFor(kind)!.remove(req.params.id);
      if (!ok) return reply.code(404).send({ error: "not found" });
      return { deleted: true };
    });
  }
}
