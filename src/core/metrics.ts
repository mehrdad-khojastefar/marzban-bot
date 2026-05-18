import http from 'node:http';
import { Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import type { Logger } from 'pino';

/**
 * Per-process Prometheus registry. Each surface (bot, sub, premzy) gets its
 * own registry by importing this module, so labels stay process-scoped.
 */
export const registry = new Registry();

collectDefaultMetrics({ register: registry });

export const prismaQueryDurationMs = new Histogram({
  name: 'prisma_query_duration_ms',
  help: 'Duration of Prisma queries in milliseconds, by model and operation',
  labelNames: ['model', 'operation'] as const,
  buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
  registers: [registry],
});

export const marzbanCallDurationMs = new Histogram({
  name: 'marzban_call_duration_ms',
  help: 'Duration of outbound Marzban API calls in milliseconds, by endpoint and status',
  labelNames: ['endpoint', 'status'] as const,
  buckets: [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
  registers: [registry],
});

export const updateDurationMs = new Histogram({
  name: 'telegram_update_duration_ms',
  help: 'Duration of Telegram update handling in milliseconds, by update_type',
  labelNames: ['update_type'] as const,
  buckets: [10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
  registers: [registry],
});

/**
 * Parse the `model:operation` shape of a Prisma `query` event target. Prisma
 * exposes the SQL but not the model/op pair on the QueryEvent itself — we
 * approximate it by snipping the `FROM "<model>"` clause out of the SQL.
 *
 * For internal Prisma calls (transactions, etc.) we fall back to 'unknown'.
 */
export function modelFromSql(sql: string): string {
  const match = sql.match(/FROM "?([A-Za-z_][A-Za-z0-9_]*)"?/);
  return match ? match[1] : 'unknown';
}

export function operationFromSql(sql: string): string {
  const trimmed = sql.trimStart().toUpperCase();
  if (trimmed.startsWith('SELECT')) return 'select';
  if (trimmed.startsWith('INSERT')) return 'insert';
  if (trimmed.startsWith('UPDATE')) return 'update';
  if (trimmed.startsWith('DELETE')) return 'delete';
  if (trimmed.startsWith('BEGIN')) return 'tx_begin';
  if (trimmed.startsWith('COMMIT')) return 'tx_commit';
  if (trimmed.startsWith('ROLLBACK')) return 'tx_rollback';
  return 'other';
}

export interface MetricsServerOptions {
  port: number;
  logger: Logger;
}

/**
 * Start a tiny HTTP server that serves `/metrics` from this process's
 * Prometheus registry. Returns the http.Server so the caller can shut it
 * down on SIGTERM.
 *
 * Bind to a private port (default 9090) — never expose this to the public
 * internet.
 */
export function startMetricsServer(opts: MetricsServerOptions): http.Server {
  const server = http.createServer(async (req, res) => {
    if (req.url !== '/metrics' || req.method !== 'GET') {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    try {
      const body = await registry.metrics();
      res.writeHead(200, { 'Content-Type': registry.contentType });
      res.end(body);
    } catch (err) {
      opts.logger.error({ err }, 'Failed to render metrics');
      res.writeHead(500);
      res.end('metrics error');
    }
  });
  server.listen(opts.port, () => {
    opts.logger.info({ port: opts.port }, 'Metrics server listening');
  });
  return server;
}
