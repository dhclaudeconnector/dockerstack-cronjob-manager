/** Sample handler: purge CDN cache entries. */
export default async function cachePurge(data, ctx) {
  const keys = Array.isArray(data?.keys) ? data.keys : [];
  ctx.logger.info({ execId: ctx.execId, count: keys.length }, "cache_purge running");
  return { ok: true, purged: keys.length, keys };
}
