import type { EventActor } from './types';

export { logEvent, setBotInstance, resetEventLoggerForTests } from './eventLogger';
export { formatEvent, formatters } from './eventFormat';
export type {
  EventActor,
  EventCategory,
  EventType,
  EventPayload,
  EventPayloadMap,
} from './types';
export { categoryOf, CATEGORY_EMOJI } from './types';

/** Build an EventActor from a Telegram `from` user object. */
export function actorFrom(
  from:
    | { id: number; first_name?: string; last_name?: string; username?: string }
    | undefined,
): EventActor | undefined {
  if (!from) return undefined;
  const name = [from.first_name, from.last_name].filter(Boolean).join(' ') || undefined;
  return {
    chatId: from.id,
    name,
    username: from.username ?? null,
  };
}
