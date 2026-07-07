import { describe, it, expect } from "vitest";
import { loadConfig } from "../../src/config/env.js";

const base = {
  API_SECRET: "s3cr3t",
  FIREBASE_DB_URL: "https://demo.firebaseio.com",
} as NodeJS.ProcessEnv;

describe("RTDB auth resolver", () => {
  it("uses service account when provided (preferred)", () => {
    const sa = {
      project_id: "p",
      client_email: "svc@p.iam",
      private_key: "-----BEGIN PRIVATE KEY-----\nx\n-----END PRIVATE KEY-----\n",
    };
    const cfg = loadConfig(
      {
        ...base,
        FIREBASE_SERVICE_ACCOUNT: JSON.stringify(sa),
        FIREBASE_AUTH_SECRET: "legacy",
      },
      { allowNone: false },
    );
    expect(cfg.firebase.mode).toBe("service_account");
    expect(cfg.firebase.serviceAccount?.project_id).toBe("p");
  });

  it("falls back to auth secret when no service account", () => {
    const cfg = loadConfig(
      { ...base, FIREBASE_AUTH_SECRET: "legacy" },
      { allowNone: false },
    );
    expect(cfg.firebase.mode).toBe("auth_secret");
    expect(cfg.firebase.authSecret).toBe("legacy");
  });

  it("fails fast when both auth methods missing", () => {
    expect(() => loadConfig(base, { allowNone: false })).toThrow(/Firebase auth missing/);
  });

  it("requires API_SECRET", () => {
    expect(() =>
      loadConfig({ FIREBASE_DB_URL: "x", FIREBASE_AUTH_SECRET: "y" }, { allowNone: false }),
    ).toThrow(/API_SECRET/);
  });

  it("accepts base64 service account JSON", () => {
    const sa = { project_id: "p2", client_email: "e", private_key: "k" };
    const b64 = Buffer.from(JSON.stringify(sa), "utf8").toString("base64");
    const cfg = loadConfig(
      { ...base, FIREBASE_SERVICE_ACCOUNT: b64 },
      { allowNone: false },
    );
    expect(cfg.firebase.serviceAccount?.project_id).toBe("p2");
  });

  it("test mode allows none (in-memory)", () => {
    const cfg = loadConfig({ API_SECRET: "x", FIREBASE_DB_URL: "x" }, { allowNone: true });
    expect(cfg.firebase.mode).toBe("none");
  });
});
