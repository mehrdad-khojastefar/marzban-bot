import { Scenes, Markup } from 'telegraf';
import { BotContext } from '../context';
import { SCENE_ADMIN_BANK_CARDS, SCENE_HOME } from './constants';
import { getMessage } from '../services/messageService';
import { sendOrEdit } from '../services/renderService';
import { getDb } from '../../core/db';
import { toEnglishDigits } from '../../core/utils/format';
import { loadEnv } from '../../core/utils/config';

export const adminBankCardsScene = new Scenes.BaseScene<BotContext>(SCENE_ADMIN_BANK_CARDS);

function formatCardNumber(num: string): string {
  return num.replace(/(\d{4})/g, '$1-').slice(0, -1);
}

async function renderCardList(ctx: BotContext) {
  const env = loadEnv();
  if (String(ctx.from!.id) !== env.ADMIN_CHAT_ID) {
    await ctx.scene.enter(SCENE_HOME);
    return;
  }

  const db = getDb();
  const cards = await db.bankCard.findMany({
    include: { users: true },
    orderBy: { created_at: 'desc' },
  });

  // Reset card creation state
  ctx.session.adminCardStep = undefined;
  ctx.session.pendingCardNumber = undefined;
  ctx.session.pendingCardHolder = undefined;
  ctx.session.managingCardId = undefined;

  const buttons: ReturnType<typeof Markup.button.callback>[][] = [
    [Markup.button.callback('➕ افزودن کارت', 'add_card')],
  ];

  if (cards.length === 0) {
    const msg = await getMessage('admin.no_cards');
    buttons.push([Markup.button.callback('🔙 بازگشت', 'back')]);
    await sendOrEdit(ctx, msg, Markup.inlineKeyboard(buttons));
    return;
  }

  const title = await getMessage('admin.cards_title');

  for (const card of cards) {
    const last4 = card.card_number.slice(-4);
    const statusBadge = card.is_active ? '✅' : '❌';
    const userCount = card.users.length;
    const label = `${statusBadge} ${card.holder_name} - ****${last4} (${userCount} کاربر)`;
    buttons.push([Markup.button.callback(label, `card_${card.id}`)]);
  }

  buttons.push([Markup.button.callback('🔙 بازگشت', 'back')]);
  await sendOrEdit(ctx, title, Markup.inlineKeyboard(buttons));
}

adminBankCardsScene.enter(async (ctx) => {
  await renderCardList(ctx);
});

adminBankCardsScene.action('add_card', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.adminCardStep = 'number';
  const msg = await getMessage('admin.card_enter_number');
  await sendOrEdit(
    ctx,
    msg,
    Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'back_list')]]),
  );
});

adminBankCardsScene.on('text', async (ctx) => {
  const step = ctx.session.adminCardStep;

  if (step === 'number') {
    const raw = toEnglishDigits(ctx.message.text.trim()).replace(/[\s\-]/g, '');
    if (!/^\d{16}$/.test(raw)) {
      const msg = await getMessage('admin.card_invalid_number');
      await sendOrEdit(
        ctx,
        msg,
        Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'back_list')]]),
      );
      return;
    }
    ctx.session.pendingCardNumber = raw;
    ctx.session.adminCardStep = 'holder';
    const msg = await getMessage('admin.card_enter_holder');
    await sendOrEdit(
      ctx,
      msg,
      Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'back_list')]]),
    );
    return;
  }

  if (step === 'holder') {
    ctx.session.pendingCardHolder = ctx.message.text.trim();
    ctx.session.adminCardStep = 'bank';
    const msg = await getMessage('admin.card_enter_bank');
    await sendOrEdit(
      ctx,
      msg,
      Markup.inlineKeyboard([
        [Markup.button.callback('⏭ رد کردن', 'skip_bank')],
        [Markup.button.callback('🔙 بازگشت', 'back_list')],
      ]),
    );
    return;
  }

  if (step === 'bank') {
    const bankName = ctx.message.text.trim();
    await createCard(ctx, bankName);
    return;
  }
});

adminBankCardsScene.action('skip_bank', async (ctx) => {
  await ctx.answerCbQuery();
  await createCard(ctx, null);
});

async function createCard(ctx: BotContext, bankName: string | null) {
  const db = getDb();
  await db.bankCard.create({
    data: {
      card_number: ctx.session.pendingCardNumber!,
      holder_name: ctx.session.pendingCardHolder!,
      bank_name: bankName,
    },
  });

  ctx.session.adminCardStep = undefined;
  ctx.session.pendingCardNumber = undefined;
  ctx.session.pendingCardHolder = undefined;

  const msg = await getMessage('admin.card_added');
  await sendOrEdit(
    ctx,
    msg,
    Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'back_list')]]),
  );
}

adminBankCardsScene.action(/^card_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const cardId = parseInt(ctx.match[1]);
  const db = getDb();
  const card = await db.bankCard.findUnique({
    where: { id: cardId },
    include: { users: true },
  });

  if (!card) {
    await renderCardList(ctx);
    return;
  }

  const statusBadge = card.is_active ? '✅ فعال' : '❌ غیرفعال';
  const detail = [
    `💳 شماره کارت: <code>${formatCardNumber(card.card_number)}</code>`,
    `👤 به نام: ${card.holder_name}`,
    card.bank_name ? `🏦 بانک: ${card.bank_name}` : null,
    `📊 وضعیت: ${statusBadge}`,
    `👥 تعداد کاربران: ${card.users.length}`,
  ]
    .filter(Boolean)
    .join('\n');

  const toggleLabel = card.is_active ? '❌ غیرفعال کردن' : '✅ فعال کردن';

  await sendOrEdit(
    ctx,
    detail,
    Markup.inlineKeyboard([
      [Markup.button.callback(toggleLabel, `toggle_card_${card.id}`)],
      [Markup.button.callback('🗑 حذف', `delete_card_${card.id}`)],
      [Markup.button.callback('🔙 بازگشت', 'back_list')],
    ]),
  );
});

adminBankCardsScene.action(/^toggle_card_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const cardId = parseInt(ctx.match[1]);
  const db = getDb();
  const card = await db.bankCard.findUnique({ where: { id: cardId } });

  if (!card) {
    await renderCardList(ctx);
    return;
  }

  await db.bankCard.update({
    where: { id: cardId },
    data: { is_active: !card.is_active },
  });

  // Re-show card detail
  const updatedCard = await db.bankCard.findUnique({
    where: { id: cardId },
    include: { users: true },
  });

  if (!updatedCard) {
    await renderCardList(ctx);
    return;
  }

  const statusBadge = updatedCard.is_active ? '✅ فعال' : '❌ غیرفعال';
  const detail = [
    `💳 شماره کارت: <code>${formatCardNumber(updatedCard.card_number)}</code>`,
    `👤 به نام: ${updatedCard.holder_name}`,
    updatedCard.bank_name ? `🏦 بانک: ${updatedCard.bank_name}` : null,
    `📊 وضعیت: ${statusBadge}`,
    `👥 تعداد کاربران: ${updatedCard.users.length}`,
  ]
    .filter(Boolean)
    .join('\n');

  const toggleLabel = updatedCard.is_active ? '❌ غیرفعال کردن' : '✅ فعال کردن';

  await sendOrEdit(
    ctx,
    detail,
    Markup.inlineKeyboard([
      [Markup.button.callback(toggleLabel, `toggle_card_${updatedCard.id}`)],
      [Markup.button.callback('🗑 حذف', `delete_card_${updatedCard.id}`)],
      [Markup.button.callback('🔙 بازگشت', 'back_list')],
    ]),
  );
});

adminBankCardsScene.action(/^delete_card_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const cardId = parseInt(ctx.match[1]);
  const db = getDb();
  const card = await db.bankCard.findUnique({
    where: { id: cardId },
    include: { users: true },
  });

  if (!card) {
    await renderCardList(ctx);
    return;
  }

  if (card.users.length > 0) {
    const msg = await getMessage('admin.card_has_users');
    await sendOrEdit(
      ctx,
      msg,
      Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'back_list')]]),
    );
    return;
  }

  await db.bankCard.delete({ where: { id: cardId } });
  const msg = await getMessage('admin.card_deleted');
  await sendOrEdit(
    ctx,
    msg,
    Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'back_list')]]),
  );
});

adminBankCardsScene.action('back_list', async (ctx) => {
  await ctx.answerCbQuery();
  await renderCardList(ctx);
});

adminBankCardsScene.action('back', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.scene.enter(SCENE_HOME);
});
