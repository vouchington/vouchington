CREATE OR REPLACE FUNCTION fn_guard_copyright_restriction_lifecycle()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'copyright restrictions are retained legal records' USING ERRCODE = 'check_violation';
  END IF;
  IF ROW(OLD.copyright_notice_target_id, OLD.imposed_at)
    IS DISTINCT FROM ROW(NEW.copyright_notice_target_id, NEW.imposed_at)
    OR (OLD.imposed_by_id IS DISTINCT FROM NEW.imposed_by_id AND NEW.imposed_by_id IS NOT NULL) THEN
    RAISE EXCEPTION 'copyright restriction origin is immutable' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.lifted_at IS NOT NULL
    AND (OLD.lifted_at IS DISTINCT FROM NEW.lifted_at
      OR (OLD.lifted_by_id IS DISTINCT FROM NEW.lifted_by_id AND NEW.lifted_by_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'copyright restriction lift is immutable' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.human_reviewed_at IS NOT NULL
    AND (ROW(OLD.human_reviewed_at, OLD.human_review_action)
      IS DISTINCT FROM ROW(NEW.human_reviewed_at, NEW.human_review_action)
      OR (OLD.human_reviewed_by_id IS DISTINCT FROM NEW.human_reviewed_by_id
        AND NEW.human_reviewed_by_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'copyright restriction human review is immutable' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.human_reviewed_at IS NULL
    AND NEW.human_reviewed_at IS NOT NULL
    AND NEW.human_reviewed_by_id IS NULL
    AND NOT (
      NEW.human_review_action = 'reverse'
      AND EXISTS (
        SELECT 1
        FROM copyright_notice_submission_assessments assessment
        JOIN copyright_notice_form_intakes intake
          ON intake.copyright_notice_submission_id = assessment.copyright_notice_submission_id
        JOIN copyright_notice_form_intake_reviews review
          ON review.copyright_notice_form_intake_id = intake.id
        WHERE assessment.id = NEW.authorizing_assessment_id
          AND assessment.assessed_by_id IS NULL
          AND assessment.copyright_notice_form_screening_id IS NOT NULL
          AND NOT review.accepted AND review.reviewed_by_id IS NULL
      )
    ) THEN
    RAISE EXCEPTION 'copyright restriction human review requires an identified actor' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION fn_guard_copyright_restriction_lifecycle() IS
  'Retains copyright restriction history while allowing a deleted moderator''s durable rejected form review to reverse only its automated restriction.';
