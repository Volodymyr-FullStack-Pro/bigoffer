import { describe, expect, it } from 'vitest';
import { applicationPatchSchema, REJECTION_REASONS, REJECTION_STAGES, rejectionInputSchema } from './rejection';

describe('rejection taxonomy', () => {
  it('has the spec keys', () => {
    expect(REJECTION_REASONS).toHaveLength(15);
    expect(REJECTION_REASONS).toContain('no_reason_given');
    expect(REJECTION_STAGES).toEqual(['application', 'screening', 'technical', 'test_task', 'final', 'offer']);
  });
  it('validates a rejection', () => {
    expect(rejectionInputSchema.safeParse({ stage: 'technical', by: 'company', reasons: ['english'], note: '' }).success).toBe(true);
    expect(rejectionInputSchema.safeParse({ stage: 'technical', by: 'company', reasons: [], note: '' }).success).toBe(false);
    expect(rejectionInputSchema.safeParse({ stage: 'x', by: 'company', reasons: ['english'], note: '' }).success).toBe(false);
  });
  it('validates card edits', () => {
    const ok = { salary: '$4000', notes: 'n', nextActionAt: '2026-10-06T09:00:00.000Z', contactName: 'Anna', contactUrl: 'https://t.me/anna' };
    expect(applicationPatchSchema.safeParse(ok).success).toBe(true);
    expect(applicationPatchSchema.safeParse({ ...ok, contactUrl: 'javascript:alert(1)' }).success).toBe(false);
    expect(applicationPatchSchema.safeParse({ ...ok, nextActionAt: 'tomorrow' }).success).toBe(false);
  });
});
