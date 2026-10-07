import { z } from 'zod';

// Telegram always sends chat.type; it stays optional so an unexpected shape is still a parsed update (and gets no action).
const chatSchema = z.object({ id: z.number(), type: z.string().optional() });

export const telegramUpdateSchema = z.object({
  update_id: z.number(),
  message: z
    .object({
      message_id: z.number().optional(),
      text: z.string().optional(),
      chat: chatSchema,
      from: z.object({ language_code: z.string().optional() }).optional(),
    })
    .optional(),
  callback_query: z
    .object({
      id: z.string(),
      data: z.string().optional(),
      message: z.object({ message_id: z.number(), chat: chatSchema }).optional(),
    })
    .optional(),
});

export type TelegramUpdate = z.infer<typeof telegramUpdateSchema>;

const START_RE = /^\/start(?:@\w+)?\s+([A-Za-z0-9_-]{43})\s*$/;

export function parseStart(text: string): { token: string } | null {
  const m = START_RE.exec(text.trim());
  return m?.[1] ? { token: m[1] } : null;
}

/** The bot links and acts only in one-to-one chats; groups and channels get no action. */
export function isPrivateChat(chat: { type?: string | undefined } | undefined): boolean {
  return chat?.type === 'private';
}
