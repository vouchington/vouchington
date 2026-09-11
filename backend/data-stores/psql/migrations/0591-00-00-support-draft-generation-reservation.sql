ALTER TABLE support_agent_runs
ADD COLUMN IF NOT EXISTS staff_draft_requested_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_support_agent_runs__one_active_staff_draft_per_thread
ON support_agent_runs (support_thread_id)
WHERE staff_draft_requested_at IS NOT NULL AND completed_at IS NULL AND failed_at IS NULL;

COMMENT ON COLUMN support_agent_runs.staff_draft_requested_at IS 'Set for a staff-requested AI draft reservation before it is enqueued.';
COMMENT ON INDEX idx_support_agent_runs__one_active_staff_draft_per_thread IS 'A support thread has at most one queued or running staff-requested draft generation at a time.';
