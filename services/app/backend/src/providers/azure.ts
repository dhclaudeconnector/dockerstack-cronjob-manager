import { request } from "undici";
import type { Logger } from "../logger.js";

/**
 * Thin wrapper over the Azure DevOps REST API (https://dev.azure.com).
 * Used to FETCH resources (projects, pipelines) with a saved Azure PAT so the
 * "New Job → Azure Pipeline" business flow can populate dropdowns.
 *
 * Auth: HTTP Basic with an empty username and the PAT as password, i.e.
 *   Authorization: Basic base64(":" + PAT)
 * api-version=7.1 (verified against Microsoft Learn docs, azure-devops-rest-7.1).
 */
const API_VERSION = "7.1";

export interface AzureClientOptions {
  /** Azure DevOps organization name (from meta or explicit). */
  organization: string;
  pat: string;
  base?: string;
  logger?: Logger;
}

export interface AzureProject {
  id: string;
  name: string;
}

export interface AzurePipeline {
  id: number;
  name: string;
  folder?: string;
}

function basicAuthHeader(pat: string): string {
  return `Basic ${Buffer.from(`:${pat}`).toString("base64")}`;
}

export class AzureClient {
  private base: string;
  private organization: string;
  private pat: string;
  private logger?: Logger;

  constructor(opts: AzureClientOptions) {
    this.organization = opts.organization;
    this.pat = opts.pat;
    this.base = (opts.base ?? "https://dev.azure.com").replace(/\/+$/, "");
    this.logger = opts.logger;
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const sep = path.includes("?") ? "&" : "?";
    const url = `${this.base}/${this.organization}${path}${sep}api-version=${API_VERSION}`;
    const bodyStr = body !== undefined ? JSON.stringify(body) : undefined;
    this.logger?.info({ provider: "azure", method, url }, "azure request");
    const res = await request(url, {
      method: method as never,
      headers: {
        Authorization: basicAuthHeader(this.pat),
        Accept: "application/json",
        ...(bodyStr ? { "Content-Type": "application/json" } : {}),
      },
      body: bodyStr,
    });
    const text = await res.body.text();
    if (res.statusCode >= 400) {
      this.logger?.warn(
        { provider: "azure", method, url, status: res.statusCode, responseBody: text.slice(0, 500) },
        "azure error response",
      );
      throw Object.assign(new Error(`azure ${res.statusCode}: ${text.slice(0, 300)}`), {
        statusCode: res.statusCode,
      });
    }
    return (text ? JSON.parse(text) : {}) as T;
  }

  /** Verify PAT + org by listing projects (throws on 401/404). */
  async verify(): Promise<{ ok: true; projectCount: number }> {
    const projects = await this.listProjects();
    return { ok: true, projectCount: projects.length };
  }

  async listProjects(): Promise<AzureProject[]> {
    const res = await this.call<{ value: Array<{ id: string; name: string }> }>(
      "GET",
      "/_apis/projects",
    );
    return (res.value ?? []).map((p) => ({ id: p.id, name: p.name }));
  }

  async listPipelines(project: string): Promise<AzurePipeline[]> {
    const res = await this.call<{
      value: Array<{ id: number; name: string; folder?: string }>;
    }>("GET", `/${encodeURIComponent(project)}/_apis/pipelines`);
    return (res.value ?? []).map((p) => ({ id: p.id, name: p.name, folder: p.folder }));
  }
}
