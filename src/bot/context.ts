import { Context, Scenes } from 'telegraf';
import type { AccountPaymentStatus, UserStatus } from '@prisma/client';
import type { Logger } from 'pino';

/**
 * Slim cached view of the Account row currently being managed by the admin in
 * SCENE_ADMIN_VIEW_ACCOUNT. Populated once per scene by `renderDetail`; read
 * by the simple action handlers so they don't each re-query the DB just to
 * resolve `marzban_username` / `payment_status` / `seller_*` ids.
 */
export interface ViewedAccountCache {
  id: number;
  marzban_username: string;
  payment_status: AccountPaymentStatus | null;
  seller_id: number | null;
  seller_plan_id: number | null;
}

/**
 * Slim view of the User row attached to every update by `attachUser`
 * middleware. Keep this aligned with the `select` in
 * `src/bot/middlewares/attachUser.ts`.
 */
export interface AttachedUser {
  id: number;
  chat_id: bigint;
  status: UserStatus;
  has_test: boolean;
  bank_card_id: number | null;
  plan_group_id: number | null;
  first_name: string;
  last_name: string | null;
  username: string | null;
}

export interface BotState {
  user?: AttachedUser | null;
  requestId?: string;
  log?: Logger;
}

export interface SessionData extends Scenes.SceneSessionData {
  lastBotMessageId?: number;
  userId?: number;
  greeting?: string;
  selectedPlanId?: number;
  selectedGb?: number;
  pendingPaymentId?: number;
  pendingTransactionId?: number;
  selectedAccountId?: number;
  viewedAccount?: ViewedAccountCache;
  awaitingRename?: boolean;
  renewAccountId?: number;

  // seller flows
  sellerId?: number;
  selectedSellerPlanId?: number;
  awaitingQuantity?: boolean;
  awaitingAccountName?: boolean;
  pendingDataLimit?: number;
  pendingPrice?: number;
  pendingPlanName?: string;

  // admin account management
  adminEditField?: 'data_limit' | 'expire' | 'price' | 'note';
  adminAccountsFrom?: 'seller' | 'global';
  adminCreateStep?: 'chat_id' | 'select_plan' | 'custom_gb' | 'custom_price' | 'data_limit' | 'duration' | 'price';
  adminCreateChatId?: number;
  adminCreateDataLimit?: number;
  adminCreateDuration?: number;
  adminCreateSellerPlanId?: number;

  // admin bank card management
  adminCardStep?: 'number' | 'holder' | 'bank';
  pendingCardNumber?: string;
  pendingCardHolder?: string;
  managingCardId?: number;

  // admin user management
  adminUserStep?: 'chat_id' | 'select_cards';
  pendingUserChatId?: string;
  managingUserId?: number;
  selectedCardIds?: number[];

  // admin plan group management
  adminPlanStep?: 'gb' | 'price';
  pendingPlanGb?: number;
  managingGroupId?: number;

  // admin seller management
  managingSellerId?: number;
  sellerEditField?: 'note' | 'link_prefix';
  managingSellerPlanId?: number;
  accountFilter?: 'all' | 'unpaid' | 'paid';
  selectedAccountIds?: number[];
  currentPage?: number;
  searchQuery?: string;

  // admin group modifications
  groupModifyStep?:
    | 'pick_filter'
    | 'enter_prefix'
    | 'pick_seller'
    | 'enter_user_chat_id'
    | 'preview'
    | 'build_queue'
    | 'enter_gb'
    | 'enter_days'
    | 'confirm'
    | 'report';
  groupModifyFilterKind?: 'prefix' | 'seller' | 'user';
  groupModifyFilterPrefix?: string;
  groupModifyFilterSellerId?: number;
  groupModifyFilterUserChatId?: string;
  groupModifyMatchedIds?: number[];
  groupModifySelectedIds?: number[];
  groupModifyPage?: number;
  groupModifyAddGb?: number;
  groupModifyAddDays?: number;
  groupModifyStatus?: 'active' | 'disabled';
  groupModifyResetTraffic?: boolean;
  groupModifyFailedReport?: string;
  groupModifyFailedIds?: number[];
  groupModifySummaryReport?: string;

  // admin move account ownership
  moveAccountStep?: 'wait_contact' | 'confirm';
  moveAccountTargetUserId?: number;
  moveAccountReplyMsgId?: number;
}

export interface BotContext extends Context {
  session: SessionData;
  scene: Scenes.SceneContextScene<BotContext>;
  state: BotState;
}
