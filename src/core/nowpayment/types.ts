export type NowpaymentStatus =
  | 'waiting'
  | 'confirming'
  | 'confirmed'
  | 'sending'
  | 'partially_paid'
  | 'finished'
  | 'failed'
  | 'refunded'
  | 'expired';

export interface CreateInvoiceRequest {
  price_amount: number;
  price_currency: string;       // 'usd'
  order_id: string;             // we pass Transaction.transaction_id (UUID)
  order_description?: string;
  ipn_callback_url?: string;
  success_url?: string;
  cancel_url?: string;
  is_fee_paid_by_user?: boolean;
}

export interface CreateInvoiceResponse {
  id: string;
  order_id: string;
  order_description: string | null;
  price_amount: string;
  price_currency: string;
  pay_currency: string | null;
  ipn_callback_url: string | null;
  invoice_url: string;
  success_url: string | null;
  cancel_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface IpnPayload {
  payment_id: number | string;
  payment_status: NowpaymentStatus;
  pay_address?: string;
  price_amount: number | string;
  price_currency: string;
  pay_amount?: number | string;
  actually_paid?: number | string;
  pay_currency?: string;
  order_id: string;
  order_description?: string;
  purchase_id?: string;
  outcome_amount?: number | string;
  outcome_currency?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface PaymentStatusResponse {
  payment_id: number | string;
  payment_status: NowpaymentStatus;
  pay_address: string;
  price_amount: number | string;
  price_currency: string;
  pay_amount: number | string;
  actually_paid: number | string;
  pay_currency: string;
  order_id: string;
  order_description: string | null;
  purchase_id: string;
  created_at: string;
  updated_at: string;
  outcome_amount: number | string;
  outcome_currency: string;
}
