import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { generatePushKey } from "../db/rtdbClient.js";
import type { RtdbClient } from "../db/rtdb.js";
import type { AppConfig } from "../config/env.js";
import type { ManagedResource, MaskedResource, ResourceType } from "../types.js";

type CreateInput = Pick<ManagedResource, "label" | "secret"> & Partial<Pick<ManagedResource, "meta" | "tags" | "project" | "collection" | "disabled">>;
type PatchInput = Partial<CreateInput>;
type ListFilter = { tag?: string; project?: string; collection?: string; q?: string };

const ENC_PREFIX = "enc:v1:";

function keyBytes(key: string): Buffer {
  return createHash("sha256").update(key).digest();
}

function encrypt(secret: string, key?: string): string {
  if (!key) return secret;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes(key), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENC_PREFIX}${Buffer.concat([iv, tag, ciphertext]).toString("base64")}`;
}

function decrypt(secret: string, key?: string): string {
  if (!secret.startsWith(ENC_PREFIX)) return secret;
  if (!key) return secret;
  const raw = Buffer.from(secret.slice(ENC_PREFIX.length), "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", keyBytes(key), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

function mask(secret: string): string {
  const tail = secret.slice(-4);
  return `****${tail}`;
}

export class ResourceRepo {
  private encKey?: string;

  constructor(
    private rtdb: RtdbClient,
    private path: string,
    private type: ResourceType,
    config: Partial<AppConfig>,
  ) {
    this.encKey = config.secretEncryptionKey;
  }

  private toMasked(item: ManagedResource): MaskedResource {
    const plain = decrypt(item.secret, this.encKey);
    return { ...item, secret: mask(plain), secretMasked: true };
  }

  private matches(item: ManagedResource, filter: ListFilter = {}): boolean {
    if (filter.tag && !item.tags.includes(filter.tag)) return false;
    if (filter.project && item.project !== filter.project) return false;
    if (filter.collection && item.collection !== filter.collection) return false;
    if (filter.q) {
      const q = filter.q.toLowerCase();
      if (!`${item.label} ${JSON.stringify(item.meta ?? {})}`.toLowerCase().includes(q)) return false;
    }
    return true;
  }

  async create(input: CreateInput): Promise<MaskedResource> {
    const id = generatePushKey();
    const now = Date.now();
    const item: ManagedResource = {
      id,
      type: this.type,
      label: input.label,
      secret: encrypt(input.secret, this.encKey),
      meta: input.meta,
      tags: input.tags ?? [],
      project: input.project,
      collection: input.collection,
      disabled: input.disabled,
      createdAt: now,
      updatedAt: now,
    };
    await this.rtdb.set(`${this.path}/${id}`, item);
    return this.toMasked(item);
  }

  async bulkCreate(inputs: CreateInput[]): Promise<MaskedResource[]> {
    const out: MaskedResource[] = [];
    for (const input of inputs) out.push(await this.create(input));
    return out;
  }

  async getRaw(id: string): Promise<ManagedResource | null> {
    const item = await this.rtdb.get<ManagedResource>(`${this.path}/${id}`);
    return item ? { ...item, secret: decrypt(item.secret, this.encKey) } : null;
  }

  async get(id: string): Promise<MaskedResource | null> {
    const item = await this.rtdb.get<ManagedResource>(`${this.path}/${id}`);
    return item ? this.toMasked(item) : null;
  }

  async list(filter: ListFilter = {}): Promise<MaskedResource[]> {
    const all = (await this.rtdb.get<Record<string, ManagedResource>>(this.path)) ?? {};
    return Object.values(all).filter((i) => this.matches(i, filter)).map((i) => this.toMasked(i));
  }

  async exportAll(filter: ListFilter = {}): Promise<ManagedResource[]> {
    const all = (await this.rtdb.get<Record<string, ManagedResource>>(this.path)) ?? {};
    return Object.values(all)
      .filter((i) => this.matches(i, filter))
      .map((i) => ({ ...i, secret: decrypt(i.secret, this.encKey) }));
  }

  async patch(id: string, patch: PatchInput): Promise<MaskedResource | null> {
    const existing = await this.rtdb.get<ManagedResource>(`${this.path}/${id}`);
    if (!existing) return null;
    const next: ManagedResource = {
      ...existing,
      ...patch,
      secret: patch.secret !== undefined ? encrypt(patch.secret, this.encKey) : existing.secret,
      tags: patch.tags ?? existing.tags ?? [],
      updatedAt: Date.now(),
    };
    await this.rtdb.set(`${this.path}/${id}`, next);
    return this.toMasked(next);
  }

  async remove(id: string): Promise<boolean> {
    const existing = await this.rtdb.get(`${this.path}/${id}`);
    if (!existing) return false;
    await this.rtdb.remove(`${this.path}/${id}`);
    return true;
  }
}
