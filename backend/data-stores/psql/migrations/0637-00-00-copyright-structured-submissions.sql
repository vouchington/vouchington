-- Structured declarations are retained independently from the free-text record so an automated
-- recommendation cannot manufacture a statutory statement or broaden a requested target scope.

CREATE TABLE copyright_notice_submission_targets (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_submission_id uuid NOT NULL REFERENCES copyright_notice_submissions(id) ON DELETE RESTRICT,
  copyright_notice_target_id uuid NOT NULL REFERENCES copyright_notice_targets(id) ON DELETE RESTRICT,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (copyright_notice_submission_id, copyright_notice_target_id)
);

CREATE TABLE copyright_notice_submission_requests (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_submission_id uuid NOT NULL UNIQUE REFERENCES copyright_notice_submissions(id) ON DELETE RESTRICT,
  requester_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  idempotency_key uuid NOT NULL,
  request_sha256 bytea NOT NULL CHECK (octet_length(request_sha256) = 32),
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (requester_user_id, idempotency_key)
);

CREATE INDEX idx_copyright_submission_targets__target ON copyright_notice_submission_targets(copyright_notice_target_id, copyright_notice_submission_id);

ALTER TABLE copyright_restrictions
  -- squawk-ignore adding-required-field -- Intake is activation-gated and cannot have restriction rows before this migration.
  ADD COLUMN authorizing_assessment_id uuid NOT NULL;

ALTER TABLE copyright_notice_submission_assessments
  ADD COLUMN copyright_notice_form_screening_id uuid;

ALTER TABLE copyright_restrictions
  ADD CONSTRAINT fk_copyright_restrictions__authorizing_assessment
  FOREIGN KEY (authorizing_assessment_id)
  REFERENCES copyright_notice_submission_assessments(id)
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

CREATE INDEX idx_copyright_restrictions__authorizing_assessment ON copyright_restrictions(authorizing_assessment_id);
CREATE INDEX idx_copyright_assessments__form_screening ON copyright_notice_submission_assessments(copyright_notice_form_screening_id) WHERE copyright_notice_form_screening_id IS NOT NULL;

CREATE OR REPLACE FUNCTION fn_guard_copyright_automated_assessment_screening()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.assessed_by_id IS NOT NULL
    AND NEW.assessed_by_id IS NULL AND NEW.copyright_notice_form_screening_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.assessed_by_id IS NULL AND NOT EXISTS (
    SELECT 1
    FROM copyright_notice_form_screenings screening
    JOIN copyright_notice_form_intakes intake
      ON intake.id = screening.copyright_notice_form_intake_id
    WHERE screening.id = NEW.copyright_notice_form_screening_id
      AND screening.recommendation = 'clear'
      AND intake.copyright_notice_submission_id = NEW.copyright_notice_submission_id
  ) THEN
    RAISE EXCEPTION 'automated copyright assessment requires its exact clear form screening'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.assessed_by_id IS NOT NULL AND NEW.copyright_notice_form_screening_id IS NOT NULL THEN
    RAISE EXCEPTION 'human copyright assessment cannot claim an automated form screening'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_copyright_automated_assessment_screening
BEFORE INSERT OR UPDATE OF assessed_by_id, copyright_notice_form_screening_id
ON copyright_notice_submission_assessments
FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_automated_assessment_screening();

CREATE OR REPLACE FUNCTION fn_guard_copyright_restriction_assessment_scope()
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
    JOIN copyright_notice_targets target
      ON target.id = NEW.copyright_notice_target_id
    WHERE assessment.id = NEW.authorizing_assessment_id
      AND assessment.substantially_compliant
      AND submission.kind = 'notice'
      AND submission.copyright_notice_id = target.copyright_notice_id
      AND (
        submission.source_kind <> 'guest_form'
        OR EXISTS (
          SELECT 1
          FROM copyright_notice_form_intakes intake
          JOIN copyright_notice_form_intake_reviews review
            ON review.copyright_notice_form_intake_id = intake.id
          WHERE intake.copyright_notice_submission_id = submission.id
            AND review.accepted
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

CREATE TRIGGER trigger_copyright_restriction_assessment_scope
BEFORE INSERT OR UPDATE OF authorizing_assessment_id ON copyright_restrictions
FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_restriction_assessment_scope();

CREATE OR REPLACE FUNCTION fn_guard_copyright_submission_target_scope()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM copyright_notice_submissions submission
    JOIN copyright_notice_targets target ON target.id = NEW.copyright_notice_target_id
    WHERE submission.id = NEW.copyright_notice_submission_id
      AND submission.copyright_notice_id = target.copyright_notice_id
  ) THEN
    RAISE EXCEPTION 'copyright submission target must belong to the same notice' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_copyright_submission_targets_scope BEFORE INSERT ON copyright_notice_submission_targets FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_submission_target_scope();
CREATE TRIGGER trigger_copyright_submission_targets_immutable BEFORE UPDATE OR DELETE ON copyright_notice_submission_targets FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_notice_immutable_evidence();
CREATE TRIGGER trigger_copyright_submission_requests_immutable BEFORE UPDATE OR DELETE ON copyright_notice_submission_requests FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_immutable_with_actor_erasure('requester_user_id');

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
