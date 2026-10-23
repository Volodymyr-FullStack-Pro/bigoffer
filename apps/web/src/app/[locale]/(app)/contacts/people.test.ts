import { describe, expect, it } from 'vitest';
import { people } from './people';

const app = (id: string, company: string, contactName: string | null = null) => ({ id, title: `Dev ${id}`, company, contactName, contactUrl: null, lastActivityAt: '2026-10-01T00:00:00Z' });

describe('people', () => {
  it('merges card contacts and message authors by name, skipping the company itself, newest first', () => {
    const out = people(
      [app('a', 'Acme', 'Olena K'), app('b', 'Globex')],
      [
        { applicationId: 'a', author: 'olena  k', sentAt: '2026-10-05T00:00:00Z' },
        { applicationId: 'b', author: 'Olena K', sentAt: '2026-10-03T00:00:00Z' },
        { applicationId: 'b', author: 'Globex', sentAt: '2026-10-09T00:00:00Z' },
        { applicationId: 'b', author: 'Max', sentAt: '2026-10-02T00:00:00Z' },
      ],
    );
    expect(out.map((p) => [p.name, p.cards.map((c) => c.id), p.lastAt])).toEqual([
      ['Olena K', ['a', 'b'], '2026-10-05T00:00:00Z'],
      ['Max', ['b'], '2026-10-02T00:00:00Z'],
    ]);
  });
});
