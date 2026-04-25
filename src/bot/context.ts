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
  pendingDataLimit?: number;
  pendingPrice?: number;
  pendingPlanName?: string;

  // admin account management
  adminEditField?: 'data_limit' | 'expire';

  // admin seller management
  managingSellerId?: number;
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
