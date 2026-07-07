import type { AppConfig } from "../config/env.js";
import type { RtdbClient } from "./rtdbClient.js";
import { RestRtdb } from "./restRtdb.js";
import { MemoryRtdb } from "./memoryRtdb.js";

/**
 * Factory: pick the RTDB implementation from resolved config.
 *  - mode "none" (test/dev without creds) → in-memory store
 *  - otherwise → REST client (service account or auth secret)
 */
export function createRtdb(config: AppConfig): RtdbClient {
  if (config.firebase.mode === "none") {
    return new MemoryRtdb();
  }
  return new RestRtdb(config.firebase);
}

export type { RtdbClient };
export { MemoryRtdb, RestRtdb };
