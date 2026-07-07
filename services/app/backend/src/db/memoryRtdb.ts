import { EventEmitter } from "node:events";
import {
  type RtdbClient,
  generatePushKey,
  normalizePath,
} from "./rtdbClient.js";

/**
 * In-memory RTDB used by unit/integration tests and the emulator harness.
 * Stores a nested object tree; supports child_added subscription with backlog.
 */
export class MemoryRtdb implements RtdbClient {
  private root: Record<string, unknown> = {};
  private emitter = new EventEmitter();

  constructor(seed?: Record<string, unknown>) {
    if (seed) this.root = structuredClone(seed);
    this.emitter.setMaxListeners(100);
  }

  private resolveParent(parts: string[]): { parent: Record<string, unknown>; key: string } | null {
    let node: Record<string, unknown> = this.root;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      if (typeof node[p] !== "object" || node[p] === null) return null;
      node = node[p] as Record<string, unknown>;
    }
    return { parent: node, key: parts[parts.length - 1] };
  }

  async get<T = unknown>(path: string): Promise<T | null> {
    const p = normalizePath(path);
    if (p === "") return structuredClone(this.root) as T;
    const parts = p.split("/");
    let node: unknown = this.root;
    for (const part of parts) {
      if (typeof node !== "object" || node === null) return null;
      node = (node as Record<string, unknown>)[part];
      if (node === undefined) return null;
    }
    return structuredClone(node) as T;
  }

  private ensurePath(parts: string[]): Record<string, unknown> {
    let node: Record<string, unknown> = this.root;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      if (typeof node[p] !== "object" || node[p] === null) node[p] = {};
      node = node[p] as Record<string, unknown>;
    }
    return node;
  }

  async set(path: string, value: unknown): Promise<void> {
    const parts = normalizePath(path).split("/");
    const parent = this.ensurePath(parts);
    const key = parts[parts.length - 1];
    parent[key] = value === undefined ? null : structuredClone(value);
    this.emitter.emit(`child:${parts.slice(0, -1).join("/")}`, key, parent[key]);
  }

  async update(path: string, value: Record<string, unknown>): Promise<void> {
    const p = normalizePath(path);
    const parts = p.split("/");
    const parent = this.ensurePath([...parts, "_"]);
    const existing = (parent as Record<string, unknown>) ?? {};
    for (const [k, v] of Object.entries(value)) {
      existing[k] = structuredClone(v);
    }
  }

  async remove(path: string): Promise<void> {
    const parts = normalizePath(path).split("/");
    const ref = this.resolveParent(parts);
    if (ref) delete ref.parent[ref.key];
  }

  async push(path: string, value: unknown): Promise<string> {
    const key = generatePushKey();
    await this.set(`${normalizePath(path)}/${key}`, value);
    return key;
  }

  onChildAdded(path: string, cb: (key: string, value: unknown) => void): () => void {
    const p = normalizePath(path);
    // backlog
    void this.get<Record<string, unknown>>(p).then((existing) => {
      if (existing && typeof existing === "object") {
        for (const [k, v] of Object.entries(existing)) cb(k, v);
      }
    });
    const handler = (key: string, value: unknown) => cb(key, value);
    this.emitter.on(`child:${p}`, handler);
    return () => this.emitter.off(`child:${p}`, handler);
  }

  /** test helper */
  dump(): Record<string, unknown> {
    return structuredClone(this.root);
  }
}
