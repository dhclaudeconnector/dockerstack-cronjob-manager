export type ResourceType = "cronjob_account" | "github_token" | "azure_pat";

/** Maps URL segment <type> ↔ internal type ↔ RTDB path. */
export const RESOURCE_TYPES = {
  accounts: { type: "cronjob_account" as ResourceType, path: "accounts" },
  "github-tokens": { type: "github_token" as ResourceType, path: "github-tokens" },
  "azure-pats": { type: "azure_pat" as ResourceType, path: "azure-pats" },
} as const;

export type ResourceUrlType = keyof typeof RESOURCE_TYPES;

export interface ManagedResource {
  id: string;
  type: ResourceType;
  label: string;
  secret: string; // stored encrypted if SECRET_ENCRYPTION_KEY set
  meta?: Record<string, unknown>;
  tags: string[];
  project?: string;
  collection?: string;
  createdAt: number;
  updatedAt: number;
  disabled?: boolean;
}

/** Resource with secret masked, for list/read responses. */
export interface MaskedResource extends Omit<ManagedResource, "secret"> {
  secret: string; // masked
  secretMasked: true;
}

export interface CronJobMeta {
  id: string;
  accountId: string;
  title: string;
  url: string;
  schedule: unknown;
  enabled: boolean;
  nextRunAt?: number;
  lastStatus?: "ok" | "failed" | "pending";
  tags: string[];
  project?: string;
  collection?: string;
  updatedAt: number;
}

export interface TaxonomyItem {
  id: string;
  name: string;
  color?: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
}

export type TaxonomyKind = "tags" | "projects" | "collections";

export interface JobLogEntry {
  id: string;
  jobId: string;
  timestamp: number;
  status: "ok" | "failed" | "pending";
  statusCode?: number;
  duration?: number;
  responseSnippet?: string;
  failReason?: string;
}

export type ExecTargetType = "file" | "fn";

export interface ExecTarget {
  type: ExecTargetType;
  name: string;
}

export type ExecStatus = "pending" | "processing" | "done" | "failed";

export interface QueueJob {
  target: ExecTarget;
  data: unknown;
  status: ExecStatus;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  execId?: string;
  error?: string;
}

export interface ExecLog {
  execId: string;
  target: ExecTarget;
  source: "http" | "queue";
  status: "ok" | "failed";
  startedAt: number;
  finishedAt: number;
  durationMs: number;
  outputPreview?: string;
  error?: string;
}
