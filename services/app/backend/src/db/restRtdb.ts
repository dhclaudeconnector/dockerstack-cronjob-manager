import crypto from "node:crypto";
import { request } from "undici";
import type { AppConfig, ServiceAccount } from "../config/env.js";
import {
  type RtdbClient,
  generatePushKey,
  normalizePath,
} from "./rtdbClient.js";

/**
 * Firebase RTDB via REST API.
 *  - service_account mode: mint a short-lived OAuth2 access token (JWT -> Google)
 *  - auth_secret mode: append ?auth=<secret> (legacy DB secret)
 *
 * child_added is polled (RTDB streaming SSE is possible but polling keeps the
 * dependency surface minimal and works identically against the emulator).
 */
export class RestRtdb implements RtdbClient {
  private dbUrl: string;
  private authSecret?: string;
  private serviceAccount?: ServiceAccount;
  private cachedToken?: { token: string; exp: number };
  private pollHandles = new Set<NodeJS.Timeout>();
  private pollMs: number;

  constructor(firebase: AppConfig["firebase"], opts: { pollMs?: number } = {}) {
    this.dbUrl = firebase.dbUrl.replace(/\/+$/, "");
    this.authSecret = firebase.authSecret;
    this.serviceAccount = firebase.serviceAccount;
    this.pollMs = opts.pollMs ?? 2000;
  }

  private base64url(input: Buffer | string): string {
    return Buffer.from(input)
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  }

  private async getAccessToken(): Promise<string | null> {
    if (!this.serviceAccount) return null;
    const now = Math.floor(Date.now() / 1000);
    if (this.cachedToken && this.cachedToken.exp - 60 > now) {
      return this.cachedToken.token;
    }
    const header = { alg: "RS256", typ: "JWT" };
    const scope =
      "https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email";
    const claim = {
      iss: this.serviceAccount.client_email,
      scope,
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    };
    const signingInput = `${this.base64url(JSON.stringify(header))}.${this.base64url(
      JSON.stringify(claim),
    )}`;
    const signer = crypto.createSign("RSA-SHA256");
    signer.update(signingInput);
    const signature = this.base64url(
      signer.sign(this.serviceAccount.private_key),
    );
    const jwt = `${signingInput}.${signature}`;

    const body = new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }).toString();

    const res = await request("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    const json = (await res.body.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) throw new Error("Failed to mint Google OAuth token");
    this.cachedToken = { token: json.access_token, exp: now + (json.expires_in ?? 3600) };
    return json.access_token;
  }

  private async buildUrl(path: string): Promise<{ url: string; headers: Record<string, string> }> {
    const p = normalizePath(path);
    let url = `${this.dbUrl}/${p}.json`;
    const headers: Record<string, string> = {};
    const token = await this.getAccessToken();
    if (token) {
      headers["authorization"] = `Bearer ${token}`;
    } else if (this.authSecret) {
      url += `?auth=${encodeURIComponent(this.authSecret)}`;
    }
    return { url, headers };
  }

  async get<T = unknown>(path: string): Promise<T | null> {
    const { url, headers } = await this.buildUrl(path);
    const res = await request(url, { method: "GET", headers });
    if (res.statusCode === 404) return null;
    const json = (await res.body.json()) as T | null;
    return json ?? null;
  }

  async set(path: string, value: unknown): Promise<void> {
    const { url, headers } = await this.buildUrl(path);
    await request(url, {
      method: "PUT",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify(value ?? null),
    });
  }

  async update(path: string, value: Record<string, unknown>): Promise<void> {
    const { url, headers } = await this.buildUrl(path);
    await request(url, {
      method: "PATCH",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify(value),
    });
  }

  async remove(path: string): Promise<void> {
    const { url, headers } = await this.buildUrl(path);
    await request(url, { method: "DELETE", headers });
  }

  async push(path: string, value: unknown): Promise<string> {
    // Use client-side key to preserve strict FIFO ordering (spec §5.3).
    const key = generatePushKey();
    await this.set(`${normalizePath(path)}/${key}`, value);
    return key;
  }

  onChildAdded(path: string, cb: (key: string, value: unknown) => void): () => void {
    const seen = new Set<string>();
    let stopped = false;

    const poll = async () => {
      if (stopped) return;
      try {
        const data = await this.get<Record<string, unknown>>(path);
        if (data && typeof data === "object") {
          const keys = Object.keys(data).sort();
          for (const k of keys) {
            if (!seen.has(k)) {
              seen.add(k);
              cb(k, data[k]);
            }
          }
        }
      } catch {
        /* swallow poll errors, retry next tick */
      }
    };

    void poll();
    const handle = setInterval(poll, this.pollMs);
    this.pollHandles.add(handle);
    return () => {
      stopped = true;
      clearInterval(handle);
      this.pollHandles.delete(handle);
    };
  }

  close(): void {
    for (const h of this.pollHandles) clearInterval(h);
    this.pollHandles.clear();
  }
}
