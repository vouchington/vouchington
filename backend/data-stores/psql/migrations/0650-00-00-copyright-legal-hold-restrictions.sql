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
  claimed_at timestamptz,
  CHECK ((state = 'completed') = (completed_at IS NOT NULL)),
  CHECK ((state = 'claimed') = (claimed_at IS NOT NULL))
);

CREATE INDEX idx_copyright_notice_enforcement_requests__pending
ON copyright_notice_enforcement_requests (updated_at, copyright_notice_submission_assessment_id)
WHERE state = 'pending';

CREATE INDEX idx_copyright_notice_enforcement_requests__notice
ON copyright_notice_enforcement_requests (copyright_notice_id);

CREATE INDEX idx_copyright_notice_enforcement_requests__imposed_by
ON copyright_notice_enforcement_requests (imposed_by_id)
WHERE imposed_by_id IS NOT NULL;

COMMENT ON TABLE copyright_notice_enforcement_requests IS 'Durable outbox created atomically with every compliant initial-notice assessment and completed only after every target has an active restriction.';

CREATE TABLE copyright_legal_hold_restrictions (
  copyright_restriction_id uuid PRIMARY KEY REFERENCES copyright_restrictions(id) ON DELETE RESTRICT,
  copyright_notice_legal_hold_assessment_id uuid NOT NULL REFERENCES copyright_notice_legal_hold_assessments(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (copyright_notice_legal_hold_assessment_id, copyright_restriction_id)
);

COMMENT ON TABLE copyright_legal_hold_restrictions IS 'Typed provenance binding for restrictions reactivated by qualifying legal holds.';
