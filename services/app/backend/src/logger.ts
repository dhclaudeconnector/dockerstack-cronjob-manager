import { pino, type Logger } from "pino";
import type { AppConfig } from "./config/env.js";

export function createLogger(config: Pick<AppConfig, "logLevel" | "logFormat">): Logger {
  if (config.logFormat === "pretty") {
    return pino({
      level: config.logLevel,
      transport: {
        target: "pino-pretty",
        options: { colorize: true, translateTime: "SYS:HH:MM:ss.l", ignore: "pid,hostname" },
      },
    });
  }
  return pino({ level: config.logLevel });
}

export type { Logger };
