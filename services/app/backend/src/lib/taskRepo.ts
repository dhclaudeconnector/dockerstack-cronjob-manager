import { generatePushKey } from "../db/rtdbClient.js";
import type { RtdbClient } from "../db/rtdb.js";

/**
 * Task tracker: lightweight backlog stored in RTDB at /tasks. Lets operators
 * record TODOs / bugs / improvements from the UI, mark them done, and export
 * the whole list as Markdown to hand to an AI agent.
 */
export type TaskStatus = "todo" | "in_progress" | "done";
export type TaskKind = "task" | "bug" | "improvement";
export type TaskPriority = "low" | "medium" | "high";

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

export interface CreateTaskInput {
  title: string;
  detail?: string;
  kind?: TaskKind;
  priority?: TaskPriority;
  status?: TaskStatus;
  tags?: string[];
}

export type PatchTaskInput = Partial<CreateTaskInput>;

export class TaskRepo {
  constructor(private rtdb: RtdbClient, private path = "tasks") {}

  async create(input: CreateTaskInput): Promise<TaskItem> {
    const id = generatePushKey();
    const now = Date.now();
    const item: TaskItem = {
      id,
      title: input.title,
      detail: input.detail,
      kind: input.kind ?? "task",
      priority: input.priority ?? "medium",
      status: input.status ?? "todo",
      tags: input.tags ?? [],
      createdAt: now,
      updatedAt: now,
    };
    await this.rtdb.set(`${this.path}/${id}`, item);
    return item;
  }

  async list(filter: { status?: TaskStatus; kind?: TaskKind } = {}): Promise<TaskItem[]> {
    const all = (await this.rtdb.get<Record<string, TaskItem>>(this.path)) ?? {};
    let items = Object.values(all);
    if (filter.status) items = items.filter((t) => t.status === filter.status);
    if (filter.kind) items = items.filter((t) => t.kind === filter.kind);
    return items.sort((a, b) => b.createdAt - a.createdAt);
  }

  async patch(id: string, patch: PatchTaskInput): Promise<TaskItem | null> {
    const existing = await this.rtdb.get<TaskItem>(`${this.path}/${id}`);
    if (!existing) return null;
    const next: TaskItem = {
      ...existing,
      ...patch,
      tags: patch.tags ?? existing.tags ?? [],
      updatedAt: Date.now(),
    };
    await this.rtdb.set(`${this.path}/${id}`, next);
    return next;
  }

  async remove(id: string): Promise<boolean> {
    const existing = await this.rtdb.get(`${this.path}/${id}`);
    if (!existing) return false;
    await this.rtdb.remove(`${this.path}/${id}`);
    return true;
  }

  /** Render all tasks as a Markdown checklist grouped by status. */
  async toMarkdown(): Promise<string> {
    const items = await this.list();
    const kindIcon: Record<TaskKind, string> = { task: "📋", bug: "🐛", improvement: "✨" };
    const prio: Record<TaskPriority, string> = { high: "🔴", medium: "🟡", low: "⚪" };
    const line = (t: TaskItem) =>
      `- [${t.status === "done" ? "x" : " "}] ${kindIcon[t.kind]} ${prio[t.priority]} **${t.title}**` +
      (t.detail ? `\n  - ${t.detail.replace(/\n/g, "\n  ")}` : "") +
      (t.tags.length ? `\n  - tags: ${t.tags.join(", ")}` : "");

    const groups: Array<[string, TaskStatus]> = [
      ["## 🚧 In Progress", "in_progress"],
      ["## 📝 To Do", "todo"],
      ["## ✅ Done", "done"],
    ];
    const out: string[] = ["# Task Tracker — CronOps Pro", ""];
    for (const [heading, status] of groups) {
      const group = items.filter((t) => t.status === status);
      if (group.length === 0) continue;
      out.push(heading, "", ...group.map(line), "");
    }
    return out.join("\n").trim() + "\n";
  }
}
