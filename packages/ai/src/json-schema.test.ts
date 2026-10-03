import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { toResponseJsonSchema } from './json-schema';

describe('toResponseJsonSchema', () => {
  it('produces a plain JSON schema Gemini accepts', () => {
    const schema = z.object({
      level: z.enum(['a', 'b']).nullable(),
      tags: z.array(z.string().max(40)).max(3),
      n: z.number().int(),
    });
    const out = toResponseJsonSchema(schema);
    expect(out).not.toHaveProperty('$schema');
    expect(out).toMatchObject({
      type: 'object',
      required: ['level', 'tags', 'n'],
      properties: {
        level: { anyOf: [{ type: 'string', enum: ['a', 'b'] }, { type: 'null' }] },
        tags: { type: 'array', maxItems: 3, items: { type: 'string' } },
        n: { type: 'integer' },
      },
    });
    expect(JSON.stringify(out)).not.toMatch(/maxLength|9007199254740991/);
  });

  it('keeps descriptions for the model', () => {
    const out = toResponseJsonSchema(z.object({ role: z.string().describe('Role in English') }));
    expect(out).toMatchObject({ properties: { role: { description: 'Role in English' } } });
  });
});
