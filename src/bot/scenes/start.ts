import { Scenes, Markup } from 'telegraf';
import { BotContext } from '../context';
import { SCENE_START, SCENE_HOME } from './constants';
import { getMessage } from '../services/messageService';
import { getDb } from '../../core/db';
import { loadEnv } from '../../core/utils/config';

export const startScene = new Scenes.BaseScene<BotContext>(SCENE_START);

startScene.enter(async (ctx) => {
  const chatId = BigInt(ctx.from!.id);
  const db = getDb();
  const env = loadEnv();

  // Admin always gets through
  const isAdmin = String(chatId) === env.ADMIN_CHAT_ID;
  if (isAdmin) {
    // Ensure admin has a User record
    let adminUser = await db.user.findUnique({ where: { chat_id: chatId } });
    if (!adminUser) {
      adminUser = await db.user.create({
        data: {
          chat_id: chatId,
          first_name: ctx.from!.first_name ?? 'Admin',
          last_name: ctx.from!.last_name ?? undefined,
          username: ctx.from!.username ?? undefined,
          status: 'approved',
        },
      });
    } else if (adminUser.status !== 'approved') {
      adminUser = await db.user.update({
        where: { id: adminUser.id },
        data: { status: 'approved' },
      });
    }

    // Ensure admin has a Seller record linked to User
    let seller = await db.seller.findUnique({ where: { chat_id: chatId } });
    if (!seller) {
      seller = await db.seller.create({
        data: { chat_id: chatId, user_id: adminUser.id, is_active: true },
      });
      console.log(`Admin seller record created: id=${seller.id}`);
    } else if (!seller.user_id) {
      await db.seller.update({
        where: { id: seller.id },
        data: { user_id: adminUser.id },
      });
    }

    ctx.session.userId = adminUser.id;
    const sent = await ctx.reply('⏳', Markup.keyboard([['🏠 منو اصلی']]).resize());
    ctx.session.lastBotMessageId = sent.message_id;
    await ctx.scene.enter(SCENE_HOME);
    return;
  }

  let user = await db.user.findUnique({ where: { chat_id: chatId } });

  if (user) {
    // Banned → complete silence
    if (user.status === 'banned') {
      return;
    }

    // Pending → still waiting for admin approval, say nothing
    if (user.status === 'pending') {
      return;
    }

    // Approved → update profile, check channel, go HOME
    await db.user.update({
      where: { id: user.id },
      data: {
        username: ctx.from!.username ?? null,
        first_name: ctx.from!.first_name,
        last_name: ctx.from!.last_name ?? null,
      },
    });

    // Channel membership check
    if (env.CHANNEL_ID) {
      try {
        const member = await ctx.telegram.getChatMember(env.CHANNEL_ID, ctx.from!.id);
        if (['left', 'kicked'].includes(member.status)) {
          await ctx.reply(
            '⚠️ برای استفاده از ربات، ابتدا در کانال ما عضو شوید.',
            Markup.inlineKeyboard([
              [Markup.button.url('📢 عضویت در کانال', `https://t.me/${env.CHANNEL_ID.replace('@', '')}`)],
            ]),
          );
          return;
        }
      } catch (err) {
        console.error('Channel membership check failed:', err);
        // Don't block on failure — let user through
      }
    }

    ctx.session.userId = user.id;

    // Seller linking (existing logic)
    const seller = await db.seller.findUnique({ where: { chat_id: chatId } });
    if (seller && !seller.user_id) {
      await db.seller.update({
        where: { id: seller.id },
        data: { user_id: user.id },
      });
    }

    const greeting = await getMessage('start.welcome_back', { first_name: user.first_name });

    const sent = await ctx.reply('⏳', Markup.keyboard([['🏠 منو اصلی']]).resize());
    ctx.session.lastBotMessageId = sent.message_id;
    ctx.session.greeting = greeting;

    await ctx.scene.enter(SCENE_HOME);
    return;
  }

  // New user — need a valid deep link code
  const messageText = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  const code = messageText.startsWith('/start ')
    ? messageText.slice(7).trim()
    : undefined;

  if (!code) {
    // No code, no existing user → silence (don't reveal anything)
    return;
  }

  const planGroup = await db.planGroup.findFirst({
    where: { code, is_active: true },
  });
  if (!planGroup) {
    // Invalid code → silence
    return;
  }

  // Create user with status = pending (bot sends NOTHING to user)
  user = await db.user.create({
    data: {
      chat_id: chatId,
      username: ctx.from!.username ?? null,
      first_name: ctx.from!.first_name,
      last_name: ctx.from!.last_name ?? null,
      plan_group_id: planGroup.id,
      status: 'pending',
    },
  });

  // Notify admin for approval
  const adminChatId = env.ADMIN_CHAT_ID;
  const userInfo =
    `👤 درخواست عضویت جدید\n\n` +
    `📛 نام: ${user.first_name}${user.last_name ? ' ' + user.last_name : ''}\n` +
    `🆔 یوزرنیم: ${user.username ? '@' + user.username : '—'}\n` +
    `🔢 چت آیدی: ${user.chat_id.toString()}\n` +
    `📦 پلن‌گروپ: ${planGroup.name}`;

  try {
    await ctx.telegram.sendMessage(adminChatId, userInfo, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ تأیید', `approve_user_${user.id}`),
          Markup.button.callback('❌ رد', `reject_user_${user.id}`),
        ],
      ]),
    });
  } catch (err) {
    console.error('Failed to notify admin about new user:', err);
  }

  // Bot sends NOTHING to the user — they wait silently
});
