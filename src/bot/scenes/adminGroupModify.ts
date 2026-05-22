import { Scenes, Markup } from 'telegraf';
import { BotContext } from '../context';
import { SCENE_ADMIN_GROUP_MODIFY, SCENE_HOME } from './constants';
import { getMessage } from '../services/messageService';
import { sendOrEdit } from '../services/renderService';
import { getDb } from '../../core/db';
import { getMarzban } from '../../core/marzban';
import { toEnglishDigits, formatBytes } from '../../core/utils/format';
import { loadEnv } from '../../core/utils/config';
import {
  resolveAccounts,
  executeBatch,
  hasAnyModification,
  type GroupSelector,
  type Modifications,
  type AccountResult,
} from '../../core/groupModify';

const PAGE_SIZE = 8;
const PROGRESS_EVERY = 5;
const FAILED_LIST_MAX = 30;

function batchConcurrency(): number {
  const raw = parseInt(loadEnv().GROUP_MODIFY_CONCURRENCY);
  if (!Number.isFinite(raw) || raw < 1) return 1;
  return Math.min(raw, 50);
}

export const adminGroupModifyScene = new Scenes.BaseScene<BotContext>(
  SCENE_ADMIN_GROUP_MODIFY,
);

// ── helpers ──────────────────────────────────────────────────────────

function resetState(ctx: BotContext): void {
  ctx.session.groupModifyStep = undefined;
  ctx.session.groupModifyFilterKind = undefined;
  ctx.session.groupModifyFilterPrefix = undefined;
  ctx.session.groupModifyFilterSellerId = undefined;
  ctx.session.groupModifyFilterUserChatId = undefined;
  ctx.session.groupModifyMatchedIds = undefined;
  ctx.session.groupModifySelectedIds = undefined;
  ctx.session.groupModifyPage = undefined;
  ctx.session.groupModifyAddGb = undefined;
  ctx.session.groupModifyAddDays = undefined;
  ctx.session.groupModifyStatus = undefined;
  ctx.session.groupModifyResetTraffic = undefined;
  ctx.session.groupModifyFailedReport = undefined;
  ctx.session.groupModifyFailedIds = undefined;
  ctx.session.groupModifySummaryReport = undefined;
}

function formatSigned(n: number): string {
  return n > 0 ? `+${String(n)}` : String(n);
}

function isAdmin(ctx: BotContext): boolean {
  const env = loadEnv();
  return String(ctx.from?.id ?? '') === env.ADMIN_CHAT_ID;
}

function currentMods(ctx: BotContext): Modifications {
  return {
    addGb: ctx.session.groupModifyAddGb,
    addDays: ctx.session.groupModifyAddDays,
    status: ctx.session.groupModifyStatus,
    resetTraffic: ctx.session.groupModifyResetTraffic,
  };
}

function modCount(mods: Modifications): number {
  let n = 0;
  if (mods.addGb !== undefined) n++;
  if (mods.addDays !== undefined) n++;
  if (mods.status !== undefined) n++;
  if (mods.resetTraffic) n++;
  return n;
}

// ── render: pick filter ──────────────────────────────────────────────

async function renderPickFilter(ctx: BotContext): Promise<void> {
  ctx.session.groupModifyStep = 'pick_filter';
  const title = await getMessage('admin.group_modify.title');
  const prompt = await getMessage('admin.group_modify.pick_filter');
  await sendOrEdit(
    ctx,
    `${title}\n\n${prompt}`,
    Markup.inlineKeyboard([
      [Markup.button.callback('🔤 پیشوند یوزرنیم', 'gm_pick_prefix')],
      [Markup.button.callback('👥 فروشنده', 'gm_pick_seller')],
      [Markup.button.callback('🆔 کاربر (چت آیدی)', 'gm_pick_user')],
      [Markup.button.callback('🔙 بازگشت', 'gm_back_home')],
    ]),
  );
}

// ── render: enter prefix / user chat-id ──────────────────────────────

async function renderPrefixPrompt(ctx: BotContext): Promise<void> {
  ctx.session.groupModifyStep = 'enter_prefix';
  const msg = await getMessage('admin.group_modify.enter_prefix');
  await sendOrEdit(
    ctx,
    msg,
    Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'gm_back_filter')]]),
  );
}

async function renderUserChatIdPrompt(ctx: BotContext): Promise<void> {
  ctx.session.groupModifyStep = 'enter_user_chat_id';
  const msg = await getMessage('admin.group_modify.enter_user_chat_id');
  await sendOrEdit(
    ctx,
    msg,
    Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'gm_back_filter')]]),
  );
}

// ── render: pick seller ──────────────────────────────────────────────

async function renderSellerPicker(ctx: BotContext): Promise<void> {
  ctx.session.groupModifyStep = 'pick_seller';
  const db = getDb();
  const sellers = await db.seller.findMany({
    include: { user: true, _count: { select: { accounts: true } } },
    orderBy: { created_at: 'desc' },
  });

  if (sellers.length === 0) {
    const msg = await getMessage('admin.no_sellers');
    await sendOrEdit(
      ctx,
      msg,
      Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'gm_back_filter')]]),
    );
    return;
  }

  const buttons: ReturnType<typeof Markup.button.callback>[][] = [];
  for (const seller of sellers) {
    const label = seller.user
      ? [seller.user.first_name, seller.user.last_name].filter(Boolean).join(' ')
      : String(seller.chat_id);
    const accountCount = seller._count.accounts;
    const inactive = seller.is_active ? '' : ' ❌';
    buttons.push([
      Markup.button.callback(
        `${label} — ${String(accountCount)} اکانت${inactive}`,
        `gm_seller_${seller.id}`,
      ),
    ]);
  }
  buttons.push([Markup.button.callback('🔙 بازگشت', 'gm_back_filter')]);

  const title = await getMessage('admin.group_modify.pick_seller_title');
  await sendOrEdit(ctx, title, Markup.inlineKeyboard(buttons));
}

// ── resolve & enter preview ──────────────────────────────────────────

async function resolveAndShowPreview(
  ctx: BotContext,
  selector: GroupSelector,
): Promise<void> {
  const db = getDb();
  const accounts = await resolveAccounts(db, selector);

  if (accounts.length === 0) {
    const msg = await getMessage('admin.group_modify.no_matches');
    await sendOrEdit(
      ctx,
      msg,
      Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'gm_back_filter')]]),
    );
    return;
  }

  ctx.session.groupModifyMatchedIds = accounts.map((a) => a.id);
  ctx.session.groupModifySelectedIds = accounts.map((a) => a.id);
  ctx.session.groupModifyPage = 0;
  await renderPreview(ctx);
}

// ── render: preview (checkbox list) ──────────────────────────────────

async function renderPreview(ctx: BotContext): Promise<void> {
  ctx.session.groupModifyStep = 'preview';
  const matched = ctx.session.groupModifyMatchedIds ?? [];
  const selected = ctx.session.groupModifySelectedIds ?? [];
  const page = ctx.session.groupModifyPage ?? 0;

  if (matched.length === 0) {
    await renderPickFilter(ctx);
    return;
  }

  const db = getDb();
  const totalPages = Math.max(1, Math.ceil(matched.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageIds = matched.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const accounts = await db.account.findMany({
    where: { id: { in: pageIds } },
    orderBy: { created_at: 'desc' },
  });
  // preserve original page order (findMany doesn't guarantee insertion order)
  const ordered = pageIds
    .map((id) => accounts.find((a) => a.id === id))
    .filter((a): a is NonNullable<typeof a> => a !== undefined);

  const buttons: ReturnType<typeof Markup.button.callback>[][] = [];
  for (const account of ordered) {
    const isSelected = selected.includes(account.id);
    const checkbox = isSelected ? '☑️' : '☐';
    buttons.push([
      Markup.button.callback(
        `${checkbox} ${account.marzban_username}`,
        `gm_toggle_${account.id}`,
      ),
    ]);
  }

  buttons.push([
    Markup.button.callback('✅ انتخاب همه', 'gm_select_all'),
    Markup.button.callback('❌ لغو انتخاب همه', 'gm_deselect_all'),
  ]);

  if (totalPages > 1) {
    const nav: ReturnType<typeof Markup.button.callback>[] = [];
    if (safePage > 0) nav.push(Markup.button.callback('◀ قبلی', 'gm_prev_page'));
    nav.push(
      Markup.button.callback(
        `${String(safePage + 1)}/${String(totalPages)}`,
        'gm_noop',
      ),
    );
    if (safePage < totalPages - 1) {
      nav.push(Markup.button.callback('بعدی ▶', 'gm_next_page'));
    }
    buttons.push(nav);
  }

  if (selected.length > 0) {
    buttons.push([Markup.button.callback('➡️ ادامه', 'gm_to_queue')]);
  }
  buttons.push([Markup.button.callback('🔙 بازگشت', 'gm_back_filter')]);

  const header = await getMessage('admin.group_modify.preview_title', {
    selected: String(selected.length),
    matched: String(matched.length),
  });
  await sendOrEdit(ctx, header, Markup.inlineKeyboard(buttons));
}

// ── render: build queue ──────────────────────────────────────────────

async function renderBuildQueue(ctx: BotContext): Promise<void> {
  ctx.session.groupModifyStep = 'build_queue';
  const selected = ctx.session.groupModifySelectedIds ?? [];
  const mods = currentMods(ctx);

  const queueLines: string[] = [];
  if (mods.addGb !== undefined) queueLines.push(`• ${formatSigned(mods.addGb)} گیگ`);
  if (mods.addDays !== undefined) queueLines.push(`• ${formatSigned(mods.addDays)} روز`);
  if (mods.status === 'disabled') queueLines.push('• وضعیت → 🚫 بن');
  if (mods.status === 'active') queueLines.push('• وضعیت → ✅ فعال');
  if (mods.resetTraffic) queueLines.push('• 🔄 ریست مصرف');

  const queueText =
    queueLines.length > 0
      ? queueLines.join('\n')
      : await getMessage('admin.group_modify.queue_empty');

  const header = await getMessage('admin.group_modify.queue_title', {
    count: String(selected.length),
  });

  const gbLabel =
    mods.addGb !== undefined ? `📦 حجم (${formatSigned(mods.addGb)})` : '📦 حجم';
  const daysLabel =
    mods.addDays !== undefined ? `⏰ زمان (${formatSigned(mods.addDays)})` : '⏰ زمان';
  const banLabel = mods.status === 'disabled' ? '☑️ 🚫 بن' : '🚫 بن';
  const unbanLabel = mods.status === 'active' ? '☑️ ✅ رفع بن' : '✅ رفع بن';
  const resetLabel = mods.resetTraffic ? '☑️ 🔄 ریست مصرف' : '🔄 ریست مصرف';

  const buttons: ReturnType<typeof Markup.button.callback>[][] = [
    [
      Markup.button.callback(gbLabel, 'gm_op_gb'),
      Markup.button.callback(daysLabel, 'gm_op_days'),
    ],
    [
      Markup.button.callback(banLabel, 'gm_op_ban'),
      Markup.button.callback(unbanLabel, 'gm_op_unban'),
    ],
    [Markup.button.callback(resetLabel, 'gm_op_reset')],
  ];

  if (modCount(mods) > 0) {
    buttons.push([Markup.button.callback('🗑️ پاک‌سازی صف', 'gm_clear_queue')]);
    buttons.push([Markup.button.callback('✅ اعمال تغییرات', 'gm_apply')]);
  }
  buttons.push([Markup.button.callback('🔙 بازگشت به انتخاب', 'gm_back_preview')]);

  await sendOrEdit(
    ctx,
    `${header}\n\n${queueText}`,
    Markup.inlineKeyboard(buttons),
  );
}

// ── render: enter gb / days ──────────────────────────────────────────

async function renderEnterGb(ctx: BotContext): Promise<void> {
  ctx.session.groupModifyStep = 'enter_gb';
  const current = ctx.session.groupModifyAddGb;
  const base = await getMessage('admin.group_modify.enter_gb');
  const hint =
    current !== undefined
      ? `\n\nمقدار فعلی: ${formatSigned(current)} (برای حذف، 0 بفرستید)`
      : '';
  await sendOrEdit(
    ctx,
    base + hint,
    Markup.inlineKeyboard([[Markup.button.callback('🔙 انصراف', 'gm_back_queue')]]),
  );
}

async function renderEnterDays(ctx: BotContext): Promise<void> {
  ctx.session.groupModifyStep = 'enter_days';
  const current = ctx.session.groupModifyAddDays;
  const base = await getMessage('admin.group_modify.enter_days');
  const hint =
    current !== undefined
      ? `\n\nمقدار فعلی: ${formatSigned(current)} (برای حذف، 0 بفرستید)`
      : '';
  await sendOrEdit(
    ctx,
    base + hint,
    Markup.inlineKeyboard([[Markup.button.callback('🔙 انصراف', 'gm_back_queue')]]),
  );
}

// ── render: confirm ──────────────────────────────────────────────────

async function renderConfirm(ctx: BotContext): Promise<void> {
  ctx.session.groupModifyStep = 'confirm';
  const selected = ctx.session.groupModifySelectedIds ?? [];
  const mods = currentMods(ctx);

  const msg = await getMessage('admin.group_modify.confirm', {
    ops_count: String(modCount(mods)),
    accounts_count: String(selected.length),
  });

  await sendOrEdit(
    ctx,
    msg,
    Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ بله، اعمال شود', 'gm_confirm_yes'),
        Markup.button.callback('🔙 خیر', 'gm_back_queue'),
      ],
    ]),
  );
}

// ── execute batch ────────────────────────────────────────────────────

async function executeAndReport(ctx: BotContext): Promise<void> {
  const db = getDb();
  const marzban = getMarzban();
  const selected = ctx.session.groupModifySelectedIds ?? [];
  const mods = currentMods(ctx);

  if (selected.length === 0 || !hasAnyModification(mods)) {
    await renderBuildQueue(ctx);
    return;
  }

  // Hydrate accounts in the order they were originally matched.
  const matched = ctx.session.groupModifyMatchedIds ?? [];
  const orderedIds = matched.filter((id) => selected.includes(id));
  const accounts = await db.account.findMany({
    where: { id: { in: orderedIds } },
  });
  const ordered = orderedIds
    .map((id) => accounts.find((a) => a.id === id))
    .filter((a): a is NonNullable<typeof a> => a !== undefined);

  // Initial progress render
  const initMsg = await getMessage('admin.group_modify.applying', {
    done: '0',
    total: String(ordered.length),
  });
  await sendOrEdit(ctx, initMsg);

  const report = await executeBatch(
    db,
    marzban,
    ordered,
    mods,
    async (done, total) => {
      if (done % PROGRESS_EVERY === 0 || done === total) {
        try {
          const text = await getMessage('admin.group_modify.applying', {
            done: String(done),
            total: String(total),
          });
          await sendOrEdit(ctx, text);
        } catch {
          // ignore edit failures during progress (rate-limit, message unchanged, etc.)
        }
      }
    },
    batchConcurrency(),
  );

  ctx.session.groupModifyFailedReport = buildFailedReport(report.results);
  ctx.session.groupModifySummaryReport = buildSummaryReport(report.results);
  ctx.session.groupModifyFailedIds = report.results
    .filter((r): r is Extract<AccountResult, { ok: false }> => !r.ok)
    .map((r) => r.accountId);
  await renderReport(ctx, report.succeeded, report.failed);
}

function buildFailedReport(results: AccountResult[]): string {
  const failures = results.filter((r): r is Extract<AccountResult, { ok: false }> => !r.ok);
  if (failures.length === 0) return '';
  const head = failures.slice(0, FAILED_LIST_MAX);
  const lines = head.map((r) => `• ${r.username}: ${r.error}`);
  if (failures.length > FAILED_LIST_MAX) {
    lines.push(`… و ${String(failures.length - FAILED_LIST_MAX)} مورد دیگر`);
  }
  return lines.join('\n');
}

function expireToDaysLeft(expire: number | null): string {
  if (expire === null || expire === 0) return 'نامحدود';
  const days = Math.ceil((expire * 1000 - Date.now()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return '۰ روز';
  return `${String(days)} روز`;
}

function dataLimitLabel(bytes: number | null): string {
  if (bytes === null || bytes === 0) return 'نامحدود';
  return formatBytes(bytes);
}

function buildSummaryReport(results: AccountResult[]): string {
  const successes = results.filter(
    (r): r is Extract<AccountResult, { ok: true }> => r.ok,
  );
  if (successes.length === 0) return '';
  const head = successes.slice(0, FAILED_LIST_MAX);
  const lines: string[] = [];
  for (const r of head) {
    const parts: string[] = [`• ${r.username}`];
    if (r.newDataLimit !== null) {
      parts.push(
        `  📦 ${dataLimitLabel(r.previousDataLimit)} → ${dataLimitLabel(r.newDataLimit)}`,
      );
    }
    if (r.newExpire !== null) {
      parts.push(
        `  ⏰ ${expireToDaysLeft(r.previousExpire)} → ${expireToDaysLeft(r.newExpire)}`,
      );
    }
    lines.push(parts.join('\n'));
  }
  if (successes.length > FAILED_LIST_MAX) {
    lines.push(`… و ${String(successes.length - FAILED_LIST_MAX)} مورد دیگر`);
  }
  return lines.join('\n\n');
}

// ── render: report ───────────────────────────────────────────────────

async function renderReport(
  ctx: BotContext,
  ok: number,
  fail: number,
): Promise<void> {
  ctx.session.groupModifyStep = 'report';
  const msg = await getMessage('admin.group_modify.report', {
    ok: String(ok),
    fail: String(fail),
  });

  const buttons: ReturnType<typeof Markup.button.callback>[][] = [];
  const failedIds = ctx.session.groupModifyFailedIds ?? [];
  if (fail > 0 && failedIds.length > 0) {
    buttons.push([Markup.button.callback('🔁 تلاش مجدد ناموفق‌ها', 'gm_retry_failed')]);
  }
  if (ok > 0 && ctx.session.groupModifySummaryReport) {
    buttons.push([Markup.button.callback('📊 خلاصه تغییرات', 'gm_summary_detail')]);
  }
  if (fail > 0 && ctx.session.groupModifyFailedReport) {
    buttons.push([Markup.button.callback('📋 جزئیات ناموفق‌ها', 'gm_failed_detail')]);
  }
  buttons.push([Markup.button.callback('🏠 بازگشت به منو', 'gm_back_home')]);

  await sendOrEdit(ctx, msg, Markup.inlineKeyboard(buttons));
}

// ── scene wiring ─────────────────────────────────────────────────────

adminGroupModifyScene.enter(async (ctx) => {
  if (!isAdmin(ctx)) {
    await ctx.scene.enter(SCENE_HOME);
    return;
  }
  resetState(ctx);
  await renderPickFilter(ctx);
});

adminGroupModifyScene.action('gm_noop', async (ctx) => {
  await ctx.answerCbQuery();
});

// ── pick filter actions ──────────────────────────────────────────────

adminGroupModifyScene.action('gm_pick_prefix', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.groupModifyFilterKind = 'prefix';
  await renderPrefixPrompt(ctx);
});

adminGroupModifyScene.action('gm_pick_seller', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.groupModifyFilterKind = 'seller';
  await renderSellerPicker(ctx);
});

adminGroupModifyScene.action('gm_pick_user', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.groupModifyFilterKind = 'user';
  await renderUserChatIdPrompt(ctx);
});

adminGroupModifyScene.action(/^gm_seller_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery('⏳ در حال جستجو...');
  const sellerId = parseInt(ctx.match[1]);
  ctx.session.groupModifyFilterSellerId = sellerId;
  await resolveAndShowPreview(ctx, { kind: 'seller', sellerId });
});

// ── text input router ────────────────────────────────────────────────

adminGroupModifyScene.on('text', async (ctx) => {
  const step = ctx.session.groupModifyStep;
  const raw = ctx.message.text.trim();

  if (step === 'enter_prefix') {
    if (raw.length === 0) {
      await renderPrefixPrompt(ctx);
      return;
    }
    ctx.session.groupModifyFilterPrefix = raw;
    await resolveAndShowPreview(ctx, { kind: 'prefix', value: raw });
    return;
  }

  if (step === 'enter_user_chat_id') {
    const normalized = toEnglishDigits(raw);
    if (!/^\d+$/.test(normalized)) {
      const msg = await getMessage('admin.group_modify.invalid_chat_id');
      await sendOrEdit(
        ctx,
        msg,
        Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'gm_back_filter')]]),
      );
      return;
    }
    ctx.session.groupModifyFilterUserChatId = normalized;
    await resolveAndShowPreview(ctx, {
      kind: 'user',
      userChatId: BigInt(normalized),
    });
    return;
  }

  if (step === 'enter_gb') {
    const normalized = toEnglishDigits(raw);
    if (!/^-?\d+$/.test(normalized)) {
      const msg = await getMessage('admin.group_modify.invalid_number');
      await sendOrEdit(
        ctx,
        msg,
        Markup.inlineKeyboard([[Markup.button.callback('🔙 انصراف', 'gm_back_queue')]]),
      );
      return;
    }
    const value = parseInt(normalized);
    ctx.session.groupModifyAddGb = value === 0 ? undefined : value;
    await renderBuildQueue(ctx);
    return;
  }

  if (step === 'enter_days') {
    const normalized = toEnglishDigits(raw);
    if (!/^-?\d+$/.test(normalized)) {
      const msg = await getMessage('admin.group_modify.invalid_number');
      await sendOrEdit(
        ctx,
        msg,
        Markup.inlineKeyboard([[Markup.button.callback('🔙 انصراف', 'gm_back_queue')]]),
      );
      return;
    }
    const value = parseInt(normalized);
    ctx.session.groupModifyAddDays = value === 0 ? undefined : value;
    await renderBuildQueue(ctx);
    return;
  }
});

// ── preview actions ──────────────────────────────────────────────────

adminGroupModifyScene.action(/^gm_toggle_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const accountId = parseInt(ctx.match[1]);
  const selected = ctx.session.groupModifySelectedIds ?? [];
  if (selected.includes(accountId)) {
    ctx.session.groupModifySelectedIds = selected.filter((id) => id !== accountId);
  } else {
    ctx.session.groupModifySelectedIds = [...selected, accountId];
  }
  await renderPreview(ctx);
});

adminGroupModifyScene.action('gm_select_all', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.groupModifySelectedIds = [...(ctx.session.groupModifyMatchedIds ?? [])];
  await renderPreview(ctx);
});

adminGroupModifyScene.action('gm_deselect_all', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.groupModifySelectedIds = [];
  await renderPreview(ctx);
});

adminGroupModifyScene.action('gm_prev_page', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.groupModifyPage = Math.max(0, (ctx.session.groupModifyPage ?? 0) - 1);
  await renderPreview(ctx);
});

adminGroupModifyScene.action('gm_next_page', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.groupModifyPage = (ctx.session.groupModifyPage ?? 0) + 1;
  await renderPreview(ctx);
});

adminGroupModifyScene.action('gm_to_queue', async (ctx) => {
  await ctx.answerCbQuery();
  if ((ctx.session.groupModifySelectedIds ?? []).length === 0) {
    await ctx.answerCbQuery('حداقل یک اکانت را انتخاب کنید.', { show_alert: true });
    return;
  }
  await renderBuildQueue(ctx);
});

// ── build_queue actions ──────────────────────────────────────────────

adminGroupModifyScene.action('gm_op_gb', async (ctx) => {
  await ctx.answerCbQuery();
  await renderEnterGb(ctx);
});

adminGroupModifyScene.action('gm_op_days', async (ctx) => {
  await ctx.answerCbQuery();
  await renderEnterDays(ctx);
});

adminGroupModifyScene.action('gm_op_ban', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.groupModifyStatus =
    ctx.session.groupModifyStatus === 'disabled' ? undefined : 'disabled';
  await renderBuildQueue(ctx);
});

adminGroupModifyScene.action('gm_op_unban', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.groupModifyStatus =
    ctx.session.groupModifyStatus === 'active' ? undefined : 'active';
  await renderBuildQueue(ctx);
});

adminGroupModifyScene.action('gm_op_reset', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.groupModifyResetTraffic = !ctx.session.groupModifyResetTraffic;
  await renderBuildQueue(ctx);
});

adminGroupModifyScene.action('gm_clear_queue', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.groupModifyAddGb = undefined;
  ctx.session.groupModifyAddDays = undefined;
  ctx.session.groupModifyStatus = undefined;
  ctx.session.groupModifyResetTraffic = undefined;
  await renderBuildQueue(ctx);
});

adminGroupModifyScene.action('gm_apply', async (ctx) => {
  await ctx.answerCbQuery();
  if (!hasAnyModification(currentMods(ctx))) {
    await ctx.answerCbQuery('صف خالی است.', { show_alert: true });
    return;
  }
  await renderConfirm(ctx);
});

// ── confirm / execute ────────────────────────────────────────────────

adminGroupModifyScene.action('gm_confirm_yes', async (ctx) => {
  await ctx.answerCbQuery('⏳ شروع اعمال...');
  await executeAndReport(ctx);
});

// ── report actions ───────────────────────────────────────────────────

adminGroupModifyScene.action('gm_retry_failed', async (ctx) => {
  await ctx.answerCbQuery('⏳ شروع تلاش مجدد...');
  const failedIds = ctx.session.groupModifyFailedIds ?? [];
  if (failedIds.length === 0) {
    await renderReport(ctx, 0, 0);
    return;
  }
  if (!hasAnyModification(currentMods(ctx))) {
    // queue was cleared — bounce to build_queue so admin can rebuild
    ctx.session.groupModifyMatchedIds = failedIds;
    ctx.session.groupModifySelectedIds = failedIds;
    await renderBuildQueue(ctx);
    return;
  }
  ctx.session.groupModifyMatchedIds = failedIds;
  ctx.session.groupModifySelectedIds = failedIds;
  await executeAndReport(ctx);
});

adminGroupModifyScene.action('gm_failed_detail', async (ctx) => {
  await ctx.answerCbQuery();
  const failedReport = ctx.session.groupModifyFailedReport ?? '—';
  const header = await getMessage('admin.group_modify.report_detail_title');
  await sendOrEdit(
    ctx,
    `${header}\n\n${failedReport}`,
    Markup.inlineKeyboard([[Markup.button.callback('🏠 بازگشت به منو', 'gm_back_home')]]),
  );
});

adminGroupModifyScene.action('gm_summary_detail', async (ctx) => {
  await ctx.answerCbQuery();
  const summary = ctx.session.groupModifySummaryReport ?? '—';
  const header = await getMessage('admin.group_modify.summary_title');
  await sendOrEdit(
    ctx,
    `${header}\n\n${summary}`,
    Markup.inlineKeyboard([[Markup.button.callback('🏠 بازگشت به منو', 'gm_back_home')]]),
  );
});

// ── navigation ───────────────────────────────────────────────────────

adminGroupModifyScene.action('gm_back_filter', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.groupModifyMatchedIds = undefined;
  ctx.session.groupModifySelectedIds = undefined;
  ctx.session.groupModifyPage = undefined;
  ctx.session.groupModifyFilterPrefix = undefined;
  ctx.session.groupModifyFilterSellerId = undefined;
  ctx.session.groupModifyFilterUserChatId = undefined;
  await renderPickFilter(ctx);
});

adminGroupModifyScene.action('gm_back_preview', async (ctx) => {
  await ctx.answerCbQuery();
  await renderPreview(ctx);
});

adminGroupModifyScene.action('gm_back_queue', async (ctx) => {
  await ctx.answerCbQuery();
  await renderBuildQueue(ctx);
});

adminGroupModifyScene.action('gm_back_home', async (ctx) => {
  await ctx.answerCbQuery();
  resetState(ctx);
  await ctx.scene.enter(SCENE_HOME);
});
