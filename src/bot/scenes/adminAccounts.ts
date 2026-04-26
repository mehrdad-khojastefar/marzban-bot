import crypto from 'node:crypto';
import { Scenes, Markup } from 'telegraf';
import { Prisma } from '@prisma/client';
import { BotContext } from '../context';
import { SCENE_ADMIN_ACCOUNTS, SCENE_ADMIN_VIEW_ACCOUNT, SCENE_HOME } from './constants';
import { sendOrEdit } from '../services/renderService';
import { getDb } from '../../core/db';
import { getMarzban, buildProxiesAndInbounds } from '../../core/marzban';
import { formatPrice, formatBytes, toPersianDigits, buildSubUrl, renameConfigLinks } from '../../core/utils/format';
import { loadEnv } from '../../core/utils/config';

const PAGE_SIZE = 8;

function generateUsername(): string {
  return 'a_' + crypto.randomBytes(3).toString('hex').slice(0, 6);
}

function formatJalaliDate(date: Date): string {
  return toPersianDigits(
    date.toLocaleDateString('fa-IR', { year: 'numeric', month: '2-digit', day: '2-digit' }),
  );
}

export const adminAccountsScene = new Scenes.BaseScene<BotContext>(SCENE_ADMIN_ACCOUNTS);

async function renderAccountList(ctx: BotContext) {
  const env = loadEnv();
  if (String(ctx.from!.id) !== env.ADMIN_CHAT_ID) {
    await ctx.scene.enter(SCENE_HOME);
    return;
  }

  ctx.session.adminCreateStep = undefined;

  const db = getDb();
  const page = ctx.session.currentPage ?? 0;
  const filter = ctx.session.accountFilter ?? 'all';
  const search = ctx.session.searchQuery;

  const where: Prisma.AccountWhereInput = { seller_id: { not: null } };

  if (filter === 'unpaid') {
    where.payment_status = 'unpaid';
  } else if (filter === 'paid') {
    where.payment_status = 'paid';
  }

  if (search) {
    where.OR = [
      { marzban_username: { contains: search, mode: 'insensitive' } },
      { note: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [accounts, totalCount] = await Promise.all([
    db.account.findMany({
      where,
      include: {
        seller_plan: true,
        seller: { include: { user: true } },
      },
      orderBy: { created_at: 'desc' },
      skip: page * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.account.count({ where }),
  ]);

  // Stats
  const [totalAccounts, unpaidCount, unpaidSum] = await Promise.all([
    db.account.count({ where: { seller_id: { not: null } } }),
    db.account.count({ where: { seller_id: { not: null }, payment_status: 'unpaid' } }),
    db.account.findMany({
      where: { seller_id: { not: null }, payment_status: 'unpaid' },
      select: { price: true },
    }),
  ]);
  const totalDebt = unpaidSum.reduce((sum, a) => sum + (a.price ?? 0), 0);

  let header =
    `📋 مدیریت اکانت‌ها\n\n` +
    `کل: ${toPersianDigits(String(totalAccounts))} | ` +
    `پرداخت‌نشده: ${toPersianDigits(String(unpaidCount))} | ` +
    `بدهی: ${formatPrice(totalDebt)}`;

  if (search) {
    header += `\n🔍 جستجو: "${search}" (${toPersianDigits(String(totalCount))} نتیجه)`;
  }

  // Filter buttons
  const filterButtons = [
    Markup.button.callback(filter === 'all' ? '» همه «' : 'همه', 'filter_all'),
    Markup.button.callback(
      filter === 'unpaid' ? '» ⬜ پرداخت‌نشده «' : '⬜ پرداخت‌نشده',
      'filter_unpaid',
    ),
    Markup.button.callback(
      filter === 'paid' ? '» ✅ پرداخت‌شده «' : '✅ پرداخت‌شده',
      'filter_paid',
    ),
  ];

  const buttons: ReturnType<typeof Markup.button.callback>[][] = [
    [Markup.button.callback('➕ ساخت اکانت', 'create_account')],
    filterButtons,
  ];

  // Search button
  buttons.push([
    search
      ? Markup.button.callback('❌ پاک کردن جستجو', 'clear_search')
      : Markup.button.callback('🔍 جستجو', 'search'),
  ]);

  if (totalCount === 0) {
    buttons.push([Markup.button.callback('🔙 بازگشت', 'back_home')]);
    await sendOrEdit(ctx, header + '\n\nاکانتی یافت نشد.', Markup.inlineKeyboard(buttons));
    return;
  }

  for (const account of accounts) {
    const isPaid = account.payment_status === 'paid';
    const statusIcon = isPaid ? '✅' : '⬜';
    const price = account.price ? formatPrice(account.price) : '—';
    const sellerName = account.seller?.user
      ? account.seller.user.first_name
      : String(account.seller?.chat_id ?? '?');

    const label = `${statusIcon} ${account.marzban_username} | ${sellerName} | ${price}`;
    buttons.push([Markup.button.callback(label, `view_${account.id}`)]);
  }

  // Pagination
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  if (totalPages > 1) {
    const navButtons: ReturnType<typeof Markup.button.callback>[] = [];
    if (page > 0) {
      navButtons.push(Markup.button.callback('◀ قبلی', 'prev_page'));
    }
    navButtons.push(
      Markup.button.callback(
        `صفحه ${toPersianDigits(String(page + 1))} از ${toPersianDigits(String(totalPages))}`,
        'noop',
      ),
    );
    if (page < totalPages - 1) {
      navButtons.push(Markup.button.callback('بعدی ▶', 'next_page'));
    }
    buttons.push(navButtons);
  }

  buttons.push([Markup.button.callback('🔙 بازگشت', 'back_home')]);

  await sendOrEdit(ctx, header, Markup.inlineKeyboard(buttons));
}

adminAccountsScene.enter(async (ctx) => {
  ctx.session.currentPage = 0;
  ctx.session.accountFilter = 'all';
  ctx.session.searchQuery = undefined;
  ctx.session.adminCreateStep = undefined;
  await renderAccountList(ctx);
});

// --- Create account flow ---
adminAccountsScene.action('create_account', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.adminCreateStep = 'chat_id';
  await sendOrEdit(
    ctx,
    '➕ ساخت اکانت جدید\n\nچت آیدی کاربر را وارد کنید:',
    Markup.inlineKeyboard([[Markup.button.callback('🔙 انصراف', 'cancel_create')]]),
  );
});

adminAccountsScene.action('confirm_create', async (ctx) => {
  await ctx.answerCbQuery();

  const chatId = ctx.session.adminCreateChatId;
  const dataLimit = ctx.session.adminCreateDataLimit;
  const duration = ctx.session.adminCreateDuration;
  const price = ctx.session.pendingPrice;

  if (!chatId || !dataLimit || !duration || price === undefined) {
    await renderAccountList(ctx);
    return;
  }

  const db = getDb();

  // Find or create user
  let user = await db.user.findUnique({ where: { chat_id: BigInt(chatId) } });
  if (!user) {
    user = await db.user.create({
      data: {
        chat_id: BigInt(chatId),
        first_name: String(chatId),
      },
    });
  }

  try {
    const marzban = getMarzban();
    const marzbanUsername = generateUsername();
    const expireTimestamp = Math.floor(Date.now() / 1000) + duration * 24 * 60 * 60;
    const expiresAt = new Date(expireTimestamp * 1000);

    const { proxies, inbounds } = await buildProxiesAndInbounds();

    const marzbanUser = await marzban.addUser({
      username: marzbanUsername,
      proxies,
      inbounds,
      data_limit: dataLimit,
      expire: expireTimestamp,
      status: 'active',
    });

    const account = await db.account.create({
      data: {
        user_id: user.id,
        marzban_username: marzbanUsername,
        type: 'paid',
        payment_status: price > 0 ? 'unpaid' : 'paid',
        price,
        expires_at: expiresAt,
      },
    });

    const env = loadEnv();
    const subUrl = buildSubUrl(env.SUB_BASE_URL, marzbanUser.proxies, marzbanUsername);

    let linksText = `\n\n🔗 لینک اشتراک:\n<pre>${subUrl}</pre>`;
    if (marzbanUser.links && marzbanUser.links.length > 0) {
      const renamed = renameConfigLinks(marzbanUser.links, env.CONFIG_LINK_PREFIX, marzbanUsername);
      linksText += `\n📋 لینک‌های مستقیم:\n<pre>${renamed.join('\n')}</pre>`;
    }

    ctx.session.adminCreateStep = undefined;
    ctx.session.selectedAccountId = account.id;

    await sendOrEdit(
      ctx,
      `✅ اکانت ساخته شد!\n\n` +
        `📛 نام: ${marzbanUsername}\n` +
        `👤 چت آیدی: ${chatId}\n` +
        `📊 حجم: ${formatBytes(dataLimit)}\n` +
        `⏰ مدت: ${toPersianDigits(String(duration))} روز\n` +
        `💰 قیمت: ${formatPrice(price)}\n` +
        `📅 انقضا: ${formatJalaliDate(expiresAt)}` +
        linksText,
      Markup.inlineKeyboard([
        [Markup.button.callback('🔧 مدیریت اکانت', 'manage_created')],
        [Markup.button.callback('🔙 بازگشت به لیست', 'back_list')],
      ]),
    );
  } catch (err) {
    console.error('Admin account provisioning failed:', err);
    await sendOrEdit(
      ctx,
      'خطا در ساخت اکانت.',
      Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'back_list')]]),
    );
  }
});

adminAccountsScene.action('manage_created', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.adminAccountsFrom = 'global';
  await ctx.scene.enter(SCENE_ADMIN_VIEW_ACCOUNT);
});

adminAccountsScene.action('cancel_create', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.adminCreateStep = undefined;
  await renderAccountList(ctx);
});

// --- Text input handler ---
adminAccountsScene.on('text', async (ctx) => {
  const input = ctx.message.text.trim();
  const backButton = Markup.inlineKeyboard([
    [Markup.button.callback('🔙 انصراف', 'cancel_create')],
  ]);

  // Create flow: chat_id step
  if (ctx.session.adminCreateStep === 'chat_id') {
    const chatId = parseInt(input);
    if (isNaN(chatId) || chatId <= 0) {
      await sendOrEdit(ctx, 'چت آیدی نامعتبر است. عدد وارد کنید:', backButton);
      return;
    }
    ctx.session.adminCreateChatId = chatId;
    ctx.session.adminCreateStep = 'data_limit';
    await sendOrEdit(ctx, 'حجم را به گیگابایت وارد کنید:', backButton);
    return;
  }

  // Create flow: data_limit step
  if (ctx.session.adminCreateStep === 'data_limit') {
    const gb = parseFloat(input);
    if (isNaN(gb) || gb <= 0) {
      await sendOrEdit(ctx, 'عدد معتبر وارد کنید:', backButton);
      return;
    }
    ctx.session.adminCreateDataLimit = Math.round(gb * 1073741824);
    ctx.session.adminCreateStep = 'duration';
    await sendOrEdit(ctx, 'مدت اعتبار را به روز وارد کنید:', backButton);
    return;
  }

  // Create flow: duration step
  if (ctx.session.adminCreateStep === 'duration') {
    const days = parseInt(input);
    if (isNaN(days) || days <= 0) {
      await sendOrEdit(ctx, 'عدد معتبر وارد کنید:', backButton);
      return;
    }
    ctx.session.adminCreateDuration = days;
    ctx.session.adminCreateStep = 'price';
    await sendOrEdit(ctx, 'قیمت را به تومان وارد کنید (۰ برای رایگان):', backButton);
    return;
  }

  // Create flow: price step → show confirmation
  if (ctx.session.adminCreateStep === 'price') {
    const price = parseInt(input);
    if (isNaN(price) || price < 0) {
      await sendOrEdit(ctx, 'عدد معتبر وارد کنید:', backButton);
      return;
    }
    ctx.session.pendingPrice = price;

    const chatId = ctx.session.adminCreateChatId!;
    const dataLimit = ctx.session.adminCreateDataLimit!;
    const duration = ctx.session.adminCreateDuration!;
    const expiresAt = new Date(Date.now() + duration * 24 * 60 * 60 * 1000);

    await sendOrEdit(
      ctx,
      `⚠️ تأیید ساخت اکانت\n\n` +
        `👤 چت آیدی: ${chatId}\n` +
        `📊 حجم: ${formatBytes(dataLimit)}\n` +
        `⏰ مدت: ${toPersianDigits(String(duration))} روز\n` +
        `💰 قیمت: ${formatPrice(price)}\n` +
        `📅 انقضا: ${formatJalaliDate(expiresAt)}\n\n` +
        `آیا مطمئن هستید؟`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ تأیید و ساخت', 'confirm_create'),
          Markup.button.callback('❌ انصراف', 'cancel_create'),
        ],
      ]),
    );
    return;
  }

  // Search flow (no create step active)
  if (!ctx.session.adminCreateStep) {
    ctx.session.searchQuery = input;
    ctx.session.currentPage = 0;
    await renderAccountList(ctx);
  }
});

// --- View account ---
adminAccountsScene.action(/^view_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.selectedAccountId = parseInt(ctx.match[1]);
  ctx.session.adminAccountsFrom = 'global';
  await ctx.scene.enter(SCENE_ADMIN_VIEW_ACCOUNT);
});

// --- Search ---
adminAccountsScene.action('search', async (ctx) => {
  await ctx.answerCbQuery();
  await sendOrEdit(
    ctx,
    'نام اکانت یا یادداشت را جستجو کنید:',
    Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'back_list')]]),
  );
});

adminAccountsScene.action('clear_search', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.searchQuery = undefined;
  ctx.session.currentPage = 0;
  await renderAccountList(ctx);
});

adminAccountsScene.action('back_list', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.adminCreateStep = undefined;
  await renderAccountList(ctx);
});

// --- Filters ---
adminAccountsScene.action('filter_all', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.accountFilter = 'all';
  ctx.session.currentPage = 0;
  await renderAccountList(ctx);
});

adminAccountsScene.action('filter_unpaid', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.accountFilter = 'unpaid';
  ctx.session.currentPage = 0;
  await renderAccountList(ctx);
});

adminAccountsScene.action('filter_paid', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.accountFilter = 'paid';
  ctx.session.currentPage = 0;
  await renderAccountList(ctx);
});

// --- Pagination ---
adminAccountsScene.action('prev_page', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.currentPage = Math.max(0, (ctx.session.currentPage ?? 0) - 1);
  await renderAccountList(ctx);
});

adminAccountsScene.action('next_page', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.currentPage = (ctx.session.currentPage ?? 0) + 1;
  await renderAccountList(ctx);
});

adminAccountsScene.action('noop', async (ctx) => {
  await ctx.answerCbQuery();
});

adminAccountsScene.action('back_home', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.scene.enter(SCENE_HOME);
});
