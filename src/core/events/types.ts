/**
 * Event tracking — type definitions.
 *
 * Every event has a `type` (string discriminator), a `category` (selects topic),
 * an actor (the Telegram user who triggered it, if any), and a typed payload.
 */

export type EventCategory =
  | 'USER'
  | 'ADMIN'
  | 'SELLER'
  | 'PAYMENT'
  | 'ACCOUNT'
  | 'ERROR'
  | 'SYSTEM';

export interface EventActor {
  chatId: number | bigint;
  name?: string;
  username?: string | null;
}

// ── Payload definitions ─────────────────────────────────────────────

export interface UserStartCommandPayload {
  deepLinkCode?: string;
  status: 'new' | 'pending' | 'approved' | 'banned' | 'admin';
}

export interface UserRegistrationRequestedPayload {
  chatId: bigint | number;
  firstName: string;
  lastName?: string | null;
  username?: string | null;
  planGroupName: string;
  planGroupCode: string;
}

export interface UserChannelCheckFailedPayload {
  chatId: bigint | number;
  channelId: string;
}

export interface UserHomeButtonClickedPayload {
  button: string; // e.g. "buy_account", "manage_accounts", "support", ...
}

export interface AdminUserApproveClickedPayload {
  targetUserId: number;
  targetChatId: bigint | number;
}

export interface AdminUserCardToggledPayload {
  targetUserId: number;
  cardId: number;
  selectedCount: number;
}

export interface AdminUserApprovalConfirmedPayload {
  targetUserId: number;
  targetChatId: bigint | number;
  cardIds: number[];
}

export interface AdminUserRejectedPayload {
  targetUserId: number;
  targetChatId: bigint | number;
}

export interface AdminBankCardCrudPayload {
  cardId: number;
  cardNumber: string;
  holderName: string;
}

export interface AdminPlanGroupCrudPayload {
  groupId: number;
  code: string;
  name: string;
}

export interface AdminSellerCrudPayload {
  sellerId: number;
  chatId: bigint | number;
  note?: string | null;
}

export interface AdminSellerPlansChangedPayload {
  sellerId: number;
  action: 'added' | 'updated' | 'deleted';
  planName?: string;
}

export interface AdminAccountCreatedManuallyPayload {
  marzbanUsername: string;
  targetChatId: bigint | number;
  dataLimitBytes: number;
  durationDays: number;
  price: number | null;
}

export interface AdminAccountEditedPayload {
  marzbanUsername: string;
  field: string;
  newValue: string;
}

export interface AdminAccountDeletedPayload {
  marzbanUsername: string;
  accountId: number;
}

export type GroupModifyFilterKind = 'prefix' | 'seller' | 'user';

export interface AdminGroupModifyResolvedPayload {
  filterKind: GroupModifyFilterKind;
  filterValue: string;
  matchedCount: number;
}

export interface AdminGroupModifyAppliedPayload {
  filterKind: GroupModifyFilterKind;
  filterValue: string;
  selectedCount: number;
  succeeded: number;
  failed: number;
  addGb?: number;
  addDays?: number;
  status?: 'active' | 'disabled';
  resetTraffic?: boolean;
}

export interface AdminGroupModifyRetryPayload {
  failedCount: number;
  succeeded: number;
  failed: number;
}

export interface SellerAccountCreatedPayload {
  sellerId: number;
  marzbanUsername: string;
  planName?: string | null;
  dataLimitBytes: number;
  price: number;
}

export interface SellerAccountDeletedPayload {
  sellerId: number;
  marzbanUsername: string;
}

export interface SellerAccountDisabledPayload {
  sellerId: number;
  marzbanUsername: string;
}

export interface SellerReportViewedPayload {
  sellerId: number;
}

export interface PaymentTransactionCreatedPayload {
  txnId: number;
  transactionUuid: string;
  amount: number;
  method: 'premzy' | 'manual';
  type: 'buy' | 'renew';
  dataLimitBytes: number;
  durationDays: number;
}

export interface PaymentReceiptUploadedPayload {
  txnId: number;
  fileId: string;
}

export interface PaymentAdminDecisionPayload {
  txnId: number;
  transactionUuid: string;
  amount: number;
  targetChatId: bigint | number;
  type: 'buy' | 'renew';
}

export interface PaymentPremzyCheckoutCreatedPayload {
  txnId: number;
  transactionUuid: string;
  amount: number;
}

export interface PaymentPremzyCallbackReceivedPayload {
  transactionUuid: string;
  status: string;
  signatureValid: boolean;
  remoteIp?: string;
}

export interface AccountCreatedPayload {
  marzbanUsername: string;
  ownerChatId: bigint | number;
  type: 'paid' | 'test';
  dataLimitBytes: number;
  durationDays: number;
  expiresAt: Date;
  sellerId?: number | null;
  planLabel?: string;
}

export interface AccountRenewedPayload {
  marzbanUsername: string;
  oldExpiresAt: Date;
  newExpiresAt: Date;
  accumulatedBytes: number;
  newDataLimitBytes: number;
}

export interface AccountDeletedPayload {
  marzbanUsername: string;
  triggeredBy: 'user' | 'admin' | 'seller';
}

export interface AccountRenamedPayload {
  marzbanUsername: string;
  oldName?: string | null;
  newName: string;
}

export interface AccountTestProvisionedPayload {
  marzbanUsername: string;
  ownerChatId: bigint | number;
}

export interface ErrorHandlerCaughtPayload {
  message: string;
  stack?: string;
  updateType: string;
  scene?: string;
  callbackData?: string;
}

export interface ErrorMarzbanApiPayload {
  endpoint: string;
  method: string;
  status: number;
  body?: string;
}

export interface ErrorPremzySignatureInvalidPayload {
  transactionUuid?: string;
  remoteIp?: string;
}

export interface SystemBotStartedPayload {
  nodeEnv: string;
  version: string;
}

export interface SystemBotStoppingPayload {
  signal: string;
}

export interface SystemAdminBootstrappedPayload {
  adminChatId: bigint | number;
  sellerId: number;
}

// ── Discriminated union ─────────────────────────────────────────────

export type EventPayloadMap = {
  'user.start_command': UserStartCommandPayload;
  'user.registration_requested': UserRegistrationRequestedPayload;
  'user.channel_check_failed': UserChannelCheckFailedPayload;
  'user.home_button_clicked': UserHomeButtonClickedPayload;

  'admin.user_approve_clicked': AdminUserApproveClickedPayload;
  'admin.user_card_toggled': AdminUserCardToggledPayload;
  'admin.user_approval_confirmed': AdminUserApprovalConfirmedPayload;
  'admin.user_rejected': AdminUserRejectedPayload;
  'admin.bank_card_created': AdminBankCardCrudPayload;
  'admin.bank_card_updated': AdminBankCardCrudPayload;
  'admin.bank_card_deleted': AdminBankCardCrudPayload;
  'admin.plan_group_created': AdminPlanGroupCrudPayload;
  'admin.plan_group_updated': AdminPlanGroupCrudPayload;
  'admin.plan_group_deleted': AdminPlanGroupCrudPayload;
  'admin.seller_created': AdminSellerCrudPayload;
  'admin.seller_activated': AdminSellerCrudPayload;
  'admin.seller_deactivated': AdminSellerCrudPayload;
  'admin.seller_plans_changed': AdminSellerPlansChangedPayload;
  'admin.account_created_manually': AdminAccountCreatedManuallyPayload;
  'admin.account_edited': AdminAccountEditedPayload;
  'admin.account_deleted': AdminAccountDeletedPayload;
  'admin.group_modify_resolved': AdminGroupModifyResolvedPayload;
  'admin.group_modify_applied': AdminGroupModifyAppliedPayload;
  'admin.group_modify_retry': AdminGroupModifyRetryPayload;

  'seller.account_created': SellerAccountCreatedPayload;
  'seller.account_deleted': SellerAccountDeletedPayload;
  'seller.account_disabled': SellerAccountDisabledPayload;
  'seller.report_viewed': SellerReportViewedPayload;

  'payment.transaction_created': PaymentTransactionCreatedPayload;
  'payment.receipt_uploaded': PaymentReceiptUploadedPayload;
  'payment.admin_approved': PaymentAdminDecisionPayload;
  'payment.admin_rejected': PaymentAdminDecisionPayload;
  'payment.premzy_checkout_created': PaymentPremzyCheckoutCreatedPayload;
  'payment.premzy_callback_received': PaymentPremzyCallbackReceivedPayload;

  'account.created': AccountCreatedPayload;
  'account.renewed': AccountRenewedPayload;
  'account.deleted': AccountDeletedPayload;
  'account.renamed': AccountRenamedPayload;
  'account.test_provisioned': AccountTestProvisionedPayload;

  'error.handler_caught': ErrorHandlerCaughtPayload;
  'error.marzban_api': ErrorMarzbanApiPayload;
  'error.premzy_signature_invalid': ErrorPremzySignatureInvalidPayload;

  'system.bot_started': SystemBotStartedPayload;
  'system.bot_stopping': SystemBotStoppingPayload;
  'system.admin_bootstrapped': SystemAdminBootstrappedPayload;
};

export type EventType = keyof EventPayloadMap;
export type EventPayload<T extends EventType> = EventPayloadMap[T];

// ── Type → category mapping ─────────────────────────────────────────

const CATEGORY_BY_PREFIX: Record<string, EventCategory> = {
  user: 'USER',
  admin: 'ADMIN',
  seller: 'SELLER',
  payment: 'PAYMENT',
  account: 'ACCOUNT',
  error: 'ERROR',
  system: 'SYSTEM',
};

export function categoryOf(type: EventType): EventCategory {
  const prefix = type.split('.')[0];
  return CATEGORY_BY_PREFIX[prefix];
}

export const CATEGORY_EMOJI: Record<EventCategory, string> = {
  USER: '👤',
  ADMIN: '🛡️',
  SELLER: '🏷️',
  PAYMENT: '💳',
  ACCOUNT: '📦',
  ERROR: '🔥',
  SYSTEM: '⚙️',
};
