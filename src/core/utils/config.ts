import { z } from 'zod/v4';

export const envSchema = z.object({
  DATABASE_URL: z.string(),
  TELEGRAM_BOT_TOKEN: z.string(),
  MARZBAN_API_URL: z.string().url(),
  MARZBAN_USERNAME: z.string(),
  MARZBAN_PASSWORD: z.string(),
  ADMIN_CHAT_ID: z.string(),
  CHANNEL_ID: z.string().optional(),
  CHANNEL_INVITE_LINK: z.string().optional(),
  SUPPORT_USERNAME: z.string(),
  SUB_BASE_URL: z.string().url(),
  MARZBAN_SUB_URL: z.string().url(),
  SUB_PORT: z.string().default('8085'),
  CONFIG_LINK_PREFIX: z.string().default('🕊️ 🇩🇪  DE|'),
  // Premzy payment gateway (optional — only needed when payment_method = premzy)
  PREMZY_VENDOR_ID: z.string().optional(),
  PREMZY_VENDOR_TOKEN: z.string().optional(),
  PREMZY_EC_PRIVATE_KEY_PATH: z.string().optional(),
  PREMZY_CALLBACK_PORT: z.string().default('8086'),

  // Event tracking — forum supergroup + per-category topic IDs
  LOG_GROUP_ID: z.string(),
  LOG_TOPIC_USERS: z.coerce.number().int(),
  LOG_TOPIC_PAYMENTS: z.coerce.number().int(),
  LOG_TOPIC_ACCOUNTS: z.coerce.number().int(),
  LOG_TOPIC_ADMIN: z.coerce.number().int(),
  LOG_TOPIC_SELLER: z.coerce.number().int(),
  LOG_TOPIC_ERRORS: z.coerce.number().int(),
  LOG_TOPIC_SYSTEM: z.coerce.number().int(),

  SOCKS5_PROXY: z.string().optional(),
  NODE_ENV: z.string().optional(),

  // Admin: how many Marzban modify calls to run in parallel during a group-modify batch.
  GROUP_MODIFY_CONCURRENCY: z.string().default('8'),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Missing or invalid environment variables:\n${issues}`);
  }
  return result.data;
}
