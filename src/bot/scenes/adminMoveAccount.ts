import { Scenes, Markup } from 'telegraf';
import { BotContext } from '../context';
import { SCENE_ADMIN_MOVE_ACCOUNT, SCENE_ADMIN_VIEW_ACCOUNT } from './constants';
import { getMessage } from '../services/messageService';
import { sendOrEdit } from '../services/renderService';
import { getDb } from '../../core/db';
import { loadEnv } from '../../core/utils/config';
import { actorFrom } from '../../core/events';
import { moveAccountOwnership, type MoveAccountError } from '../../core/moveAccount';

export const adminMoveAccountScene = new Scenes.BaseScene<BotContext>(
  SCENE_ADMIN_MOVE_ACCOUNT,
);

function ownerLabel(user: {
  first_name: string;
  last_name: string | null;
  username: string | null;
  chat_id: bigint;
}): string {
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ');
  const handle = user.username ? ` @${user.username}` : '';
  return `${name}${handle}`;
}

function cancelKeyboard() {
  return Markup.inlineKeyboard([[Markup.button.callback('🔙 انصراف', 'cancel_move')]]);
}

function resetSession(ctx: BotContext): void {
  ctx.session.moveAccountStep = undefined;
  ctx.session.moveAccountTargetUserId = undefined;
  ctx.session.moveAccountReplyMsgId = undefined;
}

async function dismissReplyKeyboard(ctx: BotContext): Promise<void> {
  if (!ctx.chat) return;

  // Remove the throwaway prompt message that carried the reply keyboard.
  const replyMsgId = ctx.session.moveAccountReplyMsgId;
  if (replyMsgId) {
    try {
      await ctx.telegram.deleteMessage(ctx.chat.id, replyMsgId);
    } catch {
      // already deleted or expired
    }
    ctx.session.moveAccountReplyMsgId = undefined;
  }

  // Some clients keep the reply keyboard visible until a message with
  // remove_keyboard arrives. Send a zero-width space + remove_keyboard,
  // then delete it immediately so the chat stays clean.
  try {
    const sent = await ctx.telegram.sendMessage(ctx.chat.id, '​', {
      reply_markup: { remove_keyboard: true },
    });
    await ctx.telegram.deleteMessage(ctx.chat.id, sent.message_id).catch(() => {});
  } catch {
    // ignore
  }
}

async function backToDetail(ctx: BotContext): Promise<void> {
  await dismissReplyKeyboard(ctx);
  resetSession(ctx);
  await ctx.scene.enter(SCENE_ADMIN_VIEW_ACCOUNT);
}

adminMoveAccountScene.enter(async (ctx) => {
  const env = loadEnv();
  if (String(ctx.from?.id) !== env.ADMIN_CHAT_ID) {
    await ctx.scene.enter(SCENE_ADMIN_VIEW_ACCOUNT);
    return;
  }

  const accountId = ctx.session.selectedAccountId;
  if (!accountId) {
    await ctx.scene.enter(SCENE_ADMIN_VIEW_ACCOUNT);
    return;
  }

  const db = getDb();
  const account = await db.account.findUnique({
    where: { id: accountId },
    include: { user: true },
  });
  if (!account) {
    await ctx.scene.enter(SCENE_ADMIN_VIEW_ACCOUNT);
    return;
  }

  ctx.session.moveAccountStep = 'wait_contact';
  ctx.session.moveAccountTargetUserId = undefined;

  const prompt = await getMessage('admin.move_account_prompt', {
    username: account.marzban_username,
    currentOwner: ownerLabel(account.user),
  });
  await sendOrEdit(ctx, prompt, cancelKeyboard());

  if (!ctx.chat) return;

  const buttonLabel = await getMessage('admin.move_account_share_contact_button');
  const sent = await ctx.telegram.sendMessage(
    ctx.chat.id,
    await getMessage('admin.move_account_send_contact'),
    Markup.keyboard([Markup.button.contactRequest(buttonLabel)])
      .oneTime()
      .resize(),
  );
  ctx.session.moveAccountReplyMsgId = sent.message_id;
});

adminMoveAccountScene.on('contact', async (ctx) => {
  if (ctx.session.moveAccountStep !== 'wait_contact') return;

  const accountId = ctx.session.selectedAccountId;
  if (!accountId) {
    await backToDetail(ctx);
    return;
  }

  const contactUserId = ctx.message.contact.user_id;
  if (!contactUserId) {
    const msg = await getMessage('admin.move_account_contact_no_user_id');
    await sendOrEdit(ctx, msg, cancelKeyboard());
    return;
  }

  const db = getDb();
  const account = await db.account.findUnique({
    where: { id: accountId },
    include: { user: true },
  });
  if (!account) {
    await backToDetail(ctx);
    return;
  }

  const target = await db.user.findUnique({
    where: { chat_id: BigInt(contactUserId) },
  });
  if (!target) {
    const msg = await getMessage('admin.move_account_user_not_registered');
    await sendOrEdit(ctx, msg, cancelKeyboard());
    return;
  }
  if (target.status !== 'approved') {
    const msg = await getMessage('admin.move_account_user_not_approved');
    await sendOrEdit(ctx, msg, cancelKeyboard());
    return;
  }
  if (target.id === account.user_id) {
    const msg = await getMessage('admin.move_account_same_owner');
    await sendOrEdit(ctx, msg, cancelKeyboard());
    return;
  }

  ctx.session.moveAccountTargetUserId = target.id;
  ctx.session.moveAccountStep = 'confirm';

  await dismissReplyKeyboard(ctx);

  const confirm = await getMessage('admin.move_account_confirm', {
    username: account.marzban_username,
    fromName: ownerLabel(account.user),
    fromChatId: String(account.user.chat_id),
    toName: ownerLabel(target),
    toChatId: String(target.chat_id),
  });
  await sendOrEdit(
    ctx,
    confirm,
    Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ بله، نقل بده', 'confirm_move'),
        Markup.button.callback('🔙 انصراف', 'cancel_move'),
      ],
    ]),
  );
});

adminMoveAccountScene.on('text', async (ctx) => {
  if (ctx.session.moveAccountStep !== 'wait_contact') return;
  const msg = await getMessage('admin.move_account_send_contact');
  await sendOrEdit(ctx, msg, cancelKeyboard());
});

adminMoveAccountScene.action('confirm_move', async (ctx) => {
  await ctx.answerCbQuery();
  if (ctx.session.moveAccountStep !== 'confirm') {
    await backToDetail(ctx);
    return;
  }

  const accountId = ctx.session.selectedAccountId;
  const newUserId = ctx.session.moveAccountTargetUserId;
  if (!accountId || !newUserId) {
    await backToDetail(ctx);
    return;
  }

  const db = getDb();
  const result = await moveAccountOwnership({
    db,
    accountId,
    newUserId,
    actor: actorFrom(ctx.from),
  });

  if (!result.ok) {
    const msg = await failureMessage(result.error);
    await sendOrEdit(
      ctx,
      msg,
      Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'cancel_move')]]),
    );
    return;
  }

  const target = await db.user.findUnique({ where: { id: newUserId } });
  const done = await getMessage('admin.move_account_done', {
    toName: target ? ownerLabel(target) : '',
  });
  await sendOrEdit(
    ctx,
    done,
    Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'cancel_move')]]),
  );
  resetSession(ctx);
});

adminMoveAccountScene.action('cancel_move', async (ctx) => {
  await ctx.answerCbQuery();
  await backToDetail(ctx);
});

async function failureMessage(error: MoveAccountError): Promise<string> {
  switch (error) {
    case 'account_not_found':
      return getMessage('admin.move_account_failed');
    case 'user_not_found':
      return getMessage('admin.move_account_user_not_registered');
    case 'user_not_approved':
      return getMessage('admin.move_account_user_not_approved');
    case 'same_owner':
      return getMessage('admin.move_account_same_owner');
  }
}
