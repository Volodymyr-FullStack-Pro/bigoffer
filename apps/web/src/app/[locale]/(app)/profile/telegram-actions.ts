'use server';

import { isLocale } from '@jp/core';
import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { z } from 'zod';
import { getUserId } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { hashLinkToken, newLinkToken } from '@/lib/telegram-link';

export async function createTelegramLink(): Promise<{ ok: true; url: string } | { ok: false }> {
  const bot = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
  const userId = await getUserId();
  if (!bot || !userId) return { ok: false };
  const supabase = await createClient();
  // Bot messages use profiles.locale: take the language the user is connecting from.
  const locale = await getLocale();
  if (isLocale(locale)) {
    const { error: localeError } = await supabase.from('profiles').update({ locale }).eq('id', userId);
    if (localeError) console.error('createTelegramLink locale update failed', localeError.code);
  }
  const token = newLinkToken();
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
  quietStart: z.int().min(0).max(23),
  quietEnd: z.int().min(0).max(23),
});

export async function saveTelegramSettings(alerts: boolean, minScore: number, digestHour: number, quietStart = 23, quietEnd = 8): Promise<boolean> {
  const parsed = settingsSchema.safeParse({ alerts, minScore, digestHour, quietStart, quietEnd });
  const userId = await getUserId();
  if (!parsed.success || !userId) return false;
  const supabase = await createClient();
  const { error } = await supabase
    .from('profiles')
    .update({
      telegram_alerts: parsed.data.alerts,
      telegram_min_score: parsed.data.minScore,
      digest_hour: parsed.data.digestHour,
      telegram_quiet_start: parsed.data.quietStart,
      telegram_quiet_end: parsed.data.quietEnd,
    })
    .eq('id', userId);
  if (error) console.error('saveTelegramSettings failed', error.code);
  return !error;
}

/** Ends a /pause from the profile. */
export async function resumeTelegram(): Promise<boolean> {
  const userId = await getUserId();
  if (!userId) return false;
  const supabase = await createClient();
  const { error } = await supabase.from('profiles').update({ telegram_paused_until: null }).eq('id', userId);
  if (error) console.error('resumeTelegram failed', error.code);
  revalidatePath('/[locale]/profile', 'page');
  return !error;
}
