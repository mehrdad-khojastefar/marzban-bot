import { Scenes, Markup } from 'telegraf';
import { BotContext } from '../context';
import {
  SCENE_ADMIN_SELLER_DETAIL,
  SCENE_ADMIN_SELLERS,
  SCENE_ADMIN_SELLER_PLANS,
  SCENE_ADMIN_SELLER_ACCOUNTS,
} from './constants';
import { getMessage } from '../services/messageService';
import { sendOrEdit } from '../services/renderService';
import { getDb } from '../../core/db';
import { formatPrice, toPersianDigits } from '../../core/utils/format';

export const adminSellerDetailScene = new Scenes.BaseScene<BotContext>(
  SCENE_ADMIN_SELLER_DETAIL,
);

async function renderDetail(ctx: BotContext) {
  const sellerId = ctx.session.managingSellerId;
  if (!sellerId) {
    await ctx.scene.enter(SCENE_ADMIN_SELLERS);
    return;
  }

  const db = getDb();
  const seller = await db.seller.findUnique({
    where: { id: sellerId },
    include: {
      user: true,
      accounts: { include: { seller_plan: true } },
    },
  });

  if (!seller) {
    await ctx.scene.enter(SCENE_ADMIN_SELLERS);
    return;
  }

  const title = await getMessage('admin.seller_detail');
  const now = new Date();

  const totalAccounts = seller.accounts.length;
  const activeAccounts = seller.accounts.filter((a) => a.expires_at > now).length;
  const debt = seller.accounts
    .filter((a) => a.payment_status === 'unpaid')
    .reduce((sum, a) => sum + (a.seller_plan?.price ?? 0), 0);

  let infoLines: string;
  if (seller.user) {
    const name = [seller.user.first_name, seller.user.last_name].filter(Boolean).join(' ');
    const username = seller.user.username ? `@${seller.user.username}` : '—';
    infoLines =
      `👤 نام: ${name}\n` +
      `🆔 یوزرنیم: ${username}\n` +
      `💬 چت آیدی: ${seller.chat_id}\n` +
      `📝 یادداشت: ${seller.note || '—'}\n` +
      `🔗 وضعیت: ${seller.is_active ? 'فعال ✅' : 'غیرفعال ❌'}`;
  } else {
    infoLines =
      `💬 چت آیدی: ${seller.chat_id}\n` +
      `📝 یادداشت: ${seller.note || '—'}\n` +
      `🔗 وضعیت: هنوز شروع نکرده ⏳`;
  }

  const financialLines =
    `\n\n📊 خلاصه مالی:\n` +
    `اکانت‌ها: ${toPersianDigits(String(totalAccounts))} (${toPersianDigits(String(activeAccounts))} فعال)\n` +
    `بدهی: ${formatPrice(debt)}`;

  const text = `${title}\n\n${infoLines}${financialLines}`;

  const buttons: ReturnType<typeof Markup.button.callback>[][] = [
    [Markup.button.callback('📋 پلن‌ها', 'seller_plans')],
  ];

  if (seller.user) {
    buttons.push([Markup.button.callback('📊 اکانت‌ها و تسویه', 'seller_accounts')]);
  }

  buttons.push([Markup.button.callback('✏️ ویرایش یادداشت', 'edit_note')]);

  if (seller.is_active) {
    buttons.push([Markup.button.callback('🔴 غیرفعال کردن', 'deactivate')]);
  } else {
    buttons.push([Markup.button.callback('🟢 فعال کردن', 'activate')]);
  }

  buttons.push([Markup.button.callback('🔙 بازگشت', 'back_sellers')]);

  await sendOrEdit(ctx, text, Markup.inlineKeyboard(buttons));
}

adminSellerDetailScene.enter(async (ctx) => {
  await renderDetail(ctx);
});

adminSellerDetailScene.action('seller_plans', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.scene.enter(SCENE_ADMIN_SELLER_PLANS);
});

adminSellerDetailScene.action('seller_accounts', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.scene.enter(SCENE_ADMIN_SELLER_ACCOUNTS);
});

adminSellerDetailScene.action('edit_note', async (ctx) => {
  await ctx.answerCbQuery();
  const msg = await getMessage('admin.enter_seller_note');
  await sendOrEdit(
    ctx,
    msg,
    Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'back_detail')]]),
  );
});

adminSellerDetailScene.on('text', async (ctx) => {
  const sellerId = ctx.session.managingSellerId;
  if (!sellerId) return;

  const note = ctx.message.text.trim();
  const db = getDb();
  await db.seller.update({
    where: { id: sellerId },
    data: { note },
  });

  await renderDetail(ctx);
});

adminSellerDetailScene.action('back_detail', async (ctx) => {
  await ctx.answerCbQuery();
  await renderDetail(ctx);
});

adminSellerDetailScene.action('deactivate', async (ctx) => {
  await ctx.answerCbQuery();
  const sellerId = ctx.session.managingSellerId;
  if (!sellerId) return;

  const db = getDb();
  await db.seller.update({
    where: { id: sellerId },
    data: { is_active: false },
  });

  await renderDetail(ctx);
});

adminSellerDetailScene.action('activate', async (ctx) => {
  await ctx.answerCbQuery();
  const sellerId = ctx.session.managingSellerId;
  if (!sellerId) return;

  const db = getDb();
  await db.seller.update({
    where: { id: sellerId },
    data: { is_active: true },
  });

  await renderDetail(ctx);
});

adminSellerDetailScene.action('back_sellers', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.scene.enter(SCENE_ADMIN_SELLERS);
});
