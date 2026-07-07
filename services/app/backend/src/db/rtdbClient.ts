/**
 * RTDB abstraction. Two implementations share this interface:
 *  - RestRtdb: talks to Firebase RTDB REST API (auth secret OR service account)
 *  - MemoryRtdb: in-process store for tests / emulator
 *
 * Paths use "/a/b/c" style. `push` generates a chronologically sortable key.
 */
export interface RtdbClient {
  get<T = unknown>(path: string): Promise<T | null>;
  set(path: string, value: unknown): Promise<void>;
  update(path: string, value: Record<string, unknown>): Promise<void>;
  remove(path: string): Promise<void>;
  push(path: string, value: unknown): Promise<string>;
  /** Watch child_added on a path. Returns an unsubscribe fn. */
  onChildAdded(
    path: string,
    cb: (key: string, value: unknown) => void,
  ): () => void;
}

let pushCounter = 0;
/** Firebase-style chronologically ordered push id (simplified but monotonic). */
export function generatePushKey(now: number = Date.now()): string {
  const PUSH_CHARS = "-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz";
  let ts = now;
  const timeChars = new Array(8);
  for (let i = 7; i >= 0; i--) {
    timeChars[i] = PUSH_CHARS.charAt(ts % 64);
    ts = Math.floor(ts / 64);
  }
  // 4-char monotonic suffix to preserve order for same-ms pushes.
  const n = pushCounter++ % (64 * 64 * 64 * 64);
  let suffix = "";
  let x = n;
  for (let i = 0; i < 4; i++) {
    suffix = PUSH_CHARS.charAt(x % 64) + suffix;
    x = Math.floor(x / 64);
  }
  return timeChars.join("") + suffix;
}

export function normalizePath(path: string): string {
  return path.replace(/^\/+/, "").replace(/\/+$/, "");
}
