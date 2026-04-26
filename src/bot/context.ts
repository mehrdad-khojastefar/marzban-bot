import { Context, Scenes } from 'telegraf';

export interface SessionData extends Scenes.SceneSessionData {
  lastBotMessageId?: number;
  userId?: number;
  greeting?: string;
  selectedPlanId?: number;
  pendingPaymentId?: number;
  selectedAccountId?: number;

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
  adminCreateStep?: 'chat_id' | 'data_limit' | 'duration' | 'price';
  adminCreateChatId?: number;
  adminCreateDataLimit?: number;
  adminCreateDuration?: number;

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
