import { createBotApi } from '@jp/core';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { handleTelegramWebhook, supabaseWebhookStore } from '@/lib/telegram-webhook';

export async function POST(request: Request) {
  const { status } = await handleTelegramWebhook(
    { secretHeader: request.headers.get('x-telegram-bot-api-secret-token'), readBody: () => request.json() },
    {
      secret: process.env.TELEGRAM_WEBHOOK_SECRET,
      store: () => supabaseWebhookStore(createAdminSupabase()),
      bot: createBotApi(process.env.TELEGRAM_BOT_TOKEN || undefined),
    },
  );
  return status === 401 ? new Response(null, { status: 401 }) : Response.json({});
}
