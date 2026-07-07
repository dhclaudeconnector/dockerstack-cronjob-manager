import { describe, it, expect } from "vitest";
import { parseEnvValue, parseEnvJson, parseEnvString, __internal } from "../../src/config/parseEnv.js";

describe("parseEnv (base64 → raw fallback)", () => {
  it("parses valid raw JSON", () => {
    const v = parseEnvJson<{ a: number }>("X", '{"a":1}');
    expect(v).toEqual({ a: 1 });
  });

  it("parses valid base64 JSON", () => {
    const b64 = Buffer.from('{"a":2}', "utf8").toString("base64");
    const v = parseEnvJson<{ a: number }>("X", b64);
    expect(v).toEqual({ a: 2 });
  });

  it("recovers JSON broken by shell quote stripping via base64", () => {
    // raw string is not valid JSON, but its base64 decodes to valid JSON
    const original = '{"key":"value with spaces"}';
    const b64 = Buffer.from(original, "utf8").toString("base64");
    expect(parseEnvJson("X", b64)).toEqual({ key: "value with spaces" });
  });

  it("throws with variable name for garbage that is neither base64 JSON nor raw JSON", () => {
    expect(() => parseEnvJson("MY_VAR", "{not: valid, json")).toThrow(/MY_VAR/);
  });

  it("throws when missing/empty", () => {
    expect(() => parseEnvValue("EMPTY", "")).toThrow(/required/);
    expect(() => parseEnvValue("EMPTY", undefined)).toThrow(/required/);
  });

  it("returns plain string for string mode (base64 honored)", () => {
    const b64 = Buffer.from("hello-world-secret", "utf8").toString("base64");
    expect(parseEnvString("S", b64)).toBe("hello-world-secret");
  });

  it("keeps raw string when it is not base64", () => {
    expect(parseEnvString("S", "https://db.firebaseio.com")).toBe("https://db.firebaseio.com");
  });

  it("looksLikeBase64 rejects JSON-ish and URL-ish strings", () => {
    expect(__internal.looksLikeBase64('{"a":1}')).toBe(false);
    expect(__internal.looksLikeBase64("https://x.com")).toBe(false);
    expect(__internal.looksLikeBase64(Buffer.from("abcdefgh").toString("base64"))).toBe(true);
  });

  it("preview never leaks full secret", () => {
    const p = __internal.preview("supersecretlongvalue");
    expect(p).not.toContain("supersecretlongvalue");
    expect(p).toContain("***");
  });
});
