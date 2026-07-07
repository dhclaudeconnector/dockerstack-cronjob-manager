/**
 * Sample handler (.mjs). Executor imports the default export and calls it with
 * the HTTP request body as `data`. Returns any JSON-serializable result.
 *
 *   POST /api/exec/file/data_sync   { "region": "us-east-1", "batch": 500 }
 */
export default async function dataSync(data, ctx) {
  const { region = "unknown", batch = 100 } = data ?? {};
  ctx.logger.info({ execId: ctx.execId, region, batch }, "data_sync running");
  // Simulate some async work.
  await new Promise((r) => setTimeout(r, 20));
  return {
    ok: true,
    region,
    synced: batch,
    at: new Date().toISOString(),
  };
}
