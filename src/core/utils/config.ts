import { z } from 'zod/v4';

export const envSchema = z.object({
  DATABASE_URL: z.string(),
  TELEGRAM_BOT_TOKEN: z.string(),
  MARZBAN_API_URL: z.string().url(),
  MARZBAN_USERNAME: z.string(),
  MARZBAN_PASSWORD: z.string(),
  ADMIN_CHAT_ID: z.string(),
  CARD_NUMBER: z.string(),
  SUPPORT_USERNAME: z.string(),
  SUB_BASE_URL: z.string().url(),
  MARZBAN_SUB_URL: z.string().url(),
  SUB_PORT: z.string().default('8085'),
  CONFIG_LINK_PREFIX: z.string().default('🕊️ 🇩🇪  DE|'),
  SOCKS5_PROXY: z.string().optional(),
  NODE_ENV: z.string().optional(),
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
