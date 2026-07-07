import type { App } from "./appType.js";
import { z } from "zod";
import type { Container } from "../container.js";
import type { AppLogScope, AppLogLevel, AppLogProvider } from "../lib/appLog.js";

/**
 * App log routes: read the centralized app log and allow the frontend to
 * submit its own events (scope="frontend").
 */
const writeSchema = z.object({
  level: z.enum(["debug", "info", "warn", "error"]).optional(),
  provider: z.enum(["cronjob", "github", "azure", "none"]).optional(),
  action: z.string().min(1),
  message: z.string().min(1),
  context: z.record(z.unknown()).optional(),
  location: z.string().optional(),
});

export function registerAppLogRoutes(app: App, c: Container) {
  /** Query app logs with optional filters. */
  app.get<{
    Querystring: {
      scope?: AppLogScope;
      level?: AppLogLevel;
      provider?: AppLogProvider;
      limit?: string;
    };
  }>("/api/logs/app", async (req) => {
    const { scope, level, provider, limit } = req.query;
    return c.appLog.list({
      scope,
      level,
      provider,
      limit: limit ? Number(limit) : undefined,
    });
  });

  /** Frontend submits a client-side event. */
  app.post("/api/logs/app", async (req, reply) => {
    const parsed = writeSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const entry = await c.appLog.write({
      scope: "frontend",
      level: parsed.data.level,
      provider: parsed.data.provider,
      action: parsed.data.action,
      message: parsed.data.message,
      context: parsed.data.context,
      location: parsed.data.location,
      reqId: req.id,
    });
    return reply.code(201).send(entry);
  });

  /** Clear all app logs (for maintenance). */
  app.delete("/api/logs/app", async () => {
    await c.appLog.clear();
    return { cleared: true };
  });
}
