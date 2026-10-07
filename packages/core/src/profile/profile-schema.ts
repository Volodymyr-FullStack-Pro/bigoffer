import { z } from 'zod';

export function emptyToUndefined<T extends Record<string, unknown>>(
  input: T,
): { [K in keyof T]: T[K] | undefined } {
  const out = {} as { [K in keyof T]: T[K] | undefined };
  for (const key of Object.keys(input) as (keyof T)[]) {
    const value = input[key];
    out[key] = typeof value === 'string' && value.trim() === '' ? undefined : value;
  }
  return out;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const httpUrl = z.url({ protocol: /^https?$/ });

export const contactsSchema = z.object({
  email: z.email().optional(),
  phone: z
    .string()
    .regex(/^\+?[0-9 ()-]{7,20}$/)
    .optional(),
  linkedin: httpUrl.optional(),
  github: httpUrl.optional(),
  portfolio: httpUrl.optional(),
  telegram: z
    .string()
    .regex(/^@?[A-Za-z0-9_]{5,32}$/)
    .optional(),
});

export const profileUpdateSchema = z.object({
  full_name: z.string().trim().min(1).max(120),
  timezone: z.string().refine(isValidTimeZone),
  contacts: contactsSchema,
});

export type Contacts = z.infer<typeof contactsSchema>;
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;
