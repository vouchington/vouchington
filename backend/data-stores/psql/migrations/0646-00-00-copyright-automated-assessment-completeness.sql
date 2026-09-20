-- An anti-spam recommendation is not a legal-compliance assessment. The sole automated
-- assessment path is allowed only for an immutable, complete structured US DMCA notice.

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
    JOIN copyright_notice_submissions submission
      ON submission.id = intake.copyright_notice_submission_id
    JOIN copyright_notices notice
      ON notice.id = submission.copyright_notice_id
    WHERE screening.id = NEW.copyright_notice_form_screening_id
      AND screening.recommendation = 'not_obviously_invalid'
      AND submission.id = NEW.copyright_notice_submission_id
      AND submission.kind = 'notice'
      AND submission.source_kind = 'signed_in_form'
      AND intake.requester_user_id IS NOT NULL
      AND notice.jurisdiction = 'us_dmca'
      AND char_length(notice.claimant_contact_ciphertext) > 0
      AND char_length(btrim(notice.work_description)) > 0
      AND intake.good_faith_belief
      AND intake.accuracy_authority_under_penalty_of_perjury
      AND char_length(intake.electronic_signature_ciphertext) > 0
      AND EXISTS (
        SELECT 1
        FROM copyright_notice_targets target
        JOIN copyright_notice_target_images target_image
          ON target_image.copyright_notice_target_id = target.id
        WHERE target.copyright_notice_id = notice.id
          AND char_length(btrim(target.hosted_use_url)) > 0
      )
      AND EXISTS (
        SELECT 1
        FROM copyright_notice_delivery_intents receipt
        JOIN copyright_notice_delivery_recipients recipient
          ON recipient.copyright_notice_delivery_intent_id = receipt.id
        WHERE receipt.copyright_notice_id = notice.id
          AND receipt.recipient_role = 'claimant'
          AND receipt.channel = 'email'
          AND receipt.delivery_kind = 'claimant_receipt'
      )
  ) THEN
    RAISE EXCEPTION 'automated copyright assessment requires an exact non-spam screen and complete structured US DMCA notice'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.assessed_by_id IS NOT NULL AND NEW.copyright_notice_form_screening_id IS NOT NULL THEN
    RAISE EXCEPTION 'human copyright assessment cannot claim an automated form screening'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION fn_guard_copyright_automated_assessment_screening() IS
  'Allows a system-generated substantially-compliant assessment only for a complete, immutable signed-in US DMCA form with its exact anti-spam recommendation; it never replaces mandatory human review.';
