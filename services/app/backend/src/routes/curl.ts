import type { App } from "./appType.js";
import { z } from "zod";
import type { Container } from "../container.js";
import { buildCurl, type CurlInput } from "../lib/curlBuilder.js";

/**
 * Utility routes: curl export (convert a job's outbound request into a curl
 * command so operators can reproduce/debug the call externally).
 */
const curlSchema = z.object({
  url: z.string().url(),
  requestMethod: z.union([
    z.literal(0), z.literal(1), z.literal(2), z.literal(3),
    z.literal(4), z.literal(5), z.literal(6), z.literal(7), z.literal(8),
  ]).optional(),
  extendedData: z.object({
    headers: z.record(z.string()).optional(),
    body: z.string().optional(),
  }).optional(),
});

export function registerCurlRoutes(app: App, c: Container) {
  app.post("/api/curl", async (req, reply) => {
    const parsed = curlSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const input: CurlInput = {
      url: parsed.data.url,
      requestMethod: parsed.data.requestMethod,
      extendedData: parsed.data.extendedData,
    };
    const masked = buildCurl(input, { maskSecrets: true });
    const unmasked = buildCurl(input, { maskSecrets: false });
    return { masked, unmasked };
  });

  /** Also export curl for an existing job. */
  app.get<{ Params: { jobId: string } }>("/api/jobs/:jobId/curl", async (req, reply) => {
    const meta = await c.jobs.get(req.params.jobId);
    if (!meta) return reply.code(404).send({ error: "not found" });
    const input: CurlInput = {
      url: meta.url,
      requestMethod: meta.requestMethod,
      extendedData: meta.extendedData,
    };
    const masked = buildCurl(input, { maskSecrets: true });
    const unmasked = buildCurl(input, { maskSecrets: false });
    return { masked, unmasked };
  });
}
