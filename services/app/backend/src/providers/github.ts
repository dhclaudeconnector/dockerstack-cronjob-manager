import { request } from "undici";
import type { Logger } from "../logger.js";

/**
 * Thin wrapper over the GitHub REST API (https://api.github.com).
 * Used to FETCH resources (repos, workflows) with a saved GitHub token so the
 * "New Job → GitHub Actions" business flow can populate dropdowns instead of
 * making the user type owner/repo/workflow by hand.
 *
 * Auth: `Authorization: Bearer <token>` + `X-GitHub-Api-Version: 2022-11-28`.
 * Verified against GitHub REST docs (2024): endpoints and headers below are current.
 */
const GITHUB_API_VERSION = "2022-11-28";

export interface GithubClientOptions {
  token: string;
  base?: string;
  logger?: Logger;
}

export interface GithubRepo {
  id: number;
  name: string;
  fullName: string; // owner/repo
  owner: string;
  private: boolean;
  defaultBranch: string;
}

export interface GithubWorkflow {
  id: number;
  name: string;
  path: string; // .github/workflows/xxx.yml
  fileName: string; // xxx.yml
  state: string;
}

export interface GithubBranch {
  name: string;
}

export class GithubClient {
  private base: string;
  private token: string;
  private logger?: Logger;

  constructor(opts: GithubClientOptions) {
    this.base = (opts.base ?? "https://api.github.com").replace(/\/+$/, "");
    this.token = opts.token;
    this.logger = opts.logger;
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.base}${path}`;
    const bodyStr = body !== undefined ? JSON.stringify(body) : undefined;
    this.logger?.info({ provider: "github", method, url }, "github request");
    const res = await request(url, {
      method: method as never,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
        "User-Agent": "cronjob-manager",
        ...(bodyStr ? { "Content-Type": "application/json" } : {}),
      },
      body: bodyStr,
    });
    const text = await res.body.text();
    if (res.statusCode >= 400) {
      this.logger?.warn(
        { provider: "github", method, url, status: res.statusCode, responseBody: text.slice(0, 500) },
        "github error response",
      );
      throw Object.assign(new Error(`github ${res.statusCode}: ${text.slice(0, 300)}`), {
        statusCode: res.statusCode,
      });
    }
    return (text ? JSON.parse(text) : {}) as T;
  }

  /** Verify the token and return the authenticated user's login. */
  async whoami(): Promise<{ login: string }> {
    const u = await this.call<{ login: string }>("GET", "/user");
    return { login: u.login };
  }

  /** List repos the token can access (owner + collaborator + org member). */
  async listRepos(perPage = 100): Promise<GithubRepo[]> {
    const raw = await this.call<
      Array<{
        id: number;
        name: string;
        full_name: string;
        owner: { login: string };
        private: boolean;
        default_branch: string;
      }>
    >("GET", `/user/repos?per_page=${perPage}&sort=updated&affiliation=owner,collaborator,organization_member`);
    return raw.map((r) => ({
      id: r.id,
      name: r.name,
      fullName: r.full_name,
      owner: r.owner?.login ?? r.full_name.split("/")[0],
      private: r.private,
      defaultBranch: r.default_branch,
    }));
  }

  /** List workflows for a repo. */
  async listWorkflows(owner: string, repo: string): Promise<GithubWorkflow[]> {
    const res = await this.call<{
      total_count: number;
      workflows: Array<{ id: number; name: string; path: string; state: string }>;
    }>("GET", `/repos/${owner}/${repo}/actions/workflows`);
    return (res.workflows ?? []).map((w) => ({
      id: w.id,
      name: w.name,
      path: w.path,
      fileName: w.path.split("/").pop() ?? w.path,
      state: w.state,
    }));
  }

  /** List branches for a repo (used as ref options for dispatch). */
  async listBranches(owner: string, repo: string): Promise<GithubBranch[]> {
    const raw = await this.call<Array<{ name: string }>>(
      "GET",
      `/repos/${owner}/${repo}/branches?per_page=100`,
    );
    return raw.map((b) => ({ name: b.name }));
  }
}
