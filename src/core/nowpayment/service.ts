import { PrismaClient, Transaction, TransactionStatus } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { NowpaymentClient } from './client';
import { IpnPayload, NowpaymentStatus } from './types';
import { tomanToUsd } from '../fx';

export class NowpaymentApiError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'NowpaymentApiError';
  }
}

export interface CreateInvoiceOptions {
  ipnCallbackUrl?: string;
  successUrl?: string;
  cancelUrl?: string;
  invoiceTtlMinutes?: number;
}

export interface CreateInvoiceForTransactionResult {
  invoiceId: string;
  invoiceUrl: string;
  usdAmount: number;
  tomanPerUsd: number;
  ttlMinutes: number;
}

/**
 * Convert Toman → USD via Nobitex, create a NowPayments invoice, and persist
 * the FX + invoice fields on the given transaction.
 *
 * Throws on FX or API failure; caller is responsible for marking the
 * transaction as failed and surfacing a user-friendly error.
 */
export async function createInvoiceForTransaction(
  db: PrismaClient,
  client: NowpaymentClient,
  transactionId: number,
  options: CreateInvoiceOptions,
): Promise<CreateInvoiceForTransactionResult> {
  const txn = await db.transaction.findUnique({ where: { id: transactionId } });
  if (!txn) throw new Error(`Transaction ${String(transactionId)} not found`);
  if (txn.method !== 'nowpayment') {
    throw new Error(`Transaction ${String(transactionId)} method is ${txn.method}, expected nowpayment`);
  }

  const { usd, rate } = await tomanToUsd(txn.amount);

  let invoice;
  try {
    invoice = await client.createInvoice({
      price_amount: usd,
      price_currency: 'usd',
      order_id: txn.transaction_id,
      order_description: `Order ${txn.transaction_id}`,
      ipn_callback_url: options.ipnCallbackUrl,
      success_url: options.successUrl,
      cancel_url: options.cancelUrl,
      is_fee_paid_by_user: false,
    });
  } catch (err) {
    throw new NowpaymentApiError('createInvoice failed', err);
  }

  await db.transaction.update({
    where: { id: transactionId },
    data: {
      nowpayment_invoice_id: invoice.id,
      nowpayment_invoice_url: invoice.invoice_url,
      usd_amount: new Prisma.Decimal(usd),
      fx_rate: new Prisma.Decimal(rate.tomanPerUsd),
      fx_source: rate.source,
      fx_fetched_at: rate.fetchedAt,
      status: 'checkout',
    },
  });

  return {
    invoiceId: invoice.id,
    invoiceUrl: invoice.invoice_url,
    usdAmount: usd,
    tomanPerUsd: rate.tomanPerUsd,
    ttlMinutes: options.invoiceTtlMinutes ?? 20,
  };
}

// ── IPN handling ─────────────────────────────────────────────────

export interface VerifiedIpn {
  payload: IpnPayload;
  rawBody: string;
}

export function verifyIpn(
  client: NowpaymentClient,
  rawBody: string,
  signatureHeader: string | undefined,
): VerifiedIpn | null {
  if (!client.verifyIpnSignature(rawBody, signatureHeader)) {
    return null;
  }
  try {
    const payload = JSON.parse(rawBody) as IpnPayload;
    if (!payload.order_id || !payload.payment_status) {
      return null;
    }
    return { payload, rawBody };
  } catch {
    return null;
  }
}

/**
 * Look up the transaction this IPN refers to (by NowPayments order_id,
 * which we set to Transaction.transaction_id).
 */
export async function findTransactionForIpn(
  db: PrismaClient,
  payload: IpnPayload,
): Promise<Transaction | null> {
  return db.transaction.findUnique({ where: { transaction_id: payload.order_id } });
}

export type IpnOutcome =
  | { kind: 'ignored'; reason: string }
  | { kind: 'progress'; newStatus: TransactionStatus }
  | { kind: 'provision' }
  | { kind: 'partial_payment' }
  | { kind: 'expired' }
  | { kind: 'failed'; reason: string }
  | { kind: 'refunded' }
  | { kind: 'late_finished' };

/**
 * Decide what should happen for this IPN against the current transaction state.
 * Idempotent: returns `ignored` when the status is already at/past where this
 * IPN would move it.
 */
export function decideIpnOutcome(txn: Transaction, payload: IpnPayload): IpnOutcome {
  const np = payload.payment_status;

  // Once we've fully provisioned, ignore any further IPNs (except refund).
  if (txn.status === 'completed') {
    if (np === 'refunded') return { kind: 'refunded' };
    return { kind: 'ignored', reason: `already completed; ipn=${np}` };
  }

  if (txn.status === 'provisioning') {
    return { kind: 'ignored', reason: `provisioning in progress; ipn=${np}` };
  }

  // If the transaction was expired/cancelled but the user paid afterward,
  // we still want to flag for admin and inform the user. We do NOT auto-provision.
  if (txn.status === 'expired' || txn.status === 'cancelled') {
    if (np === 'finished') return { kind: 'late_finished' };
    if (np === 'partially_paid') return { kind: 'partial_payment' };
    return { kind: 'ignored', reason: `txn ${txn.status}; ipn=${np}` };
  }

  switch (np) {
    case 'waiting':
    case 'confirming':
    case 'sending':
      return { kind: 'progress', newStatus: 'checkout' };
    case 'confirmed':
      return { kind: 'progress', newStatus: 'paid' };
    case 'finished':
      return { kind: 'provision' };
    case 'partially_paid':
      return { kind: 'partial_payment' };
    case 'expired':
      return { kind: 'expired' };
    case 'failed':
      return { kind: 'failed', reason: 'nowpayments reported failed' };
    case 'refunded':
      return { kind: 'refunded' };
    default:
      return { kind: 'ignored', reason: `unknown status: ${np as string}` };
  }
}

/**
 * Persist the payment metadata that arrives on every IPN
 * (payment_id, pay_currency) — safe to call repeatedly.
 */
export async function recordIpnMetadata(
  db: PrismaClient,
  transactionId: number,
  payload: IpnPayload,
): Promise<void> {
  await db.transaction.update({
    where: { id: transactionId },
    data: {
      nowpayment_payment_id: String(payload.payment_id),
      pay_currency: payload.pay_currency ?? undefined,
    },
  });
}

export function isTerminalNowpaymentStatus(s: NowpaymentStatus): boolean {
  return s === 'finished' || s === 'failed' || s === 'expired' || s === 'refunded';
}
