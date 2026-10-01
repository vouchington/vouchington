-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE copyright_notice_enforcement_requests (
  copyright_notice_submission_assessment_id uuid PRIMARY KEY REFERENCES copyright_notice_submission_assessments(id) ON DELETE RESTRICT,
  copyright_notice_id uuid NOT NULL REFERENCES copyright_notices(id) ON DELETE RESTRICT,
  imposed_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'claimed', 'completed')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_attempt_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lease_token uuid,
  claimed_at timestamptz,
  CHECK ((state = 'completed') = (completed_at IS NOT NULL)),
  CHECK ((state = 'claimed') = (claimed_at IS NOT NULL))
);


CREATE INDEX idx_copyright_notice_enforcement_requests__notice
ON copyright_notice_enforcement_requests (copyright_notice_id);

CREATE INDEX idx_copyright_notice_enforcement_requests__imposed_by
ON copyright_notice_enforcement_requests (imposed_by_id)
WHERE imposed_by_id IS NOT NULL;

CREATE TRIGGER trigger_copyright_notice_enforcement_requests_updated_at
BEFORE UPDATE ON copyright_notice_enforcement_requests
FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE copyright_notice_enforcement_requests IS 'Durable outbox created atomically with every compliant initial-notice assessment and completed only after every target has an active restriction.';
COMMENT ON COLUMN copyright_notice_enforcement_requests.copyright_notice_submission_assessment_id IS 'One-to-one assessment that authorized this enforcement request and supplies its idempotency identity.';
COMMENT ON COLUMN copyright_notice_enforcement_requests.copyright_notice_id IS 'Initial notice whose compliant assessment requires every target restriction to be active.';
COMMENT ON COLUMN copyright_notice_enforcement_requests.imposed_by_id IS 'Optional moderator whose approval imposed the associated assessment; NULL for automated form enforcement.';
COMMENT ON COLUMN copyright_notice_enforcement_requests.state IS 'Outbox lifecycle state: pending, worker-claimed, or completed after every target restriction is active.';
COMMENT ON COLUMN copyright_notice_enforcement_requests.attempt_count IS 'Count of durable worker claims made to impose the request.';
COMMENT ON COLUMN copyright_notice_enforcement_requests.last_attempt_at IS 'Most recent time a worker attempted to impose the required restrictions.';
COMMENT ON COLUMN copyright_notice_enforcement_requests.completed_at IS 'Time all required target restrictions became active.';
COMMENT ON COLUMN copyright_notice_enforcement_requests.claimed_at IS 'Time the current worker claim began.';

CREATE TABLE copyright_legal_hold_restrictions (
  copyright_restriction_id uuid NOT NULL REFERENCES copyright_restrictions(id) ON DELETE RESTRICT,
  copyright_notice_legal_hold_assessment_id uuid NOT NULL REFERENCES copyright_notice_legal_hold_assessments(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (copyright_restriction_id, copyright_notice_legal_hold_assessment_id),
  UNIQUE (copyright_notice_legal_hold_assessment_id, copyright_restriction_id)
);

COMMENT ON TABLE copyright_legal_hold_restrictions IS 'Typed provenance bindings between restriction records and qualifying legal-hold assessments.';
COMMENT ON COLUMN copyright_legal_hold_restrictions.copyright_restriction_id IS 'Restriction with immutable provenance from a qualifying legal-hold assessment.';
COMMENT ON COLUMN copyright_legal_hold_restrictions.copyright_notice_legal_hold_assessment_id IS 'Legal-hold assessment that established this immutable restriction provenance binding.';

CREATE INDEX IF NOT EXISTS idx_copyright_notice_enforcement_requests__reconcilable
  ON copyright_notice_enforcement_requests (copyright_notice_submission_assessment_id)
  WHERE state IN ('pending', 'claimed');

COMMENT ON COLUMN copyright_notice_enforcement_requests.lease_token IS 'Opaque worker ownership token rotated on each claim or reclaim; completion and failure compare it for equality. It identifies no durable row.';
