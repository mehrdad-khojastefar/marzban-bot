import { Scenes, Markup } from 'telegraf';
import { BotContext } from '../context';
import { SCENE_SELLER_REPORT, SCENE_SELLER_PANEL } from './constants';
import { getMessage } from '../services/messageService';
import { sendOrEdit } from '../services/renderService';
import { getDb } from '../../core/db';
import { formatPrice, toPersianDigits } from '../../core/utils/format';

export const sellerReportScene = new Scenes.BaseScene<BotContext>(SCENE_SELLER_REPORT);

sellerReportScene.enter(async (ctx) => {
  const sellerId = ctx.session.sellerId;
  if (!sellerId) {
    await ctx.scene.enter(SCENE_SELLER_PANEL);
    return;
  }

  const db = getDb();
  const now = new Date();

  const allAccounts = await db.account.findMany({
    where: { seller_id: sellerId },
    include: { seller_plan: true },
  });

  const total = allAccounts.length;
  const active = allAccounts.filter((a) => a.expires_at > now).length;
  const expired = total - active;

  let totalAmount = 0;
  let paidAmount = 0;

  for (const account of allAccounts) {
    const price = account.seller_plan?.price ?? 0;
    totalAmount += price;
    if (account.payment_status === 'paid') {
      paidAmount += price;
    }
  }

  const remaining = totalAmount - paidAmount;

  const msg = await getMessage('seller.report', {
    total: toPersianDigits(String(total)),
    active: toPersianDigits(String(active)),
    expired: toPersianDigits(String(expired)),
    total_amount: formatPrice(totalAmount),
    paid_amount: formatPrice(paidAmount),
    remaining: formatPrice(remaining),
  });

  await sendOrEdit(
    ctx,
    msg,
    Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'back_panel')]]),
  );
});

sellerReportScene.action('back_panel', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.scene.enter(SCENE_SELLER_PANEL);
});
