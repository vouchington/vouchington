-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE copyright_restriction_administrator_lifts (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_restriction_id uuid NOT NULL CONSTRAINT uq_copyright_restriction_administrator_lifts__restriction_id UNIQUE CONSTRAINT fk_copyright_restriction_administrator_lifts__restriction REFERENCES copyright_restrictions(id) ON DELETE RESTRICT,
  lifted_at timestamptz NOT NULL,
  lifted_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  rationale_ciphertext text NOT NULL CONSTRAINT chk_copyright_restrictio_administra_lifts__rationale_ciphertext CHECK (char_length(rationale_ciphertext) BETWEEN 1 AND 1048576),
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_restriction_administrator_lifts__actor
  ON copyright_restriction_administrator_lifts(lifted_by_id) WHERE lifted_by_id IS NOT NULL;
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_copyright_restriction_administrator_lifts_immutable BEFORE UPDATE OR DELETE
  ON copyright_restriction_administrator_lifts FOR EACH ROW
  EXECUTE FUNCTION fn_reject_copyright_immutable_with_actor_erasure('lifted_by_id');
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_copyright_restriction_administrator_lifts_require_actor BEFORE INSERT
  ON copyright_restriction_administrator_lifts FOR EACH ROW
  EXECUTE FUNCTION fn_reject_copyright_human_actor('lifted_by_id');

COMMENT ON TABLE copyright_restriction_administrator_lifts IS 'Immutable administrator decisions to restore a restricted image when no live subscriber can respond.';
COMMENT ON COLUMN copyright_restriction_administrator_lifts.id IS 'UUIDv7 identity of the administrator lift.';
COMMENT ON COLUMN copyright_restriction_administrator_lifts.copyright_restriction_id IS 'Restriction restored by the administrator decision.';
COMMENT ON COLUMN copyright_restriction_administrator_lifts.lifted_at IS 'Time the administrator made the restoration decision.';
COMMENT ON COLUMN copyright_restriction_administrator_lifts.lifted_by_id IS 'Administrator who made the decision; cleared only for account erasure.';
COMMENT ON COLUMN copyright_restriction_administrator_lifts.rationale_ciphertext IS 'Encrypted administrator rationale.';
COMMENT ON COLUMN copyright_restriction_administrator_lifts.created_at IS 'Creation time derived from the UUIDv7 identity.';
COMMENT ON COLUMN copyright_restriction_administrator_lifts.updated_at IS 'Last erasure update time.';

ALTER TABLE copyright_notice_appeal_recommendations
  -- squawk-ignore disallowed-unique-constraint, constraint-missing-not-valid -- Copyright intake is activation-gated and this stacked table is empty at deployment.
  ADD CONSTRAINT copyright_appeal_recommendations_id_submission_unique
  UNIQUE (id, copyright_notice_submission_id);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE copyright_notice_appeal_reviews (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_submission_id uuid NOT NULL CONSTRAINT fk_copyright_notice_appeal_reviews__submission REFERENCES copyright_notice_submissions(id) ON DELETE RESTRICT,
  copyright_restriction_id uuid NOT NULL REFERENCES copyright_restrictions(id) ON DELETE RESTRICT,
  copyright_notice_appeal_recommendation_id uuid,
  reviewed_at timestamptz NOT NULL,
  reviewed_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action copyright_review_actions NOT NULL CHECK (action IN ('confirm', 'reverse')),
  rationale_ciphertext text NOT NULL CHECK (char_length(rationale_ciphertext) BETWEEN 1 AND 1048576),
  manual_fallback_reason_ciphertext text CONSTRAINT chk_copyr_notic_appea_review__manual_fallback_reason_ciphertext CHECK (manual_fallback_reason_ciphertext IS NULL OR char_length(manual_fallback_reason_ciphertext) BETWEEN 1 AND 1048576),
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_copyrig_notice_appeal_reviews__submission_id__restriction_id UNIQUE (copyright_notice_submission_id, copyright_restriction_id),
  CONSTRAINT fk_copyright_notice_appeal_reviews__recommendation__submission FOREIGN KEY (copyright_notice_appeal_recommendation_id, copyright_notice_submission_id)
    REFERENCES copyright_notice_appeal_recommendations(id, copyright_notice_submission_id) ON DELETE RESTRICT,
  CHECK ((copyright_notice_appeal_recommendation_id IS NULL) = (manual_fallback_reason_ciphertext IS NOT NULL))
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE copyright_notice_counter_notice_reviews (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_submission_id uuid NOT NULL CONSTRAINT uq_copyright_notice_counter_notice_reviews__submission_id UNIQUE CONSTRAINT fk_copyright_notice_counter_notice_reviews__submission REFERENCES copyright_notice_submissions(id) ON DELETE RESTRICT,
  copyright_notice_submission_assessment_id uuid NOT NULL CONSTRAINT uq_copyri_notice_counte_notice_review__submission_assessment_id UNIQUE CONSTRAINT fk_copyrig_notice_counter_notice_reviews__submission_assessment REFERENCES copyright_notice_submission_assessments(id) ON DELETE RESTRICT,
  copyright_notice_deadline_id uuid CONSTRAINT uq_copyright_notice_counter_notice_reviews__deadline_id UNIQUE CONSTRAINT fk_copyright_notice_counter_notice_reviews__deadline REFERENCES copyright_notice_deadlines(id) ON DELETE RESTRICT,
  reviewed_at timestamptz NOT NULL,
  reviewed_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  is_accepted boolean NOT NULL,
  rationale_ciphertext text NOT NULL CONSTRAINT chk_copyrig_notice_counter_notice_reviews__rationale_ciphertext CHECK (char_length(rationale_ciphertext) BETWEEN 1 AND 1048576),
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (is_accepted = (copyright_notice_deadline_id IS NOT NULL))
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_appeal_reviews__reviewer ON copyright_notice_appeal_reviews(reviewed_by_id) WHERE reviewed_by_id IS NOT NULL;
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_appeal_reviews__restriction ON copyright_notice_appeal_reviews(copyright_restriction_id);
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_appeal_reviews__recommendation ON copyright_notice_appeal_reviews(copyright_notice_appeal_recommendation_id) WHERE copyright_notice_appeal_recommendation_id IS NOT NULL;
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_counter_notice_reviews__reviewer ON copyright_notice_counter_notice_reviews(reviewed_by_id) WHERE reviewed_by_id IS NOT NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_copyright_appeal_reviews_immutable BEFORE UPDATE OR DELETE ON copyright_notice_appeal_reviews FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_immutable_with_actor_erasure('reviewed_by_id');
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_copyright_appeal_reviews_require_actor BEFORE INSERT ON copyright_notice_appeal_reviews FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_human_actor('reviewed_by_id');
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_copyright_counter_reviews_immutable BEFORE UPDATE OR DELETE ON copyright_notice_counter_notice_reviews FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_immutable_with_actor_erasure('reviewed_by_id');
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_copyright_counter_reviews_require_actor BEFORE INSERT ON copyright_notice_counter_notice_reviews FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_human_actor('reviewed_by_id');

COMMENT ON TABLE copyright_notice_appeal_reviews IS 'Immutable target-level moderator decisions on informal copyright appeals; agent recommendations remain advisory.';
COMMENT ON COLUMN copyright_notice_appeal_reviews.copyright_notice_submission_id IS 'Informal appeal decided by the moderator.';
COMMENT ON COLUMN copyright_notice_appeal_reviews.copyright_restriction_id IS 'Target restriction affected by the decision.';
COMMENT ON COLUMN copyright_notice_appeal_reviews.copyright_notice_appeal_recommendation_id IS 'Advisory agent recommendation retained as provenance.';
COMMENT ON COLUMN copyright_notice_appeal_reviews.reviewed_at IS 'Time the moderator decided the appeal.';
COMMENT ON COLUMN copyright_notice_appeal_reviews.reviewed_by_id IS 'Moderator who decided the appeal.';
COMMENT ON COLUMN copyright_notice_appeal_reviews.action IS 'Confirm or reverse decision for the restriction.';
COMMENT ON COLUMN copyright_notice_appeal_reviews.rationale_ciphertext IS 'Encrypted moderator rationale.';
COMMENT ON COLUMN copyright_notice_appeal_reviews.manual_fallback_reason_ciphertext IS 'Encrypted reason staff proceeded without an agent recommendation.';
COMMENT ON TABLE copyright_notice_counter_notice_reviews IS 'Immutable moderator formal-compliance decisions for statutory US counter-notices.';
COMMENT ON COLUMN copyright_notice_counter_notice_reviews.copyright_notice_submission_id IS 'Statutory counter-notice reviewed by staff.';
COMMENT ON COLUMN copyright_notice_counter_notice_reviews.copyright_notice_submission_assessment_id IS 'Human compliance assessment created by the review.';
COMMENT ON COLUMN copyright_notice_counter_notice_reviews.copyright_notice_deadline_id IS 'Restoration clock created for an accepted counter-notice.';
COMMENT ON COLUMN copyright_notice_counter_notice_reviews.reviewed_at IS 'Time the moderator completed formal review.';
COMMENT ON COLUMN copyright_notice_counter_notice_reviews.reviewed_by_id IS 'Moderator who completed formal review.';
COMMENT ON COLUMN copyright_notice_counter_notice_reviews.is_accepted IS 'Whether the counter-notice was formally compliant.';
COMMENT ON COLUMN copyright_notice_counter_notice_reviews.rationale_ciphertext IS 'Encrypted moderator rationale.';
