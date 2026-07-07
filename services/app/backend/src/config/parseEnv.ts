/**
 * parseEnv: universal ENV value parser with **base64 → raw fallback**.
 *
 * Strategy (spec §7.2):
 *   1. Take the raw value.
 *   2. Try base64 first (if it looks like valid base64): decode to utf8, then
 *      (optionally) JSON.parse. If that succeeds, use it.
 *   3. Fallback: use / JSON.parse the raw string directly.
 *   4. If both fail → throw with the variable name + a non-secret preview.
 *
 * This lets developers paste raw JSON locally while prod/CI use base64 that
 * survives shells / Docker without breaking.
 */

const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

function looksLikeBase64(v: string): boolean {
  const s = v.trim();
  if (s.length < 8 || s.length % 4 !== 0) return false;
  if (!BASE64_RE.test(s)) return false;
  // Heuristic: raw JSON / URLs contain chars not allowed in base64.
  if (/[{}\s:"']/.test(s)) return false;
  return true;
}

function preview(v: string): string {
  const s = String(v);
  if (s.length <= 8) return `${s.slice(0, 2)}***`;
  return `${s.slice(0, 4)}***${s.slice(-2)} (len=${s.length})`;
}

export interface ParseEnvOptions {
  /** Parse the resolved string as JSON. Default false (returns a string). */
  json?: boolean;
}

/**
 * Resolve a raw ENV value trying base64 first, then raw.
 * Returns the decoded string (json=false) or parsed object (json=true).
 */
export function parseEnvValue(
  name: string,
  raw: string | undefined,
  opts: ParseEnvOptions = {},
): unknown {
  if (raw === undefined || raw === "") {
    throw new Error(`ENV "${name}" is required but missing/empty`);
  }
  const { json = false } = opts;

  // 1 + 2: try base64 decode first.
  if (looksLikeBase64(raw)) {
    try {
      const decoded = Buffer.from(raw, "base64").toString("utf8");
      // re-encode round trip to reject "accidental" base64 that decodes to junk
      const reencoded = Buffer.from(decoded, "utf8").toString("base64");
      const normalized = raw.replace(/=+$/, "");
      const reNorm = reencoded.replace(/=+$/, "");
      if (reNorm === normalized) {
        if (json) {
          return JSON.parse(decoded);
        }
        return decoded;
      }
    } catch {
      /* fall through to raw */
    }
  }

  // 3: fallback raw.
  try {
    if (json) {
      return JSON.parse(raw);
    }
    return raw;
  } catch (err) {
    // 4: both failed.
    throw new Error(
      `ENV "${name}" could not be parsed as ${json ? "JSON" : "string"} ` +
        `(tried base64 then raw). value=${preview(raw)} — ${(err as Error).message}`,
    );
  }
}

/** Convenience: resolve a JSON ENV into a typed object. */
export function parseEnvJson<T = unknown>(name: string, raw: string | undefined): T {
  return parseEnvValue(name, raw, { json: true }) as T;
}

/** Convenience: resolve a plain string ENV (still honors base64). */
export function parseEnvString(name: string, raw: string | undefined): string {
  return parseEnvValue(name, raw, { json: false }) as string;
}

export const __internal = { looksLikeBase64, preview };
