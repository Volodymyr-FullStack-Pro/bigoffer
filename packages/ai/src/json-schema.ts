import { z } from 'zod';

// Gemini's responseJsonSchema supports a subset of JSON Schema; these keys either fail or add nothing.
// `default` comes from `.catch()`, which only matters when parsing the answer.
const DROP_KEYS = new Set(['$schema', 'maxLength', 'minLength', 'pattern', 'format', 'default']);
const SAFE_INT_BOUNDS = new Set([Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER]);

function strip(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(strip);
  if (node === null || typeof node !== 'object') return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (DROP_KEYS.has(key)) continue;
    if ((key === 'minimum' || key === 'maximum') && SAFE_INT_BOUNDS.has(value as number)) continue;
    out[key] = strip(value);
  }
  return out;
}

/** JSON Schema for `config.responseJsonSchema`. The schema must not use transforms (they have no JSON form). */
export function toResponseJsonSchema(schema: z.ZodType): Record<string, unknown> {
  return strip(z.toJSONSchema(schema, { target: 'draft-2020-12' })) as Record<string, unknown>;
}
