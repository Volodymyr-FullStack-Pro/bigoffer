import 'server-only';
import { createLlmClient, type LlmClient, readAiEnv } from '@jp/ai';

let client: LlmClient | undefined;

/** The app's LLM client (keys from env). Personal data must always use sensitivity 'private'. */
export function getLlm(): LlmClient {
  client ??= createLlmClient(readAiEnv());
  return client;
}

export function privateAiAvailable(): boolean {
  return getLlm().isAvailable('private');
}
