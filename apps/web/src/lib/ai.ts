import 'server-only';
import { createLlmClient, type LlmClient, readAiEnv } from '@jp/ai';

let client: LlmClient | undefined;
let configErrorLogged = false;

/** The app's LLM client (keys from env). Personal data must always use sensitivity 'private'. */
export function getLlm(): LlmClient {
  client ??= createLlmClient(readAiEnv());
  return client;
}

/** False (never throws) when AI is unconfigured or misconfigured; callers guard getLlm() with this. */
export function privateAiAvailable(): boolean {
  try {
    return getLlm().isAvailable('private');
  } catch (err) {
    if (!configErrorLogged) {
      configErrorLogged = true;
      console.error('AI config invalid', err instanceof Error ? err.name : 'unknown');
    }
    return false;
  }
}

/** Same as privateAiAvailable for job-only (public) requests: lessons and plans that hold no personal data. */
export function publicAiAvailable(): boolean {
  try {
    return getLlm().isAvailable('public');
  } catch {
    return false;
  }
}

const DEFAULT_PRIVATE_AI_DAILY_LIMIT = 100;

/** Paid-AI requests one user may make per UTC day (PRIVATE_AI_DAILY_LIMIT, default 100). */
export function privateAiDailyLimit(env: Record<string, string | undefined> = process.env): number {
  const raw = env.PRIVATE_AI_DAILY_LIMIT;
  if (raw === undefined || raw === '') return DEFAULT_PRIVATE_AI_DAILY_LIMIT;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : DEFAULT_PRIVATE_AI_DAILY_LIMIT;
}

/** Spends one paid-AI request of the signed-in user's daily quota; false = over the limit (or the check failed). */
export async function consumePrivateAi(supabase: { rpc: (fn: 'consume_private_ai', args: { p_limit: number }) => PromiseLike<{ data: boolean | null; error: unknown }> }): Promise<boolean> {
  const { data, error } = await supabase.rpc('consume_private_ai', { p_limit: privateAiDailyLimit() });
  if (error) {
    console.error('private AI quota check failed');
    return false;
  }
  return data === true;
}
