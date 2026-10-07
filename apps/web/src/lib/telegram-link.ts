import { createHash } from 'node:crypto';

/** One-time /start token: 32 random bytes, base64url (43 chars). Only its SHA-256 hash is stored. */
export function newLinkToken(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
}

export function hashLinkToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
