import { Scenes, Markup } from 'telegraf';
import { BotContext } from '../context';
import { SCENE_ADMIN_USERS, SCENE_HOME } from './constants';
import { getMessage } from '../services/messageService';
import { sendOrEdit } from '../services/renderService';
import { getDb } from '../../core/db';
import { toEnglishDigits } from '../../core/utils/format';
import { loadEnv } from '../../core/utils/config';

export const adminUsersScene = new Scenes.BaseScene<BotContext>(SCENE_ADMIN_USERS);

const PAGE_SIZE = 8;

const STATUS_ICON: Record<string, string> = {
  pending: '⏳',
  approved: '✅',
  banned: '🚫',
};

function resetSessionState(ctx: BotContext) {
  ctx.session.adminUserStep = undefined;
  ctx.session.pendingUserChatId = undefined;
  ctx.session.managingUserId = undefined;
  ctx.session.selectedCardIds = undefined;
}

// ── User List ──────────────────────────────────────────────────────

async function renderUserList(ctx: BotContext, page = 0) {
  const env = loadEnv();
  if (String(ctx.from!.id) !== env.ADMIN_CHAT_ID) {
    await ctx.scene.enter(SCENE_HOME);
    return;
  }

  const db = getDb();
  resetSessionState(ctx);
  ctx.session.currentPage = page;

  const totalUsers = await db.user.count();
  const users = await db.user.findMany({
    include: { bank_cards: true },
    orderBy: { created_at: 'desc' },
    skip: page * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  const buttons: ReturnType<typeof Markup.button.callback>[][] = [
    [Markup.button.callback('➕ افزودن کاربر', 'add_user')],
  ];

  if (totalUsers === 0) {
    const msg = await getMessage('admin.no_users');
    buttons.push([Markup.button.callback('🔙 بازگشت', 'back')]);
    await sendOrEdit(ctx, msg, Markup.inlineKeyboard(buttons));
    return;
  }

  const title = await getMessage('admin.users_title');

  for (const user of users) {
    const name = user.first_name || String(user.chat_id);
    const icon = STATUS_ICON[user.status] ?? '';
    const cardCount = user.bank_cards.length;
    const cardInfo = cardCount > 0 ? ` - 💳 ${String(cardCount)}` : '';
    buttons.push([Markup.button.callback(`${icon} ${name}${cardInfo}`, `user_${user.id}`)]);
  }

  // Pagination
  const totalPages = Math.ceil(totalUsers / PAGE_SIZE);
  if (totalPages > 1) {
    const paginationRow: ReturnType<typeof Markup.button.callback>[] = [];
    if (page > 0) {
      paginationRow.push(Markup.button.callback('⬅️ قبلی', `page_${page - 1}`));
    }
    paginationRow.push(Markup.button.callback(`${page + 1}/${totalPages}`, 'noop'));
    if (page < totalPages - 1) {
      paginationRow.push(Markup.button.callback('بعدی ➡️', `page_${page + 1}`));
    }
    buttons.push(paginationRow);
  }

  buttons.push([Markup.button.callback('🔙 بازگشت', 'back')]);
  await sendOrEdit(ctx, title, Markup.inlineKeyboard(buttons));
}

// ── User Detail ────────────────────────────────────────────────────

async function renderUserDetail(ctx: BotContext, userId: number) {
  const db = getDb();
  const user = await db.user.findUnique({
    where: { id: userId },
    include: { bank_cards: true },
  });

  if (!user) {
    await renderUserList(ctx);
    return;
  }

  ctx.session.managingUserId = userId;

  const name = [user.first_name, user.last_name].filter(Boolean).join(' ');
  const username = user.username ? ` (@${user.username})` : '';
  const statusLabel = STATUS_ICON[user.status] ?? '';

  const cardLines =
    user.bank_cards.length > 0
      ? user.bank_cards
          .map((c) => `💳 ${c.holder_name} - ****${c.card_number.slice(-4)}`)
          .join('\n')
      : '💳 بدون کارت';

  const detail = [
    `👤 ${name}${username}`,
    `🆔 چت آیدی: ${user.chat_id}`,
    `وضعیت: ${statusLabel} ${user.status}`,
    cardLines,
  ].join('\n');

  const buttons: ReturnType<typeof Markup.button.callback>[][] = [];

  if (user.status === 'pending') {
    buttons.push([
      Markup.button.callback('✅ تأیید', `approve_user_${user.id}`),
      Markup.button.callback('❌ رد', `reject_user_${user.id}`),
    ]);
  } else if (user.status === 'approved') {
    buttons.push([Markup.button.callback('💳 تغییر کارت‌ها', `edit_cards_${user.id}`)]);
    buttons.push([Markup.button.callback('🚫 بن کردن', `ban_user_${user.id}`)]);
  } else if (user.status === 'banned') {
    buttons.push([Markup.button.callback('✅ رفع بن', `unban_user_${user.id}`)]);
  }

  buttons.push([Markup.button.callback('🔙 بازگشت', 'back_list')]);
  await sendOrEdit(ctx, detail, Markup.inlineKeyboard(buttons));
}

// ── Multi-Card Selection ───────────────────────────────────────────

async function renderCardSelection(ctx: BotContext, userId: number, headerExtra?: string) {
  const db = getDb();
  const cards = await db.bankCard.findMany({
    where: { is_active: true },
    orderBy: { created_at: 'desc' },
  });

  if (cards.length === 0) {
    const msg = await getMessage('admin.no_active_cards');
    await sendOrEdit(
      ctx,
      msg,
      Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'back_list')]]),
    );
    return;
  }

  const selected = ctx.session.selectedCardIds ?? [];
  const selectedCount = selected.length;

  const user = await db.user.findUnique({ where: { id: userId } });
  const header =
    (headerExtra ?? `💳 کارت‌های بانکی را برای ${user?.first_name ?? '?'} انتخاب کنید:`) +
    `\n\nانتخاب شده: ${selectedCount > 0 ? String(selectedCount) + ' کارت' : 'هیچکدام'}`;

  const buttons: ReturnType<typeof Markup.button.callback>[][] = [];

  for (const card of cards) {
    const last4 = card.card_number.slice(-4);
    const isSelected = selected.includes(card.id);
    const icon = isSelected ? '✅' : '💳';
    buttons.push([
      Markup.button.callback(
        `${icon} ${card.holder_name} - ****${last4}`,
        `toggle_ucard_${card.id}`,
      ),
    ]);
  }

  buttons.push([Markup.button.callback('✅ تأیید انتخاب', 'confirm_cards')]);
  buttons.push([Markup.button.callback('🔙 انصراف', 'cancel_cards')]);

  await sendOrEdit(ctx, header, Markup.inlineKeyboard(buttons));
}

// ── Scene Handlers ─────────────────────────────────────────────────

adminUsersScene.enter(async (ctx) => {
  await renderUserList(ctx);
});

adminUsersScene.action('noop', async (ctx) => {
  await ctx.answerCbQuery();
});

adminUsersScene.action(/^page_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const page = parseInt(ctx.match[1]);
  await renderUserList(ctx, page);
});

// ── User Detail ────────────────────────────────────────────────────

adminUsersScene.action(/^user_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const userId = parseInt(ctx.match[1]);
  await renderUserDetail(ctx, userId);
});

// ── Approve pending user (enter card selection) ────────────────────

adminUsersScene.action(/^approve_user_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const userId = parseInt(ctx.match[1]);
  ctx.session.managingUserId = userId;
  ctx.session.adminUserStep = 'select_cards';
  ctx.session.selectedCardIds = [];
  await renderCardSelection(ctx, userId);
});

// ── Reject pending user → ban ──────────────────────────────────────

adminUsersScene.action(/^reject_user_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const userId = parseInt(ctx.match[1]);
  const db = getDb();

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || user.status === 'banned') {
    await ctx.answerCbQuery('⚠️ این کاربر قبلاً بررسی شده است.', { show_alert: true });
    await renderUserList(ctx);
    return;
  }

  await db.user.update({
    where: { id: userId },
    data: { status: 'banned' },
  });

  await sendOrEdit(
    ctx,
    `❌ کاربر ${user.first_name} (@${user.username ?? '—'}) رد شد و بن شد.`,
    Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'back_list')]]),
  );
});

// ── Ban approved user ──────────────────────────────────────────────

adminUsersScene.action(/^ban_user_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const userId = parseInt(ctx.match[1]);
  const db = getDb();

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) {
    await renderUserList(ctx);
    return;
  }

  await db.user.update({
    where: { id: userId },
    data: { status: 'banned' },
  });

  await sendOrEdit(
    ctx,
    `🚫 کاربر ${user.first_name} (@${user.username ?? '—'}) بن شد.`,
    Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'back_list')]]),
  );
});

// ── Unban banned user → enter card selection to approve ────────────

adminUsersScene.action(/^unban_user_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const userId = parseInt(ctx.match[1]);
  const db = getDb();

  const user = await db.user.findUnique({ where: { id: userId }, include: { bank_cards: true } });
  if (!user) {
    await renderUserList(ctx);
    return;
  }

  // Pre-select their existing cards
  ctx.session.managingUserId = userId;
  ctx.session.adminUserStep = 'select_cards';
  ctx.session.selectedCardIds = user.bank_cards.map((c) => c.id);
  await renderCardSelection(ctx, userId);
});

// ── Edit cards for approved user ───────────────────────────────────

adminUsersScene.action(/^edit_cards_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const userId = parseInt(ctx.match[1]);
  const db = getDb();

  const user = await db.user.findUnique({ where: { id: userId }, include: { bank_cards: true } });
  if (!user) {
    await renderUserList(ctx);
    return;
  }

  // Pre-select current cards
  ctx.session.managingUserId = userId;
  ctx.session.adminUserStep = 'select_cards';
  ctx.session.selectedCardIds = user.bank_cards.map((c) => c.id);
  await renderCardSelection(ctx, userId);
});

// ── Toggle card in multi-select ────────────────────────────────────

adminUsersScene.action(/^toggle_ucard_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const cardId = parseInt(ctx.match[1]);
  const selected = ctx.session.selectedCardIds ?? [];

  if (selected.includes(cardId)) {
    ctx.session.selectedCardIds = selected.filter((id) => id !== cardId);
  } else {
    ctx.session.selectedCardIds = [...selected, cardId];
  }

  const userId = ctx.session.managingUserId;
  if (!userId) {
    await renderUserList(ctx);
    return;
  }
  await renderCardSelection(ctx, userId);
});

// ── Confirm card selection ─────────────────────────────────────────

adminUsersScene.action('confirm_cards', async (ctx) => {
  const selected = ctx.session.selectedCardIds ?? [];

  if (selected.length === 0) {
    await ctx.answerCbQuery('❌ حداقل یک کارت باید انتخاب شود.', { show_alert: true });
    return;
  }
  await ctx.answerCbQuery('⏳ در حال ذخیره...');

  const userId = ctx.session.managingUserId;
  if (!userId) {
    await renderUserList(ctx);
    return;
  }

  const db = getDb();
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) {
    await renderUserList(ctx);
    return;
  }

  const wasPending = user.status === 'pending' || user.status === 'banned';

  // Set cards (replace all) and approve if needed
  await db.user.update({
    where: { id: userId },
    data: {
      status: 'approved',
      bank_cards: {
        set: selected.map((id) => ({ id })),
      },
    },
  });

  // Notify user if they were just approved
  if (wasPending) {
    try {
      const approvedMsg = await getMessage('user.approved');
      await ctx.telegram.sendMessage(user.chat_id.toString(), approvedMsg);
    } catch (err) {
      console.error(`Failed to notify user ${user.chat_id} of approval:`, err);
    }
  }

  const action = wasPending ? 'تأیید شد' : 'کارت‌ها بروزرسانی شد';
  await sendOrEdit(
    ctx,
    `✅ کاربر ${user.first_name} (@${user.username ?? '—'}) ${action}.\n💳 ${String(selected.length)} کارت اختصاص داده شد.`,
    Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'back_list')]]),
  );

  resetSessionState(ctx);
});

// ── Cancel card selection ──────────────────────────────────────────

adminUsersScene.action('cancel_cards', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.session.managingUserId;
  resetSessionState(ctx);
  if (userId) {
    await renderUserDetail(ctx, userId);
  } else {
    await renderUserList(ctx);
  }
});

// ── Add User Flow ──────────────────────────────────────────────────

adminUsersScene.action('add_user', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.adminUserStep = 'chat_id';
  const msg = await getMessage('admin.user_enter_chatid');
  await sendOrEdit(
    ctx,
    msg,
    Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'back_list')]]),
  );
});

adminUsersScene.on('text', async (ctx) => {
  const step = ctx.session.adminUserStep;

  if (step === 'chat_id') {
    const input = toEnglishDigits(ctx.message.text.trim());

    if (!/^\d+$/.test(input)) {
      const msg = await getMessage('admin.user_enter_chatid');
      await sendOrEdit(
        ctx,
        msg,
        Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'back_list')]]),
      );
      return;
    }

    const db = getDb();
    const existing = await db.user.findUnique({ where: { chat_id: BigInt(input) } });
    if (existing) {
      const msg = await getMessage('admin.user_exists');
      await sendOrEdit(
        ctx,
        msg,
        Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'back_list')]]),
      );
      return;
    }

    // Create user as pending, then enter card selection to approve
    const user = await db.user.create({
      data: {
        chat_id: BigInt(input),
        first_name: input,
        status: 'pending',
      },
    });

    ctx.session.pendingUserChatId = undefined;
    ctx.session.managingUserId = user.id;
    ctx.session.adminUserStep = 'select_cards';
    ctx.session.selectedCardIds = [];
    await renderCardSelection(ctx, user.id);
    return;
  }
});

// ── Navigation ─────────────────────────────────────────────────────

adminUsersScene.action('back_list', async (ctx) => {
  await ctx.answerCbQuery();
  await renderUserList(ctx, ctx.session.currentPage ?? 0);
});

adminUsersScene.action('back', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.scene.enter(SCENE_HOME);
});
