-- "Declined without a reason": a plain "we decided not to move forward" is its own reason, apart from "other".
alter table public.applications drop constraint applications_rejection_reasons_check;
alter table public.applications add constraint applications_rejection_reasons_check check (rejection_reasons <@ array[
  'experience_level', 'stack_mismatch', 'english', 'salary_expectations', 'position_closed', 'other_candidate',
  'test_task_failed', 'tech_interview_failed', 'location_timezone', 'culture_fit', 'no_reason_given', 'no_feedback',
  'my_decision_salary', 'my_decision_company', 'other']::text[]);
