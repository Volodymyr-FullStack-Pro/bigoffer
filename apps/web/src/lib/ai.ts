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
