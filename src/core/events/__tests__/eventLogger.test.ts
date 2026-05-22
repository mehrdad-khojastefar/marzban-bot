import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { logEvent, setBotInstance, resetEventLoggerForTests } from '../eventLogger';
import * as settingService from '../../../bot/services/settingService';

// Set required env BEFORE loadEnv() is called inside eventLogger.
process.env.DATABASE_URL = 'postgresql://test';
process.env.TELEGRAM_BOT_TOKEN = 'test';
process.env.MARZBAN_API_URL = 'https://test.example.com';
process.env.MARZBAN_USERNAME = 'test';
process.env.MARZBAN_PASSWORD = 'test';
process.env.ADMIN_CHAT_ID = '1';
process.env.SUPPORT_USERNAME = '@support';
process.env.SUB_BASE_URL = 'https://sub.example.com';
process.env.MARZBAN_SUB_URL = 'https://int.example.com';
process.env.LOG_GROUP_ID = '-100123';
process.env.LOG_TOPIC_USERS = '1';
process.env.LOG_TOPIC_PAYMENTS = '2';
process.env.LOG_TOPIC_ACCOUNTS = '3';
process.env.LOG_TOPIC_ADMIN = '4';
process.env.LOG_TOPIC_SELLER = '5';
process.env.LOG_TOPIC_ERRORS = '6';
process.env.LOG_TOPIC_SYSTEM = '7';
process.env.LOG_TOPIC_BACKUP_MARZBAN = '8';
process.env.LOG_TOPIC_BACKUP_BOT = '9';
process.env.MARZBAN_DATABASE_URL = 'postgresql://marzban';

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function makeTelegramMock() {
  return {
    sendMessage: vi.fn().mockResolvedValue({ message_id: 1 }),
  };
}

describe('eventLogger', () => {
  beforeEach(() => {
    resetEventLoggerForTests();
    vi.spyOn(settingService, 'getSetting').mockResolvedValue('true');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is a no-op when the bot instance is not set', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    logEvent('system.bot_started', { nodeEnv: 'test', version: '0.0.1' });
    await flushPromises();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('sends an HTML message to the correct topic for the event category', async () => {
    const telegram = makeTelegramMock();
    setBotInstance({ telegram: telegram as never });

    logEvent('payment.admin_approved', {
      txnId: 1,
      transactionUuid: 'u1',
      amount: 100000,
      targetChatId: 999,
      type: 'buy',
    });
    await flushPromises();

    expect(telegram.sendMessage).toHaveBeenCalledTimes(1);
    const [chatId, text, options] = telegram.sendMessage.mock.calls[0];
    expect(chatId).toBe('-100123');
    expect(options.parse_mode).toBe('HTML');
    expect(options.message_thread_id).toBe(2); // PAYMENTS topic
    expect(text).toContain('payment.admin_approved');
  });

  it('routes USER events to USER topic', async () => {
    const telegram = makeTelegramMock();
    setBotInstance({ telegram: telegram as never });

    logEvent('user.home_button_clicked', { button: 'buy_account' });
    await flushPromises();

    const options = telegram.sendMessage.mock.calls[0][2];
    expect(options.message_thread_id).toBe(1);
  });

  it('routes SYSTEM events to SYSTEM topic', async () => {
    const telegram = makeTelegramMock();
    setBotInstance({ telegram: telegram as never });

    logEvent('system.bot_started', { nodeEnv: 'test', version: '0.0.1' });
    await flushPromises();

    const options = telegram.sendMessage.mock.calls[0][2];
    expect(options.message_thread_id).toBe(7);
  });

  it('no-ops when events_enabled is "false"', async () => {
    vi.spyOn(settingService, 'getSetting').mockResolvedValue('false');
    const telegram = makeTelegramMock();
    setBotInstance({ telegram: telegram as never });

    logEvent('system.bot_started', { nodeEnv: 'test', version: '0.0.1' });
    await flushPromises();

    expect(telegram.sendMessage).not.toHaveBeenCalled();
  });

  it('swallows errors from sendMessage so callers never see exceptions', async () => {
    const telegram = {
      sendMessage: vi.fn().mockRejectedValue(new Error('Bad Request')),
    };
    setBotInstance({ telegram: telegram as never });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Must not throw.
    expect(() =>
      logEvent('system.bot_started', { nodeEnv: 'test', version: '0.0.1' }),
    ).not.toThrow();
    await flushPromises();

    expect(errorSpy).toHaveBeenCalled();
  });
});
