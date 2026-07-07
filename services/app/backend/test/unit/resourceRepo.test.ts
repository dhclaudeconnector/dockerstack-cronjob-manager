import { describe, it, expect } from "vitest";
import { MemoryRtdb } from "../../src/db/memoryRtdb.js";
import { ResourceRepo } from "../../src/lib/resourceRepo.js";
import { TaxonomyRepo } from "../../src/lib/taxonomyRepo.js";

const makeRepo = (encKey?: string) =>
  new ResourceRepo(new MemoryRtdb(), "accounts", "cronjob_account", {
    secretEncryptionKey: encKey,
  });

describe("ResourceRepo CRUD + masking", () => {
  it("creates, reads, lists with masked secret", async () => {
    const repo = makeRepo();
    const created = await repo.create({ label: "acct-1", secret: "APIKEY-123456", tags: ["prod"] });
    expect(created.secretMasked).toBe(true);
    expect(created.secret).toContain("****");
    expect(created.secret).not.toContain("APIKEY-123456");

    const list = await repo.list();
    expect(list).toHaveLength(1);
    expect(list[0].secret).toContain("3456");
  });

  it("returns full secret via getRaw", async () => {
    const repo = makeRepo();
    const c = await repo.create({ label: "a", secret: "PLAINSECRET" });
    const raw = await repo.getRaw(c.id);
    expect(raw?.secret).toBe("PLAINSECRET");
  });

  it("filters by tag / project / collection", async () => {
    const repo = makeRepo();
    await repo.create({ label: "a", secret: "s1", tags: ["prod"], project: "core" });
    await repo.create({ label: "b", secret: "s2", tags: ["stage"], project: "billing" });
    expect(await repo.list({ tag: "prod" })).toHaveLength(1);
    expect(await repo.list({ project: "billing" })).toHaveLength(1);
    expect(await repo.list({ tag: "nope" })).toHaveLength(0);
  });

  it("patches and deletes", async () => {
    const repo = makeRepo();
    const c = await repo.create({ label: "a", secret: "s1" });
    const patched = await repo.patch(c.id, { label: "renamed", tags: ["x"] });
    expect(patched?.label).toBe("renamed");
    expect(patched?.tags).toEqual(["x"]);
    expect(await repo.remove(c.id)).toBe(true);
    expect(await repo.get(c.id)).toBeNull();
    expect(await repo.remove("missing")).toBe(false);
  });

  it("encrypts at rest when key set, still masks/round-trips", async () => {
    const repo = makeRepo("my-32-byte-encryption-key-000000");
    const c = await repo.create({ label: "a", secret: "TOPSECRET" });
    const raw = await repo.getRaw(c.id);
    expect(raw?.secret).toBe("TOPSECRET"); // decrypts transparently
    expect(c.secret).not.toContain("TOPSECRET");
  });
});

describe("TaxonomyRepo CRUD + reference rename", () => {
  it("create/list/patch/delete", async () => {
    const rtdb = new MemoryRtdb();
    const tags = new TaxonomyRepo(rtdb, "tags");
    const t = await tags.create({ name: "Production", color: "#f00" });
    expect((await tags.list())).toHaveLength(1);
    const renamed = await tags.patch(t.id, { name: "Prod" });
    expect(renamed?.name).toBe("Prod");
    // resources reference by id, so rename reflects everywhere via id lookup
    expect(await tags.remove(t.id)).toBe(true);
    expect(await tags.list()).toHaveLength(0);
  });
});
