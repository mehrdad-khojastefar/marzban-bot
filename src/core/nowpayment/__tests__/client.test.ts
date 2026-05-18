import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { NowpaymentClient, stringifySorted } from '../client';

const SECRET = 'test-ipn-secret-do-not-use';

function signBody(body: string, secret: string = SECRET): string {
  return crypto.createHmac('sha512', secret).update(body).digest('hex');
}

function makeClient(secret = SECRET) {
  return new NowpaymentClient({
    apiKey: 'test-api-key',
    ipnSecret: secret,
  });
}

describe('stringifySorted', () => {
  it('sorts top-level keys alphabetically', () => {
    expect(stringifySorted({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it('sorts nested object keys recursively', () => {
    const input = { z: { b: 1, a: 2 }, a: [{ y: 1, x: 2 }] };
    expect(stringifySorted(input)).toBe('{"a":[{"x":2,"y":1}],"z":{"a":2,"b":1}}');
  });

  it('preserves array element order', () => {
    expect(stringifySorted({ items: [3, 1, 2] })).toBe('{"items":[3,1,2]}');
  });
});

describe('NowpaymentClient.verifyIpnSignature', () => {
  const samplePayload = {
    payment_id: 5524759814,
    payment_status: 'finished',
    pay_address: 'TZx',
    price_amount: 10,
    price_currency: 'usd',
    pay_amount: 9.92,
    actually_paid: 9.92,
    pay_currency: 'usdttrc20',
    order_id: 'abc-uuid',
  };

  it('accepts a valid signature over sorted-keys JSON', () => {
    const client = makeClient();
    const sorted = stringifySorted(samplePayload);
    const sig = signBody(sorted);
    // The body NowPayments sends is *some* JSON of the same object;
    // verifier must re-canonicalize before hashing.
    const arbitraryBody = JSON.stringify(samplePayload);
    expect(client.verifyIpnSignature(arbitraryBody, sig)).toBe(true);
  });

  it('rejects a tampered body', () => {
    const client = makeClient();
    const sorted = stringifySorted(samplePayload);
    const sig = signBody(sorted);
    const tampered = JSON.stringify({ ...samplePayload, actually_paid: 0.01 });
    expect(client.verifyIpnSignature(tampered, sig)).toBe(false);
  });

  it('rejects a missing signature header', () => {
    const client = makeClient();
    expect(client.verifyIpnSignature(JSON.stringify(samplePayload), undefined)).toBe(false);
  });

  it('rejects when signed with the wrong secret', () => {
    const client = makeClient();
    const sorted = stringifySorted(samplePayload);
    const sig = signBody(sorted, 'wrong-secret');
    expect(client.verifyIpnSignature(JSON.stringify(samplePayload), sig)).toBe(false);
  });

  it('rejects malformed JSON', () => {
    const client = makeClient();
    expect(client.verifyIpnSignature('not json', 'a'.repeat(128))).toBe(false);
  });
});

describe('NowpaymentClient construction', () => {
  it('requires apiKey', () => {
    expect(() => new NowpaymentClient({ apiKey: '', ipnSecret: 'x' })).toThrow(/apiKey/);
  });
  it('requires ipnSecret', () => {
    expect(() => new NowpaymentClient({ apiKey: 'x', ipnSecret: '' })).toThrow(/ipnSecret/);
  });
});
