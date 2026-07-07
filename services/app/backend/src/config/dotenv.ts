import fs from "node:fs";
import path from "node:path";

/**
 * Minimal .env loader (no dependency). Loads KEY=VALUE lines into process.env
 * without overriding already-set variables. Supports quotes and comments.
 *
 * By default it supports the one-machine deployment model: backend and frontend
 * share a single repo-root .env. Resolution order:
 *  1. explicit file argument or SHARED_ENV_FILE, if provided
 *  2. first .env found while walking from cwd up to filesystem root
 */
export function loadDotenv(file = process.env.SHARED_ENV_FILE ?? ".env"): void {
  const p = resolveEnvFile(file);
  if (!p || !fs.existsSync(p)) return;
  const content = fs.readFileSync(p, "utf8");
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      // Unquoted value: strip trailing inline comment ("  # ...") like standard
      // dotenv / env_file parsers do, so JSON-ish values don't break.
      const hashIdx = value.indexOf(" #");
      if (hashIdx !== -1) value = value.slice(0, hashIdx).trim();
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function resolveEnvFile(file: string): string | null {
  if (path.isAbsolute(file)) return file;

  // If a non-default relative path was supplied, resolve it from cwd only.
  if (file !== ".env") return path.resolve(process.cwd(), file);

  let dir = process.cwd();
  while (true) {
    const candidate = path.join(dir, ".env");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
