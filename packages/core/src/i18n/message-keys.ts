function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function flattenKeys(messages: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(messages)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isPlainObject(value)) keys.push(...flattenKeys(value, path));
    else keys.push(path);
  }
  return keys.sort();
}

export function findMissingKeys(
  base: Record<string, unknown>,
  other: Record<string, unknown>,
): string[] {
  const otherKeys = new Set(flattenKeys(other));
  return flattenKeys(base).filter((key) => !otherKeys.has(key));
}
