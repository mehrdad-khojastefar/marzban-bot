import { describe, it, expect, vi } from 'vitest';
import { Transaction, TransactionStatus } from '@prisma/client';
import { decideIpnOutcome, verifyIpn, isTerminalNowpaymentStatus } from '../service';
import { NowpaymentClient, stringifySorted } from '../client';
import crypto from 'node:crypto';
import { IpnPayload, NowpaymentStatus } from '../types';

function makeTxn(status: TransactionStatus): Transaction {
  return {
    id: 1,
    transaction_id: 'order-uuid',
    user_id: 1,
    plan_id: null,
    data_limit: null,
    duration_days: 30,
    amount: 100_000,
    type: 'buy',
    status,
    method: 'nowpayment',
    premzy_order_id: null,
    nowpayment_invoice_id: 'inv_1',
    nowpayment_payment_id: null,
    nowpayment_invoice_url: 'https://nowpayments.io/payment/x',
    pay_currency: null,
    usd_amount: null,
    fx_rate: null,
    fx_source: null,
    fx_fetched_at: null,
    bank_card_id: null,
    receipt_file_id: null,
    reviewed_by: null,
    account_id: null,
    error_message: null,
    created_at: new Date(),
    updated_at: new Date(),
  } as unknown as Transaction;
}

function makePayload(status: NowpaymentStatus, overrides: Partial<IpnPayload> = {}): IpnPayload {
  return {
    payment_id: 123,
    payment_status: status,
    price_amount: 10,
    price_currency: 'usd',
    order_id: 'order-uuid',
    ...overrides,
  };
}

describe('decideIpnOutcome', () => {
  it('maps waiting/confirming/sending to progress=checkout', () => {
    for (const s of ['waiting', 'confirming', 'sending'] as NowpaymentStatus[]) {
      const o = decideIpnOutcome(makeTxn('checkout'), makePayload(s));
      expect(o).toEqual({ kind: 'progress', newStatus: 'checkout' });
    }
  });

  it('maps confirmed to progress=paid', () => {
    const o = decideIpnOutcome(makeTxn('checkout'), makePayload('confirmed'));
    expect(o).toEqual({ kind: 'progress', newStatus: 'paid' });
  });

  it('maps finished to provision', () => {
    const o = decideIpnOutcome(makeTxn('checkout'), makePayload('finished'));
    expect(o).toEqual({ kind: 'provision' });
  });

  it('maps partially_paid to partial_payment', () => {
    const o = decideIpnOutcome(makeTxn('checkout'), makePayload('partially_paid'));
    expect(o).toEqual({ kind: 'partial_payment' });
  });

  it('maps expired to expired', () => {
    const o = decideIpnOutcome(makeTxn('checkout'), makePayload('expired'));
    expect(o).toEqual({ kind: 'expired' });
  });

  it('maps failed to failed', () => {
    const o = decideIpnOutcome(makeTxn('checkout'), makePayload('failed'));
    expect(o.kind).toBe('failed');
  });

  it('maps refunded to refunded', () => {
    const o = decideIpnOutcome(makeTxn('completed'), makePayload('refunded'));
    expect(o).toEqual({ kind: 'refunded' });
  });

  it('ignores any IPN once transaction is completed (except refund)', () => {
    for (const s of ['waiting', 'confirming', 'finished', 'failed'] as NowpaymentStatus[]) {
      const o = decideIpnOutcome(makeTxn('completed'), makePayload(s));
      expect(o.kind).toBe('ignored');
    }
  });

  it('ignores all IPNs while provisioning', () => {
    const o = decideIpnOutcome(makeTxn('provisioning'), makePayload('finished'));
    expect(o.kind).toBe('ignored');
  });

  it('flags late_finished when txn is expired but payment finished', () => {
    const o = decideIpnOutcome(makeTxn('expired'), makePayload('finished'));
    expect(o.kind).toBe('late_finished');
  });

  it('flags late_finished when txn is cancelled but payment finished', () => {
    const o = decideIpnOutcome(makeTxn('cancelled'), makePayload('finished'));
    expect(o.kind).toBe('late_finished');
  });

  it('flags partial_payment after expiry', () => {
    const o = decideIpnOutcome(makeTxn('expired'), makePayload('partially_paid'));
    expect(o.kind).toBe('partial_payment');
  });
});

describe('verifyIpn', () => {
  const SECRET = 'svc-test-secret';
  const client = new NowpaymentClient({ apiKey: 'k', ipnSecret: SECRET });

  it('returns null on invalid signature', () => {
    const body = JSON.stringify({ order_id: 'x', payment_status: 'finished' });
    expect(verifyIpn(client, body, 'deadbeef')).toBeNull();
  });

  it('returns parsed payload on valid signature', () => {
    const body = JSON.stringify({ order_id: 'x', payment_status: 'finished', payment_id: 1 });
    const sig = crypto.createHmac('sha512', SECRET).update(stringifySorted(JSON.parse(body))).digest('hex');
    const r = verifyIpn(client, body, sig);
    expect(r).not.toBeNull();
    expect(r?.payload.order_id).toBe('x');
  });

  it('returns null when required fields are missing even if signature is valid', () => {
    const body = JSON.stringify({ some: 'thing' });
    const sig = crypto.createHmac('sha512', SECRET).update(stringifySorted({ some: 'thing' })).digest('hex');
    expect(verifyIpn(client, body, sig)).toBeNull();
  });
});

describe('isTerminalNowpaymentStatus', () => {
  it('identifies terminal statuses', () => {
    expect(isTerminalNowpaymentStatus('finished')).toBe(true);
    expect(isTerminalNowpaymentStatus('failed')).toBe(true);
    expect(isTerminalNowpaymentStatus('expired')).toBe(true);
    expect(isTerminalNowpaymentStatus('refunded')).toBe(true);
    expect(isTerminalNowpaymentStatus('waiting')).toBe(false);
    expect(isTerminalNowpaymentStatus('confirming')).toBe(false);
    expect(isTerminalNowpaymentStatus('partially_paid')).toBe(false);
  });
});

// Silence unused warning from imports we re-export above for clarity
void vi;
