import { describe, it, expect } from "vitest";
import { parseImport, serializeExport, parseCsv } from "../../src/lib/importExport.js";
import type { ManagedResource } from "../../src/types.js";

describe("importExport", () => {
  it("parses valid JSON import", () => {
    const report = parseImport(
      [
        { label: "a", secret: "s1", tags: ["x"] },
        { label: "b", secret: "s2" },
      ],
      "json",
    );
    expect(report.total).toBe(2);
    expect(report.valid).toHaveLength(2);
    expect(report.errors).toHaveLength(0);
  });

  it("reports per-row errors at correct positions", () => {
    const report = parseImport(
      [
        { label: "ok", secret: "s1" },
        { label: "", secret: "s2" }, // bad label
        { label: "c", secret: "" }, // bad secret
      ],
      "json",
    );
    expect(report.valid).toHaveLength(1);
    expect(report.errors).toHaveLength(2);
    expect(report.errors[0].row).toBe(2);
    expect(report.errors[1].row).toBe(3);
  });

  it("parses CSV with quoted fields and tag delimiters", () => {
    const csv = `label,secret,tags,project\n"acct, one",KEY1,prod;core,proj-a\nacct2,KEY2,,`;
    const report = parseImport(csv, "csv");
    expect(report.valid).toHaveLength(2);
    expect(report.valid[0].label).toBe("acct, one");
    expect(report.valid[0].tags).toEqual(["prod", "core"]);
  });

  it("round-trips export → import (JSON)", () => {
    const items: ManagedResource[] = [
      {
        id: "1",
        type: "github_token",
        label: "gh-1",
        secret: "ghp_abc",
        tags: ["ci"],
        project: "core",
        createdAt: 1,
        updatedAt: 1,
      },
    ];
    const json = serializeExport(items, "json");
    const back = parseImport(json, "json");
    expect(back.valid[0].label).toBe("gh-1");
    expect(back.valid[0].secret).toBe("ghp_abc");
    expect(back.valid[0].tags).toEqual(["ci"]);
  });

  it("round-trips export → import (CSV)", () => {
    const items: ManagedResource[] = [
      { id: "1", type: "azure_pat", label: "az", secret: "pat1", tags: ["a", "b"], createdAt: 1, updatedAt: 1 },
    ];
    const csv = serializeExport(items, "csv");
    const rows = parseCsv(csv);
    expect(rows[0].label).toBe("az");
    const back = parseImport(csv, "csv");
    expect(back.valid[0].tags).toEqual(["a", "b"]);
  });
});
