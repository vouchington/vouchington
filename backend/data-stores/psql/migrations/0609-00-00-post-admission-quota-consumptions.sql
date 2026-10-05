-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS post_admission_quota_consumptions (
  reservation_id UUID PRIMARY KEY REFERENCES post_admission_reservations (id) ON DELETE CASCADE,
  actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source contribution_policy_sources NOT NULL,
  committed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consumption_mode post_admission_quota_consumption_modes NOT NULL DEFAULT 'all_windows'
    CHECK (consumption_mode IN ('all_windows', 'daily_only'))
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_post_admission_quota_consumptions__actor_source_committed
ON post_admission_quota_consumptions (actor_user_id, source, committed_at DESC);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_post_admission_quota_consumptions__actor_committed
ON post_admission_quota_consumptions (actor_user_id, committed_at DESC);

CREATE INDEX IF NOT EXISTS idx_post_admission_quota_consumptions__retention
ON post_admission_quota_consumptions (committed_at, reservation_id);

COMMENT ON TABLE post_admission_quota_consumptions IS 'Immutable committed-admission ledger used to enforce contribution quotas.';
COMMENT ON COLUMN post_admission_quota_consumptions.reservation_id IS 'Admission reservation that committed and consumed quota exactly once. The consumption is deleted with its reservation, which outlives every contribution-policy window.';
COMMENT ON COLUMN post_admission_quota_consumptions.actor_user_id IS 'Actor whose contribution quota was consumed.';
COMMENT ON COLUMN post_admission_quota_consumptions.source IS 'Contribution-policy source whose quota was consumed.';
COMMENT ON COLUMN post_admission_quota_consumptions.committed_at IS 'Clock timestamp at which the quota-consuming admission committed.';
COMMENT ON COLUMN post_admission_quota_consumptions.consumption_mode IS 'Whether this consumption participates in all policy windows or daily windows only; the default preserves old writers as all-window consumption.';
