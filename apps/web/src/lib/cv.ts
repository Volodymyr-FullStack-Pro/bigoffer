import 'server-only';
import { type ParsedCv, parsedCvSchema } from '@jp/ai';
import type { createClient } from '@/lib/supabase/server';

type Supabase = Awaited<ReturnType<typeof createClient>>;

export async function loadPrimaryCv(supabase: Supabase) {
  const { data } = await supabase.from('resumes').select('id, storage_path, file_name, parsed, parse_error').eq('is_primary', true).maybeSingle();
  if (!data) return null;
  const parsed = parsedCvSchema.safeParse(data.parsed);
  return {
    id: data.id,
    path: data.storage_path,
    fileName: data.file_name,
    parsed: parsed.success ? (parsed.data as ParsedCv) : null,
    parseError: data.parse_error,
  };
}

const THIRTY_DAYS = 30 * 24 * 3600;

export async function cvSignedUrl(supabase: Supabase, path: string): Promise<string | null> {
  const { data } = await supabase.storage.from('resumes').createSignedUrl(path, THIRTY_DAYS);
  return data?.signedUrl ?? null;
}
