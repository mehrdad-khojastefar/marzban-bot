import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter, PassThrough } from 'node:stream';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { createGunzip } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runDump, DumpError } from '../dump';

type FakeChild = EventEmitter & {
  stdout: PassThrough;
  stderr: PassThrough;
  exitCode: number | null;
  kill: ReturnType<typeof vi.fn>;
};

function makeChild(): FakeChild {
  const emitter = new EventEmitter() as FakeChild;
  emitter.stdout = new PassThrough();
  emitter.stderr = new PassThrough();
  emitter.exitCode = null;
  emitter.kill = vi.fn();
  return emitter;
}

async function readGunzipped(path: string): Promise<string> {
  const buf = await readFile(path);
  return await new Promise<string>((resolve, reject) => {
    const gz = createGunzip();
    const chunks: Buffer[] = [];
    gz.on('data', (c: Buffer) => chunks.push(c));
    gz.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    gz.on('error', reject);
    gz.end(buf);
  });
}

describe('runDump', () => {
  let dir: string;
  let outPath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'dump-test-'));
    outPath = join(dir, 'out.sql.gz');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('gzips pg_dump output, computes sha256, and reports size + duration', async () => {
    const child = makeChild();
    const spawner = vi.fn(() => child);

    const sqlPayload = 'CREATE TABLE x (id int);\nINSERT INTO x VALUES (1);\n';

    const dumpPromise = runDump({
      connectionString: 'postgresql://test',
      outPath,
      spawner: spawner as never,
    });

    // Feed payload, close stream, exit cleanly.
    child.stdout.end(sqlPayload);
    setImmediate(() => {
      child.exitCode = 0;
      child.emit('exit', 0);
    });

    const result = await dumpPromise;

    expect(spawner).toHaveBeenCalledWith('pg_dump', [
      '--no-owner',
      '--no-privileges',
      '--clean',
      '--if-exists',
      'postgresql://test',
    ]);
    const decoded = await readGunzipped(outPath);
    expect(decoded).toBe(sqlPayload);

    const { size } = await stat(outPath);
    expect(result.sizeBytes).toBe(size);
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('throws DumpError(stage=pg_dump) and includes stderr tail on non-zero exit', async () => {
    const child = makeChild();
    const spawner = vi.fn(() => child);

    const dumpPromise = runDump({
      connectionString: 'postgresql://bad',
      outPath,
      spawner: spawner as never,
    });

    child.stderr.write('FATAL: connection refused\n');
    child.stdout.end();
    setImmediate(() => {
      child.exitCode = 1;
      child.emit('exit', 1);
    });

    await expect(dumpPromise).rejects.toMatchObject({
      name: 'DumpError',
      stage: 'pg_dump',
      message: expect.stringContaining('connection refused'),
    });
  });

  it('wraps stream pipeline failures as DumpError(stage=gzip)', async () => {
    const child = makeChild();
    const spawner = vi.fn(() => child);

    const dumpPromise = runDump({
      connectionString: 'postgresql://test',
      outPath,
      spawner: spawner as never,
    });

    // Destroy stdout with an error to trip the pipeline.
    setImmediate(() => {
      child.stdout.destroy(new Error('pipe broken'));
    });

    await expect(dumpPromise).rejects.toBeInstanceOf(DumpError);
    await expect(dumpPromise).rejects.toMatchObject({ stage: 'gzip' });
  });
});
