import { generatePushKey } from "../db/rtdbClient.js";
import type { RtdbClient } from "../db/rtdb.js";
import type { TaxonomyItem, TaxonomyKind } from "../types.js";

type Input = Pick<TaxonomyItem, "name"> & Partial<Pick<TaxonomyItem, "color" | "description">>;

export class TaxonomyRepo {
  constructor(private rtdb: RtdbClient, private kind: TaxonomyKind) {}

  private get path(): string {
    return `taxonomy/${this.kind}`;
  }

  async create(input: Input): Promise<TaxonomyItem> {
    const id = generatePushKey();
    const now = Date.now();
    const item: TaxonomyItem = { id, ...input, createdAt: now, updatedAt: now };
    await this.rtdb.set(`${this.path}/${id}`, item);
    return item;
  }

  async get(id: string): Promise<TaxonomyItem | null> {
    return this.rtdb.get<TaxonomyItem>(`${this.path}/${id}`);
  }

  async list(): Promise<TaxonomyItem[]> {
    const all = (await this.rtdb.get<Record<string, TaxonomyItem>>(this.path)) ?? {};
    return Object.values(all).sort((a, b) => a.name.localeCompare(b.name));
  }

  async patch(id: string, patch: Partial<Input>): Promise<TaxonomyItem | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    const next = { ...existing, ...patch, updatedAt: Date.now() };
    await this.rtdb.set(`${this.path}/${id}`, next);
    return next;
  }

  async remove(id: string): Promise<boolean> {
    if (!(await this.get(id))) return false;
    await this.rtdb.remove(`${this.path}/${id}`);
    return true;
  }
}
