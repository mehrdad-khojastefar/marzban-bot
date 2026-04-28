import { z } from 'zod/v4';

const panelEnvSchema = z.object({
  DATABASE_URL: z.string(),
  MARZBAN_API_URL: z.string().url(),
  MARZBAN_USERNAME: z.string(),
  MARZBAN_PASSWORD: z.string(),
  ADMIN_CHAT_ID: z.string(),
  ADMIN_SECRET: z.string(),
  TELEGRAM_BOT_TOKEN: z.string(),
  SUB_BASE_URL: z.string().url(),
  CONFIG_LINK_PREFIX: z.string().default('Doves|'),
  PANEL_PORT: z.string().default('3000'),
});

export type PanelEnv = z.infer<typeof panelEnvSchema>;

let cached: PanelEnv | null = null;

export function loadPanelEnv(): PanelEnv {
  if (cached) return cached;
  const result = panelEnvSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Panel: missing or invalid env vars:\n${issues}`);
  }
  cached = result.data;
  return cached;
}
