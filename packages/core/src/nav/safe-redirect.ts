export function safeRedirectPath(next: string | null | undefined): string | null {
  if (!next) return null;
  if (!next.startsWith('/') || next.startsWith('//')) return null;
  if (next.includes('\\') || next.includes('://')) return null;
  if (/[\u0000-\u001f\u007f]/.test(next)) return null;
  return next;
}
