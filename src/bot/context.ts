import { Context, Scenes } from 'telegraf';

export interface SessionData extends Scenes.SceneSessionData {
  userId?: number;
  selectedPlanId?: number;
  pendingPaymentId?: number;
  selectedAccountId?: number;
}

export interface BotContext extends Context {
  session: SessionData;
  scene: Scenes.SceneContextScene<BotContext>;
}
