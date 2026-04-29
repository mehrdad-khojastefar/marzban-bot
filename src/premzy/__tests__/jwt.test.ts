import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import { initPremzyJwt, buildCheckoutUrl } from '../jwt';

const KEYS_DIR = path.resolve(__dirname, '../../../.test-keys');
const PRIVATE_KEY_PATH = path.join(KEYS_DIR, 'private.pem');
const PUBLIC_KEY_PATH = path.join(KEYS_DIR, 'public.pem');

beforeAll(() => {
  fs.mkdirSync(KEYS_DIR, { recursive: true });
  execSync(
    `openssl ecparam -name prime256v1 -genkey -noout -out ${PRIVATE_KEY_PATH} && openssl ec -in ${PRIVATE_KEY_PATH} -pubout -out ${PUBLIC_KEY_PATH}`,
  );
  initPremzyJwt({ vendorId: 'test-vendor-id', privateKeyPath: PRIVATE_KEY_PATH });
});

describe('buildCheckoutUrl', () => {
  it('returns a valid premzy checkout URL', () => {
    const url = buildCheckoutUrl(300_000, 'tx-123');
    expect(url).toMatch(/^https:\/\/premzy\.pro\/checkout\?jwt=.+$/);
  });

  it('produces a JWT verifiable with the public key', () => {
    const url = buildCheckoutUrl(300_000, 'tx-456');
    const token = url.split('jwt=')[1];
    const publicKey = fs.readFileSync(PUBLIC_KEY_PATH, 'utf-8');
    const payload = jwt.verify(token, publicKey, { algorithms: ['ES256'] }) as Record<string, unknown>;

    expect(payload.vendor_id).toBe('test-vendor-id');
    expect(payload.toman_amount).toBe(300_000);
    expect(payload.transaction_id).toBe('tx-456');
    expect(payload.iat).toBeTypeOf('number');
  });

  it('generates unique tokens for different transaction IDs', () => {
    const url1 = buildCheckoutUrl(300_000, 'tx-a');
    const url2 = buildCheckoutUrl(300_000, 'tx-b');
    expect(url1).not.toBe(url2);
  });
});
