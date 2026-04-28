import { Context, Scenes } from 'telegraf';

export interface SessionData extends Scenes.SceneSessionData {
  lastBotMessageId?: number;
  userId?: number;
  greeting?: string;
  selectedPlanId?: number;
  selectedGb?: number;
  pendingPaymentId?: number;
  pendingTransactionId?: number;
  selectedAccountId?: number;
  awaitingRename?: boolean;

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
  adminUserStep?: 'chat_id' | 'select_card';
  pendingUserChatId?: string;
  managingUserId?: number;

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
}

export interface BotContext extends Context {
  session: SessionData;
  scene: Scenes.SceneContextScene<BotContext>;
}
