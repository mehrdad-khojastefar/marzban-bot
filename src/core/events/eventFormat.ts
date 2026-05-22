/**
 * Event formatters — pure functions that produce HTML-formatted Telegram
 * messages. One function per event type. Tested via snapshots.
 *
 * All strings are admin-internal (the log group is private to the admin), so
 * format text lives inline here rather than in the bot_messages table.
 */
import {
  CATEGORY_EMOJI,
  EventActor,
  EventPayload,
  EventPayloadMap,
  EventType,
  categoryOf,
} from './types';

const GB = 1073741824;

function htmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0B';
  if (bytes < 1024) return `${String(bytes)}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < GB) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / GB).toFixed(2)}GB`;
}

function formatPrice(toman: number): string {
  return `${toman.toLocaleString('en-US')} تومان`;
}

function formatDate(d: Date): string {
  // YYYY-MM-DD HH:mm:ss in Asia/Tehran
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

function actorLine(actor?: EventActor): string {
  if (!actor) return '';
  const safeName = htmlEscape(actor.name ?? `chat ${String(actor.chatId)}`);
  const idStr = String(actor.chatId);
  const username = actor.username ? ` @${htmlEscape(actor.username)}` : '';
  return `👤 user: <a href="tg://user?id=${idStr}">${safeName}</a> (<code>${idStr}</code>)${username}\n`;
}

function header(type: EventType, actor?: EventActor, now: Date = new Date()): string {
  const category = categoryOf(type);
  const emoji = CATEGORY_EMOJI[category];
  return (
    `${emoji} <b>${type}</b>\n` +
    actorLine(actor) +
    `🕒 ${formatDate(now)} Tehran\n\n`
  );
}

function kv(key: string, value: string | number | bigint): string {
  return `${key}: ${htmlEscape(String(value))}\n`;
}

// ── Formatters keyed by event type ──────────────────────────────────

type Formatter<T extends EventType> = (
  payload: EventPayload<T>,
  actor?: EventActor,
  now?: Date,
) => string;

type FormatterMap = { [K in EventType]: Formatter<K> };

export const formatters: FormatterMap = {
  // ── USER ──
  'user.start_command': (p, actor, now) =>
    header('user.start_command', actor, now) +
    (p.deepLinkCode ? kv('deep_link', p.deepLinkCode) : '') +
    kv('status', p.status),

  'user.registration_requested': (p, actor, now) =>
    header('user.registration_requested', actor, now) +
    kv('chat_id', String(p.chatId)) +
    kv('first_name', p.firstName) +
    (p.lastName ? kv('last_name', p.lastName) : '') +
    (p.username ? kv('username', `@${p.username}`) : '') +
    kv('plan_group', `${p.planGroupName} (${p.planGroupCode})`),

  'user.channel_check_failed': (p, actor, now) =>
    header('user.channel_check_failed', actor, now) +
    kv('chat_id', String(p.chatId)) +
    kv('channel_id', p.channelId),

  'user.home_button_clicked': (p, actor, now) =>
    header('user.home_button_clicked', actor, now) + kv('button', p.button),

  // ── ADMIN ──
  'admin.user_approve_clicked': (p, actor, now) =>
    header('admin.user_approve_clicked', actor, now) +
    kv('target_user_id', p.targetUserId) +
    kv('target_chat_id', String(p.targetChatId)),

  'admin.user_card_toggled': (p, actor, now) =>
    header('admin.user_card_toggled', actor, now) +
    kv('target_user_id', p.targetUserId) +
    kv('card_id', p.cardId) +
    kv('selected_count', p.selectedCount),

  'admin.user_approval_confirmed': (p, actor, now) =>
    header('admin.user_approval_confirmed', actor, now) +
    kv('target_user_id', p.targetUserId) +
    kv('target_chat_id', String(p.targetChatId)) +
    kv('card_ids', p.cardIds.join(', ')),

  'admin.user_rejected': (p, actor, now) =>
    header('admin.user_rejected', actor, now) +
    kv('target_user_id', p.targetUserId) +
    kv('target_chat_id', String(p.targetChatId)),

  'admin.bank_card_created': (p, actor, now) =>
    header('admin.bank_card_created', actor, now) +
    kv('card_id', p.cardId) +
    kv('card_number', p.cardNumber) +
    kv('holder_name', p.holderName),

  'admin.bank_card_updated': (p, actor, now) =>
    header('admin.bank_card_updated', actor, now) +
    kv('card_id', p.cardId) +
    kv('card_number', p.cardNumber) +
    kv('holder_name', p.holderName),

  'admin.bank_card_deleted': (p, actor, now) =>
    header('admin.bank_card_deleted', actor, now) +
    kv('card_id', p.cardId) +
    kv('card_number', p.cardNumber) +
    kv('holder_name', p.holderName),

  'admin.plan_group_created': (p, actor, now) =>
    header('admin.plan_group_created', actor, now) +
    kv('group_id', p.groupId) +
    kv('code', p.code) +
    kv('name', p.name),

  'admin.plan_group_updated': (p, actor, now) =>
    header('admin.plan_group_updated', actor, now) +
    kv('group_id', p.groupId) +
    kv('code', p.code) +
    kv('name', p.name),

  'admin.plan_group_deleted': (p, actor, now) =>
    header('admin.plan_group_deleted', actor, now) +
    kv('group_id', p.groupId) +
    kv('code', p.code) +
    kv('name', p.name),

  'admin.seller_created': (p, actor, now) =>
    header('admin.seller_created', actor, now) +
    kv('seller_id', p.sellerId) +
    kv('chat_id', String(p.chatId)) +
    (p.note ? kv('note', p.note) : ''),

  'admin.seller_activated': (p, actor, now) =>
    header('admin.seller_activated', actor, now) +
    kv('seller_id', p.sellerId) +
    kv('chat_id', String(p.chatId)),

  'admin.seller_deactivated': (p, actor, now) =>
    header('admin.seller_deactivated', actor, now) +
    kv('seller_id', p.sellerId) +
    kv('chat_id', String(p.chatId)),

  'admin.seller_plans_changed': (p, actor, now) =>
    header('admin.seller_plans_changed', actor, now) +
    kv('seller_id', p.sellerId) +
    kv('action', p.action) +
    (p.planName ? kv('plan_name', p.planName) : ''),

  'admin.account_created_manually': (p, actor, now) =>
    header('admin.account_created_manually', actor, now) +
    kv('marzban_username', p.marzbanUsername) +
    kv('target_chat_id', String(p.targetChatId)) +
    kv('data_limit', formatBytes(p.dataLimitBytes)) +
    kv('duration_days', p.durationDays) +
    (p.price !== null ? kv('price', formatPrice(p.price)) : ''),

  'admin.account_edited': (p, actor, now) =>
    header('admin.account_edited', actor, now) +
    kv('marzban_username', p.marzbanUsername) +
    kv('field', p.field) +
    kv('new_value', p.newValue),

  'admin.account_deleted': (p, actor, now) =>
    header('admin.account_deleted', actor, now) +
    kv('marzban_username', p.marzbanUsername) +
    kv('account_id', p.accountId),

  'admin.group_modify_resolved': (p, actor, now) =>
    header('admin.group_modify_resolved', actor, now) +
    kv('filter_kind', p.filterKind) +
    kv('filter_value', p.filterValue) +
    kv('matched_count', p.matchedCount),

  'admin.group_modify_applied': (p, actor, now) => {
    const ops: string[] = [];
    if (p.addGb !== undefined) ops.push(`gb=${p.addGb > 0 ? '+' : ''}${String(p.addGb)}`);
    if (p.addDays !== undefined)
      ops.push(`days=${p.addDays > 0 ? '+' : ''}${String(p.addDays)}`);
    if (p.status !== undefined) ops.push(`status=${p.status}`);
    if (p.resetTraffic) ops.push('reset_traffic');
    return (
      header('admin.group_modify_applied', actor, now) +
      kv('filter_kind', p.filterKind) +
      kv('filter_value', p.filterValue) +
      kv('selected_count', p.selectedCount) +
      kv('succeeded', p.succeeded) +
      kv('failed', p.failed) +
      kv('ops', ops.length > 0 ? ops.join(', ') : '—')
    );
  },

  'admin.group_modify_retry': (p, actor, now) =>
    header('admin.group_modify_retry', actor, now) +
    kv('failed_count', p.failedCount) +
    kv('succeeded', p.succeeded) +
    kv('failed', p.failed),

  // ── SELLER ──
  'seller.account_created': (p, actor, now) =>
    header('seller.account_created', actor, now) +
    kv('seller_id', p.sellerId) +
    kv('marzban_username', p.marzbanUsername) +
    (p.planName ? kv('plan_name', p.planName) : '') +
    kv('data_limit', formatBytes(p.dataLimitBytes)) +
    kv('price', formatPrice(p.price)),

  'seller.account_deleted': (p, actor, now) =>
    header('seller.account_deleted', actor, now) +
    kv('seller_id', p.sellerId) +
    kv('marzban_username', p.marzbanUsername),

  'seller.account_disabled': (p, actor, now) =>
    header('seller.account_disabled', actor, now) +
    kv('seller_id', p.sellerId) +
    kv('marzban_username', p.marzbanUsername),

  'seller.report_viewed': (p, actor, now) =>
    header('seller.report_viewed', actor, now) + kv('seller_id', p.sellerId),

  // ── PAYMENT ──
  'payment.transaction_created': (p, actor, now) =>
    header('payment.transaction_created', actor, now) +
    kv('txn_id', p.txnId) +
    kv('uuid', p.transactionUuid) +
    kv('type', p.type) +
    kv('method', p.method) +
    kv('amount', formatPrice(p.amount)) +
    kv('data_limit', formatBytes(p.dataLimitBytes)) +
    kv('duration_days', p.durationDays),

  'payment.receipt_uploaded': (p, actor, now) =>
    header('payment.receipt_uploaded', actor, now) +
    kv('txn_id', p.txnId) +
    kv('file_id', p.fileId),

  'payment.admin_approved': (p, actor, now) =>
    header('payment.admin_approved', actor, now) +
    kv('txn_id', p.txnId) +
    kv('uuid', p.transactionUuid) +
    kv('type', p.type) +
    kv('amount', formatPrice(p.amount)) +
    kv('target_chat_id', String(p.targetChatId)),

  'payment.admin_rejected': (p, actor, now) =>
    header('payment.admin_rejected', actor, now) +
    kv('txn_id', p.txnId) +
    kv('uuid', p.transactionUuid) +
    kv('type', p.type) +
    kv('amount', formatPrice(p.amount)) +
    kv('target_chat_id', String(p.targetChatId)),

  'payment.premzy_checkout_created': (p, actor, now) =>
    header('payment.premzy_checkout_created', actor, now) +
    kv('txn_id', p.txnId) +
    kv('uuid', p.transactionUuid) +
    kv('amount', formatPrice(p.amount)),

  'payment.premzy_callback_received': (p, actor, now) =>
    header('payment.premzy_callback_received', actor, now) +
    kv('uuid', p.transactionUuid) +
    kv('status', p.status) +
    kv('signature_valid', p.signatureValid ? 'yes' : 'no') +
    (p.remoteIp ? kv('remote_ip', p.remoteIp) : ''),

  // ── ACCOUNT ──
  'account.created': (p, actor, now) =>
    header('account.created', actor, now) +
    kv('marzban_username', p.marzbanUsername) +
    kv('owner_chat_id', String(p.ownerChatId)) +
    kv('type', p.type) +
    kv('data_limit', formatBytes(p.dataLimitBytes)) +
    kv('duration_days', p.durationDays) +
    kv('expires_at', formatDate(p.expiresAt)) +
    (p.sellerId ? kv('seller_id', p.sellerId) : '') +
    (p.planLabel ? kv('plan', p.planLabel) : ''),

  'account.renewed': (p, actor, now) =>
    header('account.renewed', actor, now) +
    kv('marzban_username', p.marzbanUsername) +
    kv('old_expiry', formatDate(p.oldExpiresAt)) +
    kv('new_expiry', formatDate(p.newExpiresAt)) +
    kv('added', formatBytes(p.accumulatedBytes)) +
    kv('new_data_limit', formatBytes(p.newDataLimitBytes)),

  'account.deleted': (p, actor, now) =>
    header('account.deleted', actor, now) +
    kv('marzban_username', p.marzbanUsername) +
    kv('triggered_by', p.triggeredBy),

  'account.renamed': (p, actor, now) =>
    header('account.renamed', actor, now) +
    kv('marzban_username', p.marzbanUsername) +
    kv('old_name', p.oldName ?? '—') +
    kv('new_name', p.newName),

  'account.test_provisioned': (p, actor, now) =>
    header('account.test_provisioned', actor, now) +
    kv('marzban_username', p.marzbanUsername) +
    kv('owner_chat_id', String(p.ownerChatId)),

  // ── ERROR ──
  'error.handler_caught': (p, actor, now) => {
    const stack = p.stack ? `\nstack:\n<pre>${htmlEscape(p.stack.slice(0, 800))}</pre>` : '';
    return (
      header('error.handler_caught', actor, now) +
      kv('update_type', p.updateType) +
      (p.scene ? kv('scene', p.scene) : '') +
      (p.callbackData ? kv('callback_data', p.callbackData) : '') +
      kv('message', p.message) +
      stack
    );
  },

  'error.marzban_api': (p, actor, now) =>
    header('error.marzban_api', actor, now) +
    kv('method', p.method) +
    kv('endpoint', p.endpoint) +
    kv('status', p.status) +
    (p.body ? `body:\n<pre>${htmlEscape(p.body.slice(0, 500))}</pre>\n` : ''),

  'error.premzy_signature_invalid': (p, actor, now) =>
    header('error.premzy_signature_invalid', actor, now) +
    (p.transactionUuid ? kv('uuid', p.transactionUuid) : '') +
    (p.remoteIp ? kv('remote_ip', p.remoteIp) : ''),

  // ── SYSTEM ──
  'system.bot_started': (p, actor, now) =>
    header('system.bot_started', actor, now) +
    kv('version', p.version) +
    kv('node_env', p.nodeEnv),

  'system.bot_stopping': (p, actor, now) =>
    header('system.bot_stopping', actor, now) + kv('signal', p.signal),

  'system.admin_bootstrapped': (p, actor, now) =>
    header('system.admin_bootstrapped', actor, now) +
    kv('admin_chat_id', String(p.adminChatId)) +
    kv('seller_id', p.sellerId),
};

export function formatEvent<T extends EventType>(
  type: T,
  payload: EventPayloadMap[T],
  actor?: EventActor,
  now: Date = new Date(),
): string {
  const formatter = formatters[type];
  return formatter(payload, actor, now);
}
