import { Scenes, Markup } from 'telegraf';
import { BotContext } from '../context';
import { SCENE_SELLER_REPORT, SCENE_SELLER_PANEL } from './constants';
import { getMessage } from '../services/messageService';
import { sendOrEdit } from '../services/renderService';
import { getDb } from '../../core/db';
import { formatPrice } from '../../core/utils/format';
import { actorFrom, logEvent } from '../../core/events';

export const sellerReportScene = new Scenes.BaseScene<BotContext>(SCENE_SELLER_REPORT);

sellerReportScene.enter(async (ctx) => {
  const sellerId = ctx.session.sellerId;
  if (!sellerId) {
    await ctx.scene.enter(SCENE_SELLER_PANEL);
    return;
  }

  logEvent('seller.report_viewed', { sellerId }, actorFrom(ctx.from));

  const db = getDb();
  const now = new Date();

  // One groupBy gives us all counts + sums split by payment_status (paid /
  // unpaid / null). A second count handles "active" since it depends on the
  // dynamic `now`, not a static enum. We never materialize the rows.
  const [groups, active] = await Promise.all([
    db.account.groupBy({
      by: ['payment_status'],
      where: { seller_id: sellerId },
      _sum: { price: true },
      _count: { _all: true },
    }),
    db.account.count({
      where: { seller_id: sellerId, expires_at: { gt: now } },
    }),
  ]);

  let total = 0;
  let totalAmount = 0;
  let paidAmount = 0;
  for (const g of groups) {
    total += g._count._all;
    totalAmount += g._sum.price ?? 0;
    if (g.payment_status === 'paid') {
      paidAmount += g._sum.price ?? 0;
    }
  }
  const expired = total - active;
  const remaining = totalAmount - paidAmount;

  const msg = await getMessage('seller.report', {
    total: String(total),
    active: String(active),
    expired: String(expired),
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
