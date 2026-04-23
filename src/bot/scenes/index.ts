import { Scenes } from 'telegraf';
import { BotContext } from '../context';
import { startScene } from './start';
import { homeScene } from './home';
import { buyAccountScene } from './buyAccount';
import { paymentPendingScene } from './paymentPending';
import { manageAccountsScene } from './manageAccounts';
import { viewAccountScene } from './viewAccount';
import { testAccountScene } from './testAccount';
import { supportScene } from './support';
import { errorScene } from './error';

export {
  SCENE_START,
  SCENE_HOME,
  SCENE_BUY_ACCOUNT,
  SCENE_PAYMENT_PENDING,
  SCENE_MANAGE_ACCOUNTS,
  SCENE_VIEW_ACCOUNT,
  SCENE_TEST_ACCOUNT,
  SCENE_SUPPORT,
  SCENE_ERROR,
} from './constants';

export function createStage(): Scenes.Stage<BotContext> {
  return new Scenes.Stage<BotContext>([
    startScene,
    homeScene,
    buyAccountScene,
    paymentPendingScene,
    manageAccountsScene,
    viewAccountScene,
    testAccountScene,
    supportScene,
    errorScene,
  ]);
}
