-- The latest date a board re-published (bumped) a job that was first posted earlier: a vacancy the company
-- keeps refreshing is still being hired for, so the feed ranks it by this date and marks it "refreshed".
alter table public.jobs add column refreshed_at timestamptz;
