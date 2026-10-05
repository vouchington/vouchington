-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
-- Structured declarations are retained independently from the free-text record so an automated
-- recommendation cannot manufacture a statutory statement or broaden a requested target scope.

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE copyright_notice_submission_targets (
  copyright_notice_id uuid NOT NULL,
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_submission_id uuid NOT NULL,
  copyright_notice_target_id uuid NOT NULL,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_copyright_notice_submissio_targets__submission_id__target_id UNIQUE (copyright_notice_submission_id, copyright_notice_target_id),
  CONSTRAINT fk_copyright_submission_targets__parent_notice
    FOREIGN KEY (copyright_notice_id, copyright_notice_submission_id)
    REFERENCES copyright_notice_submissions(copyright_notice_id, id) ON DELETE RESTRICT,
  UNIQUE (copyright_notice_id, id),
  CONSTRAINT fk_copyright_submission_targets__target_notice
    FOREIGN KEY (copyright_notice_id, copyright_notice_target_id)
    REFERENCES copyright_notice_targets(copyright_notice_id, id) ON DELETE RESTRICT
);
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_update_copyright_submission_targets_scope
  BEFORE INSERT ON copyright_notice_submission_targets FOR EACH ROW
  EXECUTE FUNCTION fn_update_parent_notice_scope('copyright_notice_submissions', 'copyright_notice_submission_id');
COMMENT ON COLUMN copyright_notice_submission_targets.copyright_notice_id IS 'Parent notice scope used by concrete composite foreign keys; populated from the owning parent on insertion.';

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE copyright_notice_submission_requests (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_submission_id uuid NOT NULL CONSTRAINT uq_copyright_notice_submission_requests__submission_id UNIQUE CONSTRAINT fk_copyright_notice_submission_requests__submission REFERENCES copyright_notice_submissions(id) ON DELETE RESTRICT,
  requester_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  idempotency_key uuid NOT NULL,
  request_sha256 bytea NOT NULL CHECK (octet_length(request_sha256) = 32),
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_copyr_notic_submi_reques__requester_user_id__idempotency_key UNIQUE (requester_user_id, idempotency_key)
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_submission_targets__target ON copyright_notice_submission_targets(copyright_notice_target_id, copyright_notice_submission_id);

ALTER TABLE copyright_restrictions
  ADD CONSTRAINT fk_copyright_restrictions__authorizing_assessment
  FOREIGN KEY (copyright_notice_id, authorizing_assessment_id)
  REFERENCES copyright_notice_submission_assessments(copyright_notice_id, id)
  ON DELETE RESTRICT NOT VALID;

ALTER TABLE copyright_restrictions
  VALIDATE CONSTRAINT fk_copyright_restrictions__authorizing_assessment;

ALTER TABLE copyright_notice_submission_assessments
  ADD CONSTRAINT fk_copyright_assessments__form_screening
  FOREIGN KEY (copyright_notice_form_screening_id)
  REFERENCES copyright_notice_form_screenings(id)
  ON DELETE RESTRICT NOT VALID;

ALTER TABLE copyright_notice_submission_assessments
  VALIDATE CONSTRAINT fk_copyright_assessments__form_screening;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_restrictions__authorizing_assessment ON copyright_restrictions(authorizing_assessment_id);
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_submission_assessments__form_screening ON copyright_notice_submission_assessments(copyright_notice_form_screening_id) WHERE copyright_notice_form_screening_id IS NOT NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE FUNCTION fn_reject_copyright_restriction_assessment_scope()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.authorizing_assessment_id IS DISTINCT FROM OLD.authorizing_assessment_id THEN
    RAISE EXCEPTION 'copyright restriction authorizing assessment is immutable'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM copyright_notice_submission_assessments assessment
    JOIN copyright_notice_submissions submission
      ON submission.id = assessment.copyright_notice_submission_id
    WHERE assessment.id = NEW.authorizing_assessment_id
      AND assessment.is_substantially_compliant
      AND submission.kind = 'notice'
      AND (
        submission.source_kind <> 'guest_form'
        OR EXISTS (
          SELECT 1
          FROM copyright_notice_form_intakes intake
          JOIN copyright_notice_form_intake_reviews review
            ON review.copyright_notice_form_intake_id = intake.id
          WHERE intake.copyright_notice_submission_id = submission.id
            AND review.is_accepted
        )
      )
      AND NOT EXISTS (
        SELECT 1 FROM copyright_notice_submission_assessments newer
        WHERE newer.supersedes_assessment_id = assessment.id
      )
  ) THEN
    RAISE EXCEPTION 'copyright restriction requires a current compliant notice assessment in the same case'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_copyright_restriction_assessment_scope
BEFORE INSERT OR UPDATE OF authorizing_assessment_id ON copyright_restrictions
FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_restriction_assessment_scope();

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_copyright_submission_targets_immutable BEFORE UPDATE OR DELETE ON copyright_notice_submission_targets FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_notice_immutable_evidence();
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_copyright_submission_requests_immutable BEFORE UPDATE OR DELETE ON copyright_notice_submission_requests FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_immutable_with_actor_erasure('requester_user_id');

COMMENT ON TABLE copyright_notice_submission_targets IS 'Exact case targets selected by an appellant or statutory counter-notice sender before compliance assessment.';
COMMENT ON TABLE copyright_notice_submission_requests IS 'Idempotency records for authenticated appeal and counter-notice submissions.';
COMMENT ON COLUMN copyright_restrictions.authorizing_assessment_id IS 'Immutable exact compliant assessment that authorized this restriction.';
COMMENT ON COLUMN copyright_notice_submission_assessments.copyright_notice_form_screening_id IS 'Exact clear anti-spam screening authorizing an automated initial-notice assessment; null for human decisions.';
COMMENT ON COLUMN copyright_notice_submission_targets.copyright_notice_submission_id IS 'Appeal or counter-notice whose scope is being recorded.';
COMMENT ON COLUMN copyright_notice_submission_targets.copyright_notice_target_id IS 'Exact case target selected by the affected poster.';
COMMENT ON COLUMN copyright_notice_submission_requests.copyright_notice_submission_id IS 'Submission admitted for this idempotent request.';
COMMENT ON COLUMN copyright_notice_submission_requests.requester_user_id IS 'Authenticated affected poster making the request.';
COMMENT ON COLUMN copyright_notice_submission_requests.idempotency_key IS 'Caller-generated UUID preventing duplicate response admission.';
COMMENT ON COLUMN copyright_notice_submission_requests.request_sha256 IS 'Digest used to reject conflicting reuse of an idempotency key.';
