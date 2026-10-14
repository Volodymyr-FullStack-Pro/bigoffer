import { z } from 'zod';

export const REJECTION_STAGES = ['application', 'screening', 'technical', 'test_task', 'final', 'offer'] as const;
export type RejectionStage = (typeof REJECTION_STAGES)[number];

export const REJECTION_REASONS = [
  'experience_level',
  'stack_mismatch',
  'english',
  'salary_expectations',
  'position_closed',
  'other_candidate',
  'test_task_failed',
  'tech_interview_failed',
  'location_timezone',
  'culture_fit',
  'no_reason_given',
  'no_feedback',
  'my_decision_salary',
  'my_decision_company',
  'other',
] as const;
export type RejectionReason = (typeof REJECTION_REASONS)[number];

export const rejectionInputSchema = z.object({
  stage: z.enum(REJECTION_STAGES),
  by: z.enum(['company', 'me']),
  reasons: z.array(z.enum(REJECTION_REASONS)).min(1).max(REJECTION_REASONS.length),
  note: z.string().trim().max(2000),
});
export type RejectionInput = z.infer<typeof rejectionInputSchema>;

const optionalText = (max: number) => z.string().trim().max(max).nullable();

export const applicationPatchSchema = z.object({
  salary: optionalText(120),
  notes: optionalText(5000),
  nextActionAt: z.iso.datetime().nullable(),
  contactName: optionalText(120),
  contactUrl: z.url({ protocol: /^https?$/ }).nullable(),
});
export type ApplicationPatch = z.infer<typeof applicationPatchSchema>;
