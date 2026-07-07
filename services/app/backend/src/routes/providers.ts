import type { App } from "./appType.js";
import type { Container } from "../container.js";
import { GithubClient } from "../providers/github.js";
import { AzureClient } from "../providers/azure.js";

/**
 * Provider routes: fetch remote resources (repos, workflows, pipelines) using
 * saved GitHub / Azure tokens so the frontend can populate dropdowns in the
 * "New Job" wizard instead of requiring the user to type identifiers by hand.
 */
export function registerProviderRoutes(app: App, c: Container) {
  // ─── GitHub ───────────────────────────────────────────────────────

  /** Verify a GitHub token (returns login). */
  app.get<{ Params: { id: string } }>("/api/github-tokens/:id/verify", async (req, reply) => {
    const token = await c.resources["github-tokens"].getRaw(req.params.id);
    if (!token) return reply.code(404).send({ error: "not found" });
    try {
      const client = new GithubClient({ token: token.secret, logger: c.logger });
      const user = await client.whoami();
      await c.appLog.write({
        scope: "provider", level: "info", provider: "github",
        action: "token.verify", message: `GitHub token verified: ${user.login}`,
        context: { tokenId: req.params.id, login: user.login },
        location: "routes/providers.ts:github-verify",
        reqId: req.id,
      });
      return { ok: true, login: user.login };
    } catch (err) {
      await c.appLog.write({
        scope: "provider", level: "error", provider: "github",
        action: "token.verify", message: `GitHub token verify failed: ${(err as Error).message}`,
        context: { tokenId: req.params.id },
        location: "routes/providers.ts:github-verify",
        reqId: req.id,
      });
      return reply.code(502).send({ error: (err as Error).message });
    }
  });

  /** List repos accessible by the token. */
  app.get<{ Params: { id: string } }>("/api/github-tokens/:id/repos", async (req, reply) => {
    const token = await c.resources["github-tokens"].getRaw(req.params.id);
    if (!token) return reply.code(404).send({ error: "not found" });
    try {
      const client = new GithubClient({ token: token.secret, logger: c.logger });
      const repos = await client.listRepos();
      await c.appLog.write({
        scope: "provider", level: "info", provider: "github",
        action: "repos.list", message: `Fetched ${repos.length} repos`,
        context: { tokenId: req.params.id, count: repos.length },
        location: "routes/providers.ts:github-repos",
        reqId: req.id,
      });
      return repos;
    } catch (err) {
      await c.appLog.write({
        scope: "provider", level: "error", provider: "github",
        action: "repos.list", message: `GitHub repos fetch failed: ${(err as Error).message}`,
        context: { tokenId: req.params.id },
        location: "routes/providers.ts:github-repos",
        reqId: req.id,
      });
      return reply.code(502).send({ error: (err as Error).message });
    }
  });

  /** List workflows for a specific repo. */
  app.get<{ Params: { id: string }; Querystring: { owner: string; repo: string } }>(
    "/api/github-tokens/:id/workflows",
    async (req, reply) => {
      const { owner, repo } = req.query;
      if (!owner || !repo) return reply.code(400).send({ error: "owner and repo required" });
      const token = await c.resources["github-tokens"].getRaw(req.params.id);
      if (!token) return reply.code(404).send({ error: "not found" });
      try {
        const client = new GithubClient({ token: token.secret, logger: c.logger });
        const workflows = await client.listWorkflows(owner, repo);
        return workflows;
      } catch (err) {
        return reply.code(502).send({ error: (err as Error).message });
      }
    },
  );

  /** List branches for a repo (for ref dropdown). */
  app.get<{ Params: { id: string }; Querystring: { owner: string; repo: string } }>(
    "/api/github-tokens/:id/branches",
    async (req, reply) => {
      const { owner, repo } = req.query;
      if (!owner || !repo) return reply.code(400).send({ error: "owner and repo required" });
      const token = await c.resources["github-tokens"].getRaw(req.params.id);
      if (!token) return reply.code(404).send({ error: "not found" });
      try {
        const client = new GithubClient({ token: token.secret, logger: c.logger });
        return await client.listBranches(owner, repo);
      } catch (err) {
        return reply.code(502).send({ error: (err as Error).message });
      }
    },
  );

  // ─── Azure ────────────────────────────────────────────────────────

  /** Verify an Azure PAT (returns project count). */
  app.get<{ Params: { id: string }; Querystring: { organization?: string } }>(
    "/api/azure-pats/:id/verify",
    async (req, reply) => {
      const resource = await c.resources["azure-pats"].getRaw(req.params.id);
      if (!resource) return reply.code(404).send({ error: "not found" });
      const organization =
        req.query.organization ??
        (resource.meta?.organization as string | undefined) ??
        "";
      if (!organization) return reply.code(400).send({ error: "organization required (query param or resource meta)" });
      try {
        const client = new AzureClient({ organization, pat: resource.secret, logger: c.logger });
        const result = await client.verify();
        await c.appLog.write({
          scope: "provider", level: "info", provider: "azure",
          action: "pat.verify", message: `Azure PAT verified, ${result.projectCount} projects`,
          context: { patId: req.params.id, organization, projectCount: result.projectCount },
          location: "routes/providers.ts:azure-verify",
          reqId: req.id,
        });
        return result;
      } catch (err) {
        await c.appLog.write({
          scope: "provider", level: "error", provider: "azure",
          action: "pat.verify", message: `Azure PAT verify failed: ${(err as Error).message}`,
          context: { patId: req.params.id, organization },
          location: "routes/providers.ts:azure-verify",
          reqId: req.id,
        });
        return reply.code(502).send({ error: (err as Error).message });
      }
    },
  );

  /** List Azure DevOps projects. */
  app.get<{ Params: { id: string }; Querystring: { organization?: string } }>(
    "/api/azure-pats/:id/projects",
    async (req, reply) => {
      const resource = await c.resources["azure-pats"].getRaw(req.params.id);
      if (!resource) return reply.code(404).send({ error: "not found" });
      const organization =
        req.query.organization ??
        (resource.meta?.organization as string | undefined) ??
        "";
      if (!organization) return reply.code(400).send({ error: "organization required" });
      try {
        const client = new AzureClient({ organization, pat: resource.secret, logger: c.logger });
        return await client.listProjects();
      } catch (err) {
        return reply.code(502).send({ error: (err as Error).message });
      }
    },
  );

  /** List pipelines for a project. */
  app.get<{ Params: { id: string }; Querystring: { organization?: string; project: string } }>(
    "/api/azure-pats/:id/pipelines",
    async (req, reply) => {
      const { organization: orgQuery, project } = req.query;
      if (!project) return reply.code(400).send({ error: "project required" });
      const resource = await c.resources["azure-pats"].getRaw(req.params.id);
      if (!resource) return reply.code(404).send({ error: "not found" });
      const organization =
        orgQuery ?? (resource.meta?.organization as string | undefined) ?? "";
      if (!organization) return reply.code(400).send({ error: "organization required" });
      try {
        const client = new AzureClient({ organization, pat: resource.secret, logger: c.logger });
        return await client.listPipelines(project);
      } catch (err) {
        return reply.code(502).send({ error: (err as Error).message });
      }
    },
  );
}
