/**
 * Event logger — fire-and-forget Telegram log sink.
 *
 * Contract:
 *  - logEvent(...) never throws. It schedules an async send and returns void.
 *  - If the bot instance has not been wired (very early startup), the call
 *    falls back to console.warn and returns.
 *  - If `events_enabled` setting is not "true", calls are no-ops.
 *  - Telegram send failures are caught and logged via console.error — they
 *    must never break a user flow.
 */
import type { Telegram } from 'telegraf';
import { loadEnv } from '../utils/config';
import { getSetting } from '../../bot/services/settingService';
import { formatEvent } from './eventFormat';
import {
  EventActor,
  EventCategory,
  EventPayloadMap,
  EventType,
  categoryOf,
} from './types';

let telegramApi: Telegram | null = null;

export function setBotInstance(bot: { telegram: Telegram }): void {
  telegramApi = bot.telegram;
}

/**
 * For tests only — reset the wired bot instance.
 */
export function resetEventLoggerForTests(): void {
  telegramApi = null;
}

function topicIdForCategory(category: EventCategory): number {
  const env = loadEnv();
  switch (category) {
    case 'USER':
      return env.LOG_TOPIC_USERS;
    case 'ADMIN':
      return env.LOG_TOPIC_ADMIN;
    case 'SELLER':
      return env.LOG_TOPIC_SELLER;
    case 'PAYMENT':
      return env.LOG_TOPIC_PAYMENTS;
    case 'ACCOUNT':
      return env.LOG_TOPIC_ACCOUNTS;
    case 'ERROR':
      return env.LOG_TOPIC_ERRORS;
    case 'SYSTEM':
      return env.LOG_TOPIC_SYSTEM;
  }
}

async function sendInternal<T extends EventType>(
  type: T,
  payload: EventPayloadMap[T],
  actor: EventActor | undefined,
): Promise<void> {
  if (!telegramApi) {
    console.warn(`[eventLogger] not wired — dropping event ${type}`);
    return;
  }

  const enabled = await getSetting('events_enabled');
  if (enabled !== 'true') return;

  const env = loadEnv();
  const category = categoryOf(type);
  const topicId = topicIdForCategory(category);
  const text = formatEvent(type, payload, actor);

  await telegramApi.sendMessage(env.LOG_GROUP_ID, text, {
    parse_mode: 'HTML',
    message_thread_id: topicId,
    link_preview_options: { is_disabled: true },
  });
}

/**
 * Fire-and-forget event log. Never throws.
 */
export function logEvent<T extends EventType>(
  type: T,
  payload: EventPayloadMap[T],
  actor?: EventActor,
): void {
  void sendInternal(type, payload, actor).catch((err) => {
    console.error(`[eventLogger] failed to send ${type}:`, err);
  });
}
