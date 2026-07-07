import { z } from "zod";
import type { ManagedResource } from "../types.js";

const rowSchema = z.object({
  label: z.string().min(1),
  secret: z.string().min(1),
  meta: z.record(z.unknown()).optional(),
  tags: z.union([z.array(z.string()), z.string()]).optional(),
  project: z.string().optional(),
  collection: z.string().optional(),
  disabled: z.boolean().optional(),
});

export interface ImportReport {
  total: number;
  valid: Array<{
    label: string;
    secret: string;
    meta?: Record<string, unknown>;
    tags?: string[];
    project?: string;
    collection?: string;
    disabled?: boolean;
  }>;
  errors: Array<{ row: number; error: string }>;
}

function normalizeTags(tags: unknown): string[] | undefined {
  if (Array.isArray(tags)) return tags.map(String).filter(Boolean);
  if (typeof tags === "string") return tags.split(/[;,]/).map((s) => s.trim()).filter(Boolean);
  return undefined;
}

export function parseCsv(csv: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];
    const next = csv[i + 1];
    if (quoted) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  row.push(field);
  rows.push(row);
  const [headers = [], ...data] = rows.filter((r) => r.some((v) => v !== ""));
  return data.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])));
}

export function parseImport(input: string | unknown[], format: "json" | "csv"): ImportReport {
  const rows = format === "csv"
    ? parseCsv(String(input))
    : (typeof input === "string" ? JSON.parse(input) : input);
  if (!Array.isArray(rows)) throw new Error("import data must be an array");

  const report: ImportReport = { total: rows.length, valid: [], errors: [] };
  rows.forEach((raw, idx) => {
    const row = typeof raw === "object" && raw !== null ? { ...(raw as Record<string, unknown>) } : raw;
    if (typeof row === "object" && row !== null) {
      (row as Record<string, unknown>).tags = normalizeTags((row as Record<string, unknown>).tags);
      if ((row as Record<string, unknown>).disabled === "true") (row as Record<string, unknown>).disabled = true;
      if ((row as Record<string, unknown>).disabled === "false" || (row as Record<string, unknown>).disabled === "") {
        delete (row as Record<string, unknown>).disabled;
      }
    }
    const parsed = rowSchema.safeParse(row);
    if (parsed.success) report.valid.push({ ...parsed.data, tags: normalizeTags(parsed.data.tags) ?? [] });
    else report.errors.push({ row: idx + 1, error: parsed.error.issues.map((i) => i.message).join("; ") });
  });
  return report;
}

function csvEscape(value: unknown): string {
  const s = Array.isArray(value) ? value.join(";") : value == null ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function serializeExport(items: ManagedResource[], format: "json" | "csv"): string {
  const rows = items.map(({ label, secret, tags, project, collection, disabled, meta }) => ({
    label,
    secret,
    tags,
    project,
    collection,
    disabled,
    meta,
  }));
  if (format === "json") return JSON.stringify(rows, null, 2);
  const headers = ["label", "secret", "tags", "project", "collection", "disabled"];
  return [headers.join(","), ...rows.map((r) => headers.map((h) => csvEscape((r as Record<string, unknown>)[h])).join(","))].join("\n");
}
