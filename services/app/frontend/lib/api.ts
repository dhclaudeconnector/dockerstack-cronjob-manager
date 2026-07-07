export interface Resource {
  id: string;
  type: "cronjob_account" | "github_token" | "azure_pat";
  label: string;
  secret: string;
  secretMasked?: true;
  meta?: Record<string, unknown>;
  tags: string[];
  project?: string;
  collection?: string;
  createdAt: number;
  updatedAt: number;
  disabled?: boolean;
}

export interface JobMeta {
  id: string;
  accountId: string;
  title: string;
  url: string;
  schedule?: unknown;
  enabled: boolean;
  nextRunAt?: number;
  lastStatus?: "ok" | "failed" | "pending";
  tags: string[];
  project?: string;
  collection?: string;
  updatedAt: number;
}

export interface JobLog {
  id: string;
  jobId: string;
  timestamp: number;
  status: "ok" | "failed" | "pending";
  statusCode?: number;
  duration?: number;
  responseSnippet?: string;
  failReason?: string;
}

export interface QueueItem {
  key: string;
  target: { type: "file" | "fn"; name: string };
  data?: unknown;
  status: "pending" | "processing" | "done" | "failed";
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  execId?: string;
  error?: string;
}

export interface ExecLog {
  execId: string;
  target: { type: "file" | "fn"; name: string };
  source: "http" | "queue";
  status: "ok" | "failed";
  startedAt: number;
  finishedAt: number;
  durationMs: number;
  outputPreview?: string;
  error?: string;
}

export interface HandlerInfo {
  files: Array<{ name: string; file: string }>;
  fns: string[];
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/proxy/${path.replace(/^\/+/, "")}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: unknown };
      if (body.error) message = typeof body.error === "string" ? body.error : JSON.stringify(body.error);
    } catch {
      // Ignore non-JSON error bodies.
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T = unknown>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T = unknown>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  del: <T = unknown>(path: string) => request<T>(path, { method: "DELETE" }),
};
