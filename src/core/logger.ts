import pino, { Logger, LoggerOptions } from 'pino';

/**
 * Build a pino logger configured for this app. Honours `LOG_LEVEL` (default
 * `info`). Always emits JSON — pipe through `pino-pretty` locally if you
 * want a pretty console view.
 *
 * Each surface (bot, sub, premzy) should call `createLogger({ source: '...' })`
 * once at process startup. Use child loggers for per-update / per-request
 * context (e.g. `logger.child({ requestId, userId })`).
 */
export function createLogger(opts: { source: string }): Logger {
  const level = process.env.LOG_LEVEL ?? 'info';

  const config: LoggerOptions = {
    level,
    base: { source: opts.source },
    redact: {
      // Defensive: never leak the bot token, Marzban password, or the
      // Premzy vendor token even if a careless caller logs an env object.
      paths: [
        'token',
        'access_token',
        'password',
        'authorization',
        'TELEGRAM_BOT_TOKEN',
        'MARZBAN_PASSWORD',
        'PREMZY_VENDOR_TOKEN',
        '*.token',
        '*.access_token',
        '*.password',
        '*.authorization',
      ],
      censor: '[REDACTED]',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  return pino(config);
}

/**
 * Generate a short opaque request id (16 hex chars). Cheap, collision-safe
 * within a single process for the kind of throughput we expect.
 */
export function generateRequestId(): string {
  return (
    Math.random().toString(16).slice(2, 10) +
    Math.random().toString(16).slice(2, 10)
  );
}
