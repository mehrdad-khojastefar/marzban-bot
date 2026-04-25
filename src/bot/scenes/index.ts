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
import { sellerPanelScene } from './sellerPanel';
import { sellerCreateAccountScene } from './sellerCreateAccount';
import { sellerAccountsScene } from './sellerAccounts';
import { sellerViewAccountScene } from './sellerViewAccount';
import { sellerReportScene } from './sellerReport';
import { adminSellersScene } from './adminSellers';
import { adminSellerDetailScene } from './adminSellerDetail';
import { adminSellerPlansScene } from './adminSellerPlans';
import { adminSellerAccountsScene } from './adminSellerAccounts';

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
  SCENE_SELLER_PANEL,
  SCENE_SELLER_CREATE_ACCOUNT,
  SCENE_SELLER_ACCOUNTS,
  SCENE_SELLER_VIEW_ACCOUNT,
  SCENE_SELLER_REPORT,
  SCENE_ADMIN_SELLERS,
  SCENE_ADMIN_SELLER_DETAIL,
  SCENE_ADMIN_SELLER_PLANS,
  SCENE_ADMIN_SELLER_ACCOUNTS,
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
    sellerPanelScene,
    sellerCreateAccountScene,
    sellerAccountsScene,
    sellerViewAccountScene,
    sellerReportScene,
    adminSellersScene,
    adminSellerDetailScene,
    adminSellerPlansScene,
    adminSellerAccountsScene,
  ]);
}
