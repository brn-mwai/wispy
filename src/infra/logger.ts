import pino from "pino";

export const logger = pino({
  transport: {
    target: "pino-pretty",
    options: { colorize: true, translateTime: "HH:MM:ss" },
  },
  level: process.env.LOG_LEVEL || "info",
});

export function createLogger(name: string) {
  return logger.child({ name });
}
