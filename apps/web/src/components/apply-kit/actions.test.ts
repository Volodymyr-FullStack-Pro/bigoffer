import { beforeEach, describe, expect, it, vi } from 'vitest';

const llm = vi.fn();
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getUserId: async () => 'u1' }));
vi.mock('@/lib/ai', () => ({ getLlm: () => llm(), privateAiAvailable: () => true }));
vi.mock('@/lib/cv', () => ({ loadPrimaryCv: async () => ({ parsed: {} }), cvSignedUrl: async () => null }));
vi.mock('@/lib/supabase/server', () => ({
  // Every table is empty: the user has neither a match nor a card for the job.
  createClient: async () => ({
    from: () => {
      const q: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'limit', 'not', 'order']) q[m] = () => q;
      q.maybeSingle = async () => ({ data: null });
      q.single = async () => ({ data: null });
      q.then = (r: (v: unknown) => void) => r({ data: [] });
      return q;
    },
  }),
}));

const JOB = '11111111-1111-4111-8111-111111111111';

describe('apply kit access gate', () => {
  beforeEach(() => llm.mockClear());

  it('generateKit refuses a job without a match or card and never touches the LLM', async () => {
    const { generateKit } = await import('./actions');
    expect(await generateKit(JOB, { lang: 'auto', tone: 'default' })).toEqual({ ok: false, error: 'not_found' });
    expect(llm).not.toHaveBeenCalled();
  });

  it('answerFormQuestions refuses a job without a match or card and never touches the LLM', async () => {
    const { answerFormQuestions } = await import('./actions');
    expect(await answerFormQuestions(JOB, 'What is your notice period?')).toEqual({ ok: false, error: 'not_found' });
    expect(llm).not.toHaveBeenCalled();
  });
});
