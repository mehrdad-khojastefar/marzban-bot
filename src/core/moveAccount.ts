import { Account, PrismaClient } from '@prisma/client';
import { logEvent, type EventActor } from './events';

export type MoveAccountError =
  | 'account_not_found'
  | 'user_not_found'
  | 'user_not_approved'
  | 'same_owner';

export type MoveAccountResult =
  | { ok: true; account: Account; fromUserId: number; fromChatId: bigint }
  | { ok: false; error: MoveAccountError };

interface MoveAccountArgs {
  db: PrismaClient;
  accountId: number;
  newUserId: number;
  actor?: EventActor;
}

export async function moveAccountOwnership(
  args: MoveAccountArgs,
): Promise<MoveAccountResult> {
  const { db, accountId, newUserId, actor } = args;

  const account = await db.account.findUnique({
    where: { id: accountId },
    include: { user: true },
  });
  if (!account) {
    return { ok: false, error: 'account_not_found' };
  }

  const newUser = await db.user.findUnique({ where: { id: newUserId } });
  if (!newUser) {
    return { ok: false, error: 'user_not_found' };
  }
  if (newUser.status !== 'approved') {
    return { ok: false, error: 'user_not_approved' };
  }
  if (newUser.id === account.user_id) {
    return { ok: false, error: 'same_owner' };
  }

  // Single-field update — seller_id is intentionally not in `data`, so it is preserved.
  const updated = await db.account.update({
    where: { id: accountId },
    data: { user_id: newUserId },
  });

  logEvent(
    'admin.account_ownership_moved',
    {
      accountId: account.id,
      marzbanUsername: account.marzban_username,
      fromUserId: account.user_id,
      fromChatId: account.user.chat_id,
      toUserId: newUser.id,
      toChatId: newUser.chat_id,
    },
    actor,
  );

  return {
    ok: true,
    account: updated,
    fromUserId: account.user_id,
    fromChatId: account.user.chat_id,
  };
}
