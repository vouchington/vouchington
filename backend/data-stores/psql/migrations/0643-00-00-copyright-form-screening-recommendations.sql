ALTER TABLE copyright_notice_form_screenings
  DROP CONSTRAINT copyright_notice_form_screenings_recommendation_check;

ALTER TABLE copyright_notice_form_screenings
  ADD CONSTRAINT copyright_notice_form_screenings_recommendation_check
  CHECK (recommendation IN ('clear', 'uncertain', 'not_obviously_invalid', 'invalid_or_spam'))
  NOT VALID;
ALTER TABLE copyright_notice_form_screenings
  VALIDATE CONSTRAINT copyright_notice_form_screenings_recommendation_check;

COMMENT ON TABLE copyright_notice_form_screenings IS
  'Immutable advisory anti-spam recommendations. Only a workflow service, never an agent, may act on a signed-in intake that is not obviously invalid.';

COMMENT ON TABLE copyright_notice_form_intake_reviews IS
  'Immutable moderator approval or rejection required for guest forms and signed-in forms flagged by anti-spam.';
COMMENT ON COLUMN copyright_notice_form_intake_reviews.copyright_notice_form_intake_id IS
  'Form intake reviewed by a moderator.';

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
      AND screening.recommendation = 'not_obviously_invalid'
      AND intake.copyright_notice_submission_id = NEW.copyright_notice_submission_id
  ) THEN
    RAISE EXCEPTION 'automated copyright assessment requires its exact non-spam form screening'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.assessed_by_id IS NOT NULL AND NEW.copyright_notice_form_screening_id IS NOT NULL THEN
    RAISE EXCEPTION 'human copyright assessment cannot claim an automated form screening'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
