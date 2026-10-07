'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getUserId } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { hashLinkToken, newLinkToken } from '@/lib/telegram-link';

export async function createTelegramLink(): Promise<{ ok: true; url: string } | { ok: false }> {
  const bot = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
  if (!bot || !(await getUserId())) return { ok: false };
  const token = newLinkToken();
  const supabase = await createClient();
  const { error } = await supabase.rpc('create_telegram_link_token', { p_token_hash: hashLinkToken(token) });
  if (error) {
    console.error('createTelegramLink failed', error.code);
    return { ok: false };
  }
  return { ok: true, url: `https://t.me/${bot}?start=${token}` };
}

export async function disconnectTelegram(): Promise<boolean> {
  if (!(await getUserId())) return false;
  const supabase = await createClient();
  const { error } = await supabase.rpc('unlink_telegram');
  if (error) console.error('disconnectTelegram failed', error.code);
  revalidatePath('/[locale]/profile', 'page');
  return !error;
}

const settingsSchema = z.object({
  alerts: z.boolean(),
  minScore: z.int().min(0).max(100),
  digestHour: z.int().min(0).max(23),
});

export async function saveTelegramSettings(alerts: boolean, minScore: number, digestHour: number): Promise<boolean> {
  const parsed = settingsSchema.safeParse({ alerts, minScore, digestHour });
  const userId = await getUserId();
  if (!parsed.success || !userId) return false;
  const supabase = await createClient();
  const { error } = await supabase
    .from('profiles')
    .update({ telegram_alerts: parsed.data.alerts, telegram_min_score: parsed.data.minScore, digest_hour: parsed.data.digestHour })
    .eq('id', userId);
  if (error) console.error('saveTelegramSettings failed', error.code);
  return !error;
}
