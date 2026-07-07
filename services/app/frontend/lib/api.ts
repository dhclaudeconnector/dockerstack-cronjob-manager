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

export interface JobSchedule {
  timezone?: string;
  expiresAt?: number;
  hours?: number[];
  mdays?: number[];
  minutes?: number[];
  months?: number[];
  wdays?: number[];
}

export type RequestMethodValue = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export const REQUEST_METHODS: Record<RequestMethodValue, string> = {
  0: "GET", 1: "POST", 2: "OPTIONS", 3: "HEAD", 4: "PUT",
  5: "DELETE", 6: "TRACE", 7: "CONNECT", 8: "PATCH",
};

export interface ExtendedJobData {
  headers?: Record<string, string>;
  body?: string;
}

export interface JobMeta {
  id: string;
  accountId: string;
  title: string;
  url: string;
  schedule?: JobSchedule;
  enabled: boolean;
  requestMethod?: RequestMethodValue;
  extendedData?: ExtendedJobData;
  saveResponses?: boolean;
  requestTimeout?: number;
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

// ─── Provider types ───────────────────────────────────────────────

export interface GithubRepo {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  private: boolean;
  defaultBranch: string;
}

export interface GithubWorkflow {
  id: number;
  name: string;
  path: string;
  fileName: string;
  state: string;
}

export interface GithubBranch {
  name: string;
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

// ─── Task tracker types ──────────────────────────────────────────

export type TaskKind = "task" | "bug" | "improvement";
export type TaskPriority = "low" | "medium" | "high";
export type TaskStatus = "todo" | "in_progress" | "done";

export interface TaskItem {
  id: string;
  title: string;
  detail?: string;
  kind: TaskKind;
  priority: TaskPriority;
  status: TaskStatus;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

// ─── App Log types ───────────────────────────────────────────────

export type AppLogScope = "backend" | "frontend" | "provider";
export type AppLogLevel = "debug" | "info" | "warn" | "error";
export type AppLogProvider = "cronjob" | "github" | "azure" | "none";

export interface AppLogEntry {
  id: string;
  timestamp: number;
  scope: AppLogScope;
  level: AppLogLevel;
  provider?: AppLogProvider;
  action: string;
  message: string;
  context?: Record<string, unknown>;
  location?: string;
  reqId?: string;
}

// ─── Curl export ─────────────────────────────────────────────────

export interface CurlResult {
  masked: string;
  unmasked: string;
}

// ─── API client ──────────────────────────────────────────────────

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
