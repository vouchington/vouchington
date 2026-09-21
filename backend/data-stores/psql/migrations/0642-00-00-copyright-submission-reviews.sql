ALTER TABLE copyright_notice_appeal_recommendations
  -- squawk-ignore disallowed-unique-constraint, constraint-missing-not-valid -- Copyright intake is activation-gated and this stacked table is empty at deployment.
  ADD CONSTRAINT copyright_appeal_recommendations_id_submission_unique
  UNIQUE (id, copyright_notice_submission_id);

CREATE TABLE copyright_notice_appeal_reviews (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_submission_id uuid NOT NULL REFERENCES copyright_notice_submissions(id) ON DELETE RESTRICT,
  copyright_restriction_id uuid NOT NULL REFERENCES copyright_restrictions(id) ON DELETE RESTRICT,
  copyright_notice_appeal_recommendation_id uuid,
  reviewed_at timestamptz NOT NULL,
  reviewed_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('confirm', 'modify', 'reverse')),
  rationale_ciphertext text NOT NULL CHECK (char_length(rationale_ciphertext) BETWEEN 1 AND 1048576),
  manual_fallback_reason_ciphertext text CHECK (manual_fallback_reason_ciphertext IS NULL OR char_length(manual_fallback_reason_ciphertext) BETWEEN 1 AND 1048576),
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (copyright_notice_submission_id, copyright_restriction_id),
  FOREIGN KEY (copyright_notice_appeal_recommendation_id, copyright_notice_submission_id)
    REFERENCES copyright_notice_appeal_recommendations(id, copyright_notice_submission_id) ON DELETE RESTRICT,
  CHECK ((copyright_notice_appeal_recommendation_id IS NULL) = (manual_fallback_reason_ciphertext IS NOT NULL))
);

CREATE TABLE copyright_notice_counter_notice_reviews (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_submission_id uuid NOT NULL UNIQUE REFERENCES copyright_notice_submissions(id) ON DELETE RESTRICT,
  copyright_notice_submission_assessment_id uuid NOT NULL UNIQUE REFERENCES copyright_notice_submission_assessments(id) ON DELETE RESTRICT,
  copyright_notice_deadline_id uuid UNIQUE REFERENCES copyright_notice_deadlines(id) ON DELETE RESTRICT,
  reviewed_at timestamptz NOT NULL,
  reviewed_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  accepted boolean NOT NULL,
  rationale_ciphertext text NOT NULL CHECK (char_length(rationale_ciphertext) BETWEEN 1 AND 1048576),
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (accepted = (copyright_notice_deadline_id IS NOT NULL))
);

CREATE INDEX idx_copyright_appeal_reviews__reviewer ON copyright_notice_appeal_reviews(reviewed_by_id) WHERE reviewed_by_id IS NOT NULL;
CREATE INDEX idx_copyright_appeal_reviews__restriction ON copyright_notice_appeal_reviews(copyright_restriction_id);
CREATE INDEX idx_copyright_appeal_reviews__recommendation ON copyright_notice_appeal_reviews(copyright_notice_appeal_recommendation_id) WHERE copyright_notice_appeal_recommendation_id IS NOT NULL;
CREATE INDEX idx_copyright_counter_notice_reviews__reviewer ON copyright_notice_counter_notice_reviews(reviewed_by_id) WHERE reviewed_by_id IS NOT NULL;

CREATE TRIGGER trigger_copyright_appeal_reviews_immutable BEFORE UPDATE OR DELETE ON copyright_notice_appeal_reviews FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_immutable_with_actor_erasure('reviewed_by_id');
CREATE TRIGGER trigger_copyright_appeal_reviews_require_actor BEFORE INSERT ON copyright_notice_appeal_reviews FOR EACH ROW EXECUTE FUNCTION fn_require_copyright_human_actor('reviewed_by_id');
CREATE TRIGGER trigger_copyright_counter_reviews_immutable BEFORE UPDATE OR DELETE ON copyright_notice_counter_notice_reviews FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_immutable_with_actor_erasure('reviewed_by_id');
CREATE TRIGGER trigger_copyright_counter_reviews_require_actor BEFORE INSERT ON copyright_notice_counter_notice_reviews FOR EACH ROW EXECUTE FUNCTION fn_require_copyright_human_actor('reviewed_by_id');

COMMENT ON TABLE copyright_notice_appeal_reviews IS 'Immutable target-level moderator decisions on informal copyright appeals; agent recommendations remain advisory.';
COMMENT ON COLUMN copyright_notice_appeal_reviews.copyright_notice_submission_id IS 'Informal appeal decided by the moderator.';
COMMENT ON COLUMN copyright_notice_appeal_reviews.copyright_restriction_id IS 'Target restriction affected by the decision.';
COMMENT ON COLUMN copyright_notice_appeal_reviews.copyright_notice_appeal_recommendation_id IS 'Advisory agent recommendation retained as provenance.';
COMMENT ON COLUMN copyright_notice_appeal_reviews.reviewed_at IS 'Time the moderator decided the appeal.';
COMMENT ON COLUMN copyright_notice_appeal_reviews.reviewed_by_id IS 'Moderator who decided the appeal.';
COMMENT ON COLUMN copyright_notice_appeal_reviews.action IS 'Confirm, modify, or reverse decision for the restriction.';
COMMENT ON COLUMN copyright_notice_appeal_reviews.rationale_ciphertext IS 'Encrypted moderator rationale.';
COMMENT ON COLUMN copyright_notice_appeal_reviews.manual_fallback_reason_ciphertext IS 'Encrypted reason staff proceeded without an agent recommendation.';
COMMENT ON TABLE copyright_notice_counter_notice_reviews IS 'Immutable moderator formal-compliance decisions for statutory US counter-notices.';
COMMENT ON COLUMN copyright_notice_counter_notice_reviews.copyright_notice_submission_id IS 'Statutory counter-notice reviewed by staff.';
COMMENT ON COLUMN copyright_notice_counter_notice_reviews.copyright_notice_submission_assessment_id IS 'Human compliance assessment created by the review.';
COMMENT ON COLUMN copyright_notice_counter_notice_reviews.copyright_notice_deadline_id IS 'Restoration clock created for an accepted counter-notice.';
COMMENT ON COLUMN copyright_notice_counter_notice_reviews.reviewed_at IS 'Time the moderator completed formal review.';
COMMENT ON COLUMN copyright_notice_counter_notice_reviews.reviewed_by_id IS 'Moderator who completed formal review.';
COMMENT ON COLUMN copyright_notice_counter_notice_reviews.accepted IS 'Whether the counter-notice was formally compliant.';
COMMENT ON COLUMN copyright_notice_counter_notice_reviews.rationale_ciphertext IS 'Encrypted moderator rationale.';
