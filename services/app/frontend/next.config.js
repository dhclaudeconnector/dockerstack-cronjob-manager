const fs = require("node:fs");
const path = require("node:path");

function loadSharedEnv(file = process.env.SHARED_ENV_FILE || ".env") {
  const envFile = resolveEnvFile(file);
  if (!envFile || !fs.existsSync(envFile)) return;
  const content = fs.readFileSync(envFile, "utf8");
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function resolveEnvFile(file) {
  if (path.isAbsolute(file)) return file;
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

loadSharedEnv();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

module.exports = nextConfig;
