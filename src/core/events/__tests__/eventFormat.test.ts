import { describe, it, expect } from 'vitest';
import { formatEvent } from '../eventFormat';

const FIXED_DATE = new Date('2026-05-23T14:33:10.000Z');
const ACTOR = {
  chatId: 123456,
  name: 'Ali',
  username: 'ali_test',
};

describe('formatEvent', () => {
  it('formats user.start_command with deep-link code', () => {
    const out = formatEvent(
      'user.start_command',
      { deepLinkCode: 'abc123', status: 'new' },
      ACTOR,
      FIXED_DATE,
    );
    expect(out).toMatchInlineSnapshot(`
      "👤 <b>user.start_command</b>
      👤 user: <a href="tg://user?id=123456">Ali</a> (<code>123456</code>) @ali_test
      🕒 2026-05-23 18:03:10 Tehran

      deep_link: abc123
      status: new
      "
    `);
  });

  it('formats user.registration_requested', () => {
    const out = formatEvent(
      'user.registration_requested',
      {
        chatId: BigInt(123),
        firstName: 'Ali',
        lastName: 'Karimi',
        username: 'ali_test',
        planGroupName: 'هر گیگ',
        planGroupCode: 'abcd1234',
      },
      ACTOR,
      FIXED_DATE,
    );
    expect(out).toContain('user.registration_requested');
    expect(out).toContain('first_name: Ali');
    expect(out).toContain('last_name: Karimi');
    expect(out).toContain('username: @ali_test');
    expect(out).toContain('plan_group: هر گیگ (abcd1234)');
  });

  it('formats payment.admin_approved', () => {
    const out = formatEvent(
      'payment.admin_approved',
      {
        txnId: 42,
        transactionUuid: '7f3b1234-e1',
        amount: 150000,
        targetChatId: 999,
        type: 'buy',
      },
      ACTOR,
      FIXED_DATE,
    );
    expect(out).toContain('💳 <b>payment.admin_approved</b>');
    expect(out).toContain('txn_id: 42');
    expect(out).toContain('amount: 150,000 تومان');
    expect(out).toContain('target_chat_id: 999');
  });

  it('formats account.created', () => {
    const out = formatEvent(
      'account.created',
      {
        marzbanUsername: 'dove_123456',
        ownerChatId: 999,
        type: 'paid',
        dataLimitBytes: 5 * 1073741824,
        durationDays: 30,
        expiresAt: new Date('2026-06-22T00:00:00.000Z'),
        planLabel: '5 گیگ',
      },
      ACTOR,
      FIXED_DATE,
    );
    expect(out).toContain('📦 <b>account.created</b>');
    expect(out).toContain('marzban_username: dove_123456');
    expect(out).toContain('data_limit: 5.00GB');
    expect(out).toContain('plan: 5 گیگ');
  });

  it('formats account.renewed', () => {
    const out = formatEvent(
      'account.renewed',
      {
        marzbanUsername: 'dove_abc',
        oldExpiresAt: new Date('2026-05-01T00:00:00.000Z'),
        newExpiresAt: new Date('2026-06-01T00:00:00.000Z'),
        accumulatedBytes: 10 * 1073741824,
        newDataLimitBytes: 30 * 1073741824,
      },
      ACTOR,
      FIXED_DATE,
    );
    expect(out).toContain('account.renewed');
    expect(out).toContain('added: 10.00GB');
    expect(out).toContain('new_data_limit: 30.00GB');
  });

  it('formats error.handler_caught with stack truncated', () => {
    const longStack = 'at foo()\n'.repeat(200);
    const out = formatEvent(
      'error.handler_caught',
      {
        message: 'Cannot read x',
        stack: longStack,
        updateType: 'callback_query',
        scene: 'scene:home',
        callbackData: 'buy_account',
      },
      ACTOR,
      FIXED_DATE,
    );
    expect(out).toContain('🔥 <b>error.handler_caught</b>');
    expect(out).toContain('message: Cannot read x');
    expect(out).toContain('scene: scene:home');
    expect(out).toContain('callback_data: buy_account');
    // Should include a stack block but truncated
    expect(out).toMatch(/<pre>at foo\(\)/);
  });

  it('formats system events without actor line', () => {
    const out = formatEvent(
      'system.bot_started',
      { nodeEnv: 'production', version: '0.1.0' },
      undefined,
      FIXED_DATE,
    );
    expect(out).toContain('⚙️ <b>system.bot_started</b>');
    expect(out).not.toContain('👤 user:');
    expect(out).toContain('version: 0.1.0');
    expect(out).toContain('node_env: production');
  });

  it('escapes HTML in user-provided fields', () => {
    const out = formatEvent(
      'admin.account_edited',
      {
        marzbanUsername: 'dove_<test>',
        field: 'note',
        newValue: 'hello & <b>bye</b>',
      },
      { chatId: 1, name: '<script>alert(1)</script>' },
      FIXED_DATE,
    );
    expect(out).not.toContain('<script>alert(1)</script>');
    expect(out).toContain('&lt;script&gt;');
    expect(out).toContain('&lt;test&gt;');
    expect(out).toContain('hello &amp; &lt;b&gt;bye&lt;/b&gt;');
  });

  it('formats payment.premzy_callback_received with signature flag', () => {
    const out = formatEvent(
      'payment.premzy_callback_received',
      {
        transactionUuid: 'uuid-1',
        status: 'paid',
        signatureValid: true,
        remoteIp: '1.2.3.4',
      },
      undefined,
      FIXED_DATE,
    );
    expect(out).toContain('signature_valid: yes');
    expect(out).toContain('remote_ip: 1.2.3.4');
  });
});
