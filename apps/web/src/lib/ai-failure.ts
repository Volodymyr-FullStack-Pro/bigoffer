/** Why a private-AI call failed, as stored in resumes.parse_error and shown to the user. */
export type AiFailure = 'ai_provider_limit' | 'ai_key_invalid' | 'ai_unavailable' | 'parse_failed';

type ErrorLike = { name?: unknown; message?: unknown; status?: unknown; cause?: unknown };

function asErrorLike(err: unknown): ErrorLike | null {
  return typeof err === 'object' && err !== null ? (err as ErrorLike) : null;
}

/** HTTP status from LlmError.status or the wrapped @google/genai ApiError (cause.status). */
export function aiErrorStatus(err: unknown): number | null {
  for (let e = asErrorLike(err), depth = 0; e && depth < 3; e = asErrorLike(e.cause), depth++) {
    if (typeof e.status === 'number' && Number.isInteger(e.status)) return e.status;
  }
  return null;
}

function message(err: unknown): string {
  const e = asErrorLike(err);
  return typeof e?.message === 'string' ? e.message : '';
}

export function classifyAiFailure(err: unknown): AiFailure {
  const e = asErrorLike(err);
  if (e?.name === 'LlmUnavailableError') return 'ai_unavailable';
  const status = aiErrorStatus(err);
  const msg = message(err);
  if (status === 429 || e?.name === 'LlmRateLimitError' || /RESOURCE_EXHAUSTED/.test(msg)) return 'ai_provider_limit';
  if (status === 401 || status === 403 || /PERMISSION_DENIED|API_KEY_INVALID/.test(msg)) return 'ai_key_invalid';
  if (status === 400 && /api key/i.test(msg)) return 'ai_key_invalid';
  return 'parse_failed';
}

/**
 * A log line safe to print: error name, HTTP status and the first 200 chars of the message.
 * Provider messages for 4xx/5xx carry the API's error JSON, not the input; keys are still redacted defensively.
 */
export function describeAiFailure(err: unknown): string {
  const e = asErrorLike(err);
  const name = typeof e?.name === 'string' ? e.name : 'unknown';
  const status = aiErrorStatus(err);
  const msg = message(err)
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[key]')
    .replace(/([?&]key=)[^&\s"]+/gi, '$1[key]')
    .replace(/\s+/g, ' ')
    .slice(0, 200);
  return `${name} status=${status ?? 'none'} message=${JSON.stringify(msg)}`;
}
