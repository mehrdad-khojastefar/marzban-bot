import axios, { AxiosInstance } from 'axios';
import crypto from 'node:crypto';
import {
  CreateInvoiceRequest,
  CreateInvoiceResponse,
  PaymentStatusResponse,
} from './types';

const PROD_BASE = 'https://api.nowpayments.io/v1';
const SANDBOX_BASE = 'https://api-sandbox.nowpayments.io/v1';

export interface NowpaymentClientConfig {
  apiKey: string;
  ipnSecret: string;
  sandbox?: boolean;
  timeoutMs?: number;
}

export class NowpaymentClient {
  private readonly http: AxiosInstance;
  private readonly ipnSecret: string;

  constructor(config: NowpaymentClientConfig) {
    if (!config.apiKey) {
      throw new Error('NowpaymentClient: apiKey is required');
    }
    if (!config.ipnSecret) {
      throw new Error('NowpaymentClient: ipnSecret is required');
    }
    this.ipnSecret = config.ipnSecret;
    this.http = axios.create({
      baseURL: config.sandbox ? SANDBOX_BASE : PROD_BASE,
      timeout: config.timeoutMs ?? 15_000,
      headers: {
        'x-api-key': config.apiKey,
        'Content-Type': 'application/json',
      },
    });
  }

  async createInvoice(req: CreateInvoiceRequest): Promise<CreateInvoiceResponse> {
    const { data } = await this.http.post<CreateInvoiceResponse>('/invoice', req);
    return data;
  }

  async getPaymentStatus(paymentId: string | number): Promise<PaymentStatusResponse> {
    const { data } = await this.http.get<PaymentStatusResponse>(`/payment/${String(paymentId)}`);
    return data;
  }

  /**
   * Verify a NowPayments IPN signature.
   * The signature is HMAC-SHA512 over a JSON serialization of the payload
   * with keys sorted alphabetically (recursively for nested objects).
   * The signature arrives in the `x-nowpayments-sig` header (lowercased by Node).
   */
  verifyIpnSignature(rawBody: string, signatureHeader: string | undefined): boolean {
    if (!signatureHeader) return false;
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return false;
    }
    const sorted = stringifySorted(parsed);
    const computed = crypto
      .createHmac('sha512', this.ipnSecret)
      .update(sorted)
      .digest('hex');
    return timingSafeEqualHex(computed, signatureHeader.trim());
  }
}

/** Recursively re-serialize JSON with object keys sorted alphabetically. */
export function stringifySorted(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sortValue);
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    out[key] = sortValue((value as Record<string, unknown>)[key]);
  }
  return out;
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}
