import type { RequestMethodValue, ExtendedJobData } from "../types.js";
import { REQUEST_METHODS } from "../types.js";

/**
 * Build a `curl` command that reproduces the outbound HTTP request a cron job
 * will perform. Used by the "Export as cURL" feature on the create-job screen
 * so operators can reproduce/debug the exact call outside the app.
 *
 * `maskSecrets` (default true): mask obvious secret header values
 * (authorization / token / x-api-key / *secret*). Set false only for a
 * deliberate "copy runnable command" action, and warn the user.
 */
export interface CurlInput {
  url: string;
  requestMethod?: RequestMethodValue;
  extendedData?: ExtendedJobData;
}

const SECRET_HEADER_RE = /^(authorization|proxy-authorization|x-api-key|x-api-secret|.*token.*|.*secret.*|cookie)$/i;

export function maskHeaderValue(name: string, value: string): string {
  if (!SECRET_HEADER_RE.test(name)) return value;
  // Preserve a recognizable scheme prefix (e.g. "Bearer ") then mask the token.
  const m = value.match(/^(\s*(?:Bearer|Basic|token)\s+)(.+)$/i);
  if (m) {
    const tail = m[2].slice(-4);
    return `${m[1]}****${tail}`;
  }
  const tail = value.slice(-4);
  return `****${tail}`;
}

function shellQuote(s: string): string {
  // Single-quote and escape embedded single quotes for POSIX shells.
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export function buildCurl(input: CurlInput, opts: { maskSecrets?: boolean } = {}): string {
  const maskSecrets = opts.maskSecrets ?? true;
  const method = REQUEST_METHODS[input.requestMethod ?? 0] ?? "GET";
  const parts: string[] = ["curl", "-sS", "-X", method];

  const headers = input.extendedData?.headers ?? {};
  for (const [name, rawValue] of Object.entries(headers)) {
    const value = maskSecrets ? maskHeaderValue(name, rawValue) : rawValue;
    parts.push("-H", shellQuote(`${name}: ${value}`));
  }

  const body = input.extendedData?.body;
  if (body && method !== "GET" && method !== "HEAD") {
    parts.push("--data", shellQuote(body));
  }

  parts.push(shellQuote(input.url));
  // Pretty multi-line with backslash continuations for readability.
  return parts
    .reduce<string[]>((acc, tok) => {
      if (tok === "-H" || tok === "--data") acc.push(`\n  ${tok}`);
      else if (acc.length && acc[acc.length - 1].startsWith("\n")) acc[acc.length - 1] += ` ${tok}`;
      else acc.push(tok);
      return acc;
    }, [])
    .join(" ")
    .replace(/^curl -sS -X (\w+)/, "curl -sS -X $1");
}
