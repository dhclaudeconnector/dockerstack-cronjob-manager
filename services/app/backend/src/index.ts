import { loadDotenv } from "./config/dotenv.js";
import { loadConfig } from "./config/env.js";
import { createLogger } from "./logger.js";
import { buildContainer } from "./container.js";
import { buildServer } from "./server.js";

/**
 * Bootstrap: load config (fail-fast), build container, start API server AND the
 * RTDB queue consumer in the same process (spec §12). Consumer can be split out
 * later if load requires it.
 */
async function main() {
  loadDotenv();
  const config = loadConfig();
  const logger = createLogger(config);
  const container = buildContainer(config, logger);

  // Start queue consumer (durable, resumes dangling jobs on boot).
  await container.queue.start();

  const app = buildServer(container);
  try {
    await app.listen({ port: config.port, host: "0.0.0.0" });
    logger.info({ port: config.port, rtdb: config.firebase.mode }, "cronjob-manager started");
  } catch (err) {
    logger.error({ err }, "failed to start");
    process.exit(1);
  }

  const shutdown = async () => {
    logger.info("shutting down...");
    container.queue.stop();
    await app.close();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("fatal:", err);
  process.exit(1);
});
