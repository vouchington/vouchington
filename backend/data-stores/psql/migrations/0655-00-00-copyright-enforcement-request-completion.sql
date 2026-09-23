COMMENT ON TABLE copyright_notice_enforcement_requests IS
  'Durable outbox created atomically with every compliant initial-notice assessment; completes after every target is restricted or when its authorizing assessment is no longer enforceable.';

COMMENT ON COLUMN copyright_notice_enforcement_requests.copyright_notice_submission_assessment_id IS
  'One-to-one initial-notice assessment that authorizes this enforcement request and supplies its idempotency identity.';

COMMENT ON COLUMN copyright_notice_enforcement_requests.copyright_notice_id IS
  'Copyright case whose current compliant initial-notice assessment authorizes target restrictions.';

COMMENT ON COLUMN copyright_notice_enforcement_requests.state IS
  'Outbox lifecycle state: pending, worker-claimed, or completed after target restrictions succeed or the authorizing assessment becomes non-enforceable.';

COMMENT ON COLUMN copyright_notice_enforcement_requests.completed_at IS
  'Time every required target restriction became active or the authorizing assessment became non-enforceable.';
