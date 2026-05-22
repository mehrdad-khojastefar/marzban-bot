/**
 * pg_dump pipeline.
 *
 * Spawns `pg_dump`, streams its stdout through gzip + sha256, writes the
 * gzipped dump to disk, and resolves with file size, hex digest, and
 * elapsed milliseconds.
 *
 * The spawner is injected so tests can substitute a fake child process
 * without going near a real Postgres.
 */
import { spawn } from 'node:child_process';
import type { EventEmitter } from 'node:events';
import { createWriteStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { PassThrough, pipeline, type Readable } from 'node:stream';
import { promisify } from 'node:util';
import { createGzip } from 'node:zlib';

const pipelineAsync = promisify(pipeline);

/**
 * Minimal structural view of a `pg_dump` child process — enough to read
 * the dump from stdout, capture stderr, and observe exit. Modelled this
 * way so tests can pass plain EventEmitters with PassThrough streams
 * without depending on the full child_process type.
 */
export interface DumpChild extends EventEmitter {
  stdout: Readable;
  stderr: Readable;
  exitCode: number | null;
  kill(signal?: NodeJS.Signals | number): boolean;
}

export interface DumpResult {
  sizeBytes: number;
  sha256: string;
  durationMs: number;
}

export class DumpError extends Error {
  constructor(
    public readonly stage: 'pg_dump' | 'gzip',
    message: string,
  ) {
    super(message);
    this.name = 'DumpError';
  }
}

export type Spawner = (command: string, args: string[]) => DumpChild;

const defaultSpawner: Spawner = (cmd, args) =>
  spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] }) as unknown as DumpChild;

export interface RunDumpOptions {
  connectionString: string;
  outPath: string;
  spawner?: Spawner;
}

export async function runDump({
  connectionString,
  outPath,
  spawner = defaultSpawner,
}: RunDumpOptions): Promise<DumpResult> {
  const started = Date.now();
  const child = spawner('pg_dump', [
    '--no-owner',
    '--no-privileges',
    '--clean',
    '--if-exists',
    connectionString,
  ]);

  // Capture last ~4 KB of stderr for diagnostics.
  let stderrTail = '';
  child.stderr.on('data', (chunk: Buffer) => {
    stderrTail = (stderrTail + chunk.toString('utf8')).slice(-4096);
  });

  const exitPromise: Promise<number> = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
  });

  const hash = createHash('sha256');
  const hashTap = new PassThrough();
  hashTap.on('data', (chunk: Buffer) => hash.update(chunk));

  try {
    await pipelineAsync(child.stdout, createGzip(), hashTap, createWriteStream(outPath));
  } catch (err) {
    // Kill pg_dump if it's still running.
    if (child.exitCode === null) child.kill('SIGTERM');
    throw new DumpError('gzip', (err as Error).message);
  }

  const exitCode = await exitPromise;
  if (exitCode !== 0) {
    throw new DumpError(
      'pg_dump',
      stderrTail.trim() || `pg_dump exited with code ${String(exitCode)}`,
    );
  }

  const { size } = await stat(outPath);

  return {
    sizeBytes: size,
    sha256: hash.digest('hex'),
    durationMs: Date.now() - started,
  };
}
