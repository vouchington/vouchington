-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
-- Copyright evidence retention erasure (#1101). A case that has aged past the owner-approved
-- retention period keeps its legal skeleton (receipt, decisions, dates, repeat-infringer facts) but
-- loses claimant personal data and stored evidence. Legal-record guards stay in force; they allow a
-- transaction that sets app.copyright_retention_erasure to overwrite only the columns listed in
-- fn_copyright_retention_erasable_columns. Rows are overwritten in place, never deleted, so every
-- foreign key and immutability trigger keeps holding.

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE copyright_notice_retention_erasures (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_id UUID NOT NULL UNIQUE REFERENCES copyright_notices (id) ON DELETE RESTRICT,
  retention_days INTEGER NOT NULL CHECK (retention_days > 0),
  erased_object_count INTEGER NOT NULL CHECK (erased_object_count >= 0),
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL);

CREATE TRIGGER trigger_copyright_retention_erasures_immutable BEFORE UPDATE OR DELETE ON copyright_notice_retention_erasures FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_notice_immutable_evidence();

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE FUNCTION fn_copyright_retention_erasable_columns(table_name text)
RETURNS text[] LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE table_name
    WHEN 'copyright_notices' THEN ARRAY['claimant_user_id', 'claimant_display_name', 'claimant_contact_ciphertext', 'work_description']
    WHEN 'copyright_notice_submissions' THEN ARRAY['submitted_by_id', 'body_ciphertext']
    WHEN 'copyright_notice_submission_guidance' THEN ARRAY['guidance_ciphertext']
    WHEN 'copyright_notice_submission_requests' THEN ARRAY['requester_user_id']
    WHEN 'copyright_notice_form_intakes' THEN ARRAY['requester_user_id', 'requester_identity_sha256', 'electronic_signature_ciphertext']
    WHEN 'copyright_notice_form_screenings' THEN ARRAY['rationale_ciphertext', 'guidance_ciphertext']
    WHEN 'copyright_notice_form_intake_reviews' THEN ARRAY['rationale_ciphertext']
    WHEN 'copyright_notice_evidence_artifacts' THEN ARRAY['storage_object_id']
    WHEN 'copyright_notice_email_intakes' THEN ARRAY['raw_storage_object_id']
    WHEN 'copyright_notice_email_intake_parses' THEN ARRAY['sender_email_ciphertext', 'sender_name_ciphertext', 'subject_ciphertext', 'body_ciphertext', 'message_id_ciphertext', 'reply_references_ciphertext', 'error_ciphertext']
    WHEN 'copyright_notice_email_intake_attachments' THEN ARRAY['filename_ciphertext', 'content_id_ciphertext']
    WHEN 'copyright_notice_email_thread_tokens' THEN ARRAY['lookup_digest']
    WHEN 'copyright_notice_email_thread_references' THEN ARRAY['token_id']
    WHEN 'copyright_notice_email_intake_notice_links' THEN ARRAY['matched_token_id']
    WHEN 'copyright_notice_email_intake_recommendations' THEN ARRAY['structured_output_ciphertext']
    WHEN 'copyright_notice_email_intake_reviews' THEN ARRAY['rationale_ciphertext']
    WHEN 'copyright_notice_email_correspondence_reviews' THEN ARRAY['rationale_ciphertext', 'manual_fallback_reason_ciphertext']
    WHEN 'copyright_notice_appeal_recommendations' THEN ARRAY['rationale_ciphertext']
    WHEN 'copyright_notice_appeal_reviews' THEN ARRAY['rationale_ciphertext', 'manual_fallback_reason_ciphertext']
    WHEN 'copyright_restriction_administrator_lifts' THEN ARRAY['rationale_ciphertext']
    WHEN 'copyright_notice_counter_notice_reviews' THEN ARRAY['rationale_ciphertext']
    WHEN 'copyright_notice_legal_hold_assessments' THEN ARRAY['rationale_ciphertext']
    WHEN 'copyright_notice_legal_hold_resolutions' THEN ARRAY['rationale_ciphertext']
    WHEN 'copyright_notice_correspondence_messages' THEN ARRAY['body_ciphertext']
    WHEN 'copyright_notice_delivery_work_items' THEN ARRAY['body_ciphertext', 'failure_ciphertext']
    WHEN 'copyright_notice_delivery_recipients' THEN ARRAY['email_ciphertext']
    WHEN 'copyright_notice_lifecycle_change_rationales' THEN ARRAY['review_rationale_ciphertext']
    WHEN 'copyright_decision_rationales' THEN ARRAY['rationale_ciphertext']
  END
$$;

CREATE OR REPLACE FUNCTION fn_copyright_retention_erasure_permitted(table_name text, old_row jsonb, new_row jsonb)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('app.copyright_retention_erasure', true) = 'on', false)
    AND fn_copyright_retention_erasable_columns(table_name) IS NOT NULL
    AND (old_row - fn_copyright_retention_erasable_columns(table_name))
      = (new_row - fn_copyright_retention_erasable_columns(table_name))
$$;

COMMENT ON TABLE copyright_notice_retention_erasures IS 'Append-only record that a case''s personal data and stored evidence were erased after the retention period. Its presence ends every reader and sweep touch of the case''s erased columns; the case keeps its legal skeleton and repeat-infringer facts.';
COMMENT ON COLUMN copyright_notice_retention_erasures.copyright_notice_id IS 'The erased case; one row per case, so the sweep is idempotent.';
COMMENT ON COLUMN copyright_notice_retention_erasures.retention_days IS 'Owner-approved retention period, in days, that was in force when the case was erased.';
COMMENT ON COLUMN copyright_notice_retention_erasures.erased_object_count IS 'Count of exclusively owned storage objects whose every evidence-bucket version was removed before this row was written.';
COMMENT ON COLUMN copyright_notice_retention_erasures.created_at IS 'Time the case was erased, derived from the UUIDv7 id; the row is append-only.';
COMMENT ON FUNCTION fn_copyright_retention_erasable_columns(text) IS 'Columns, per table, that a retention-erasure transaction may overwrite in place; NULL for any table that is never erased. The TypeScript erasure spec must list exactly these columns.';
COMMENT ON FUNCTION fn_copyright_retention_erasure_permitted(text, jsonb, jsonb) IS 'True only inside a transaction that set app.copyright_retention_erasure to on and only when the update changes nothing outside the table''s erasable columns; legal-record guards call it before rejecting an update.';

-- A decision attempt can be admitted just as the case erasure worker commits. Hold the same
-- notice row lock that its FOR UPDATE conflicts with, then read the marker in a fresh statement.
-- Return NULL for an erased case so its security audit still commits without new legal ciphertext.
CREATE OR REPLACE FUNCTION fn_reject_erased_copyright_decision_rationale()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE case_id UUID;
BEGIN
  FOR case_id IN
    SELECT notice.id FROM copyright_notices notice
    WHERE notice.id = NEW.copyright_notice_id
      OR notice.id IN (
        SELECT link.copyright_notice_id FROM copyright_notice_email_intake_notice_links link
        WHERE link.copyright_notice_email_intake_id = NEW.copyright_notice_email_intake_id)
    ORDER BY notice.id
  LOOP
    PERFORM 1 FROM copyright_notices WHERE id = case_id FOR KEY SHARE;
  END LOOP;
  IF EXISTS (SELECT 1 FROM copyright_notice_retention_erasures erased
    WHERE erased.copyright_notice_id = NEW.copyright_notice_id
      OR erased.copyright_notice_id IN (
        SELECT link.copyright_notice_id FROM copyright_notice_email_intake_notice_links link
        WHERE link.copyright_notice_email_intake_id = NEW.copyright_notice_email_intake_id)) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_copyright_decision_rationales_skip_erased
BEFORE INSERT ON copyright_decision_rationales
FOR EACH ROW EXECUTE FUNCTION fn_reject_erased_copyright_decision_rationale();
COMMENT ON FUNCTION fn_reject_erased_copyright_decision_rationale() IS 'Serializes with case erasure and suppresses fresh legal rationale ciphertext after an erasure marker exists, without suppressing the security attempt.';

-- Copyright rationale rows are bounded. Case-scoped rows retire only after the existing case
-- erasure has redacted them; noncase decisions retire after 1095 days of terminal inactivity.
CREATE OR REPLACE FUNCTION fn_copyright_decision_rationale_retention_eligible(
  rationale copyright_decision_rationales,
  cutoff_at TIMESTAMPTZ
)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT uuid_extract_timestamp(rationale.id) < cutoff_at AND (
    (rationale.copyright_notice_id IS NOT NULL
      AND rationale.rationale_ciphertext = 'erased'
      AND EXISTS (SELECT 1 FROM copyright_notice_retention_erasures erasure
        WHERE erasure.copyright_notice_id = rationale.copyright_notice_id))
    OR (rationale.copyright_notice_email_intake_id IS NOT NULL AND (
      (rationale.rationale_ciphertext = 'erased'
        AND EXISTS (SELECT 1 FROM copyright_notice_email_intake_notice_links link
          WHERE link.copyright_notice_email_intake_id = rationale.copyright_notice_email_intake_id)
        AND NOT EXISTS (
          SELECT 1 FROM copyright_notice_email_intake_notice_links link
          WHERE link.copyright_notice_email_intake_id = rationale.copyright_notice_email_intake_id
            AND NOT EXISTS (SELECT 1 FROM copyright_notice_retention_erasures erasure
              WHERE erasure.copyright_notice_id = link.copyright_notice_id)))
      OR (NOT EXISTS (SELECT 1 FROM copyright_notice_email_intake_notice_links link
            WHERE link.copyright_notice_email_intake_id = rationale.copyright_notice_email_intake_id)
        AND EXISTS (SELECT 1 FROM copyright_notice_email_intake_reviews review
          WHERE review.copyright_notice_email_intake_id = rationale.copyright_notice_email_intake_id
            AND review.decision = 'rejected' AND review.reviewed_at < cutoff_at)
        AND NOT EXISTS (SELECT 1 FROM copyright_notice_delivery_work_items delivery
          WHERE delivery.copyright_notice_email_intake_id = rationale.copyright_notice_email_intake_id
            AND (delivery.state IN ('pending', 'claimed') OR delivery.updated_at >= cutoff_at)))
    ))
    OR (rationale.copyright_repeat_infringer_review_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM copyright_repeat_infringer_reviews review
        WHERE review.id = rationale.copyright_repeat_infringer_review_id
          AND review.outcome IN ('no_action', 'warning', 'reinstatement')
          AND review.outcome_at < cutoff_at
          AND NOT EXISTS (SELECT 1 FROM user_legal_preservation_holds hold
            WHERE hold.account_user_id = review.account_user_id AND hold.released_at IS NULL)))
    OR (rationale.account_user_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM copyright_repeat_infringer_reviews terminal_review
        WHERE terminal_review.account_user_id = rationale.account_user_id
          AND terminal_review.outcome = 'reinstatement'
          AND terminal_review.outcome_at < cutoff_at)
      AND NOT EXISTS (SELECT 1 FROM user_legal_preservation_holds hold
        WHERE hold.account_user_id = rationale.account_user_id
          AND (hold.released_at IS NULL OR hold.released_at >= cutoff_at))
      AND NOT EXISTS (SELECT 1 FROM copyright_repeat_infringer_incidents incident
        WHERE incident.account_user_id = rationale.account_user_id
          AND (incident.is_operative OR incident.created_at >= cutoff_at))
      AND NOT EXISTS (SELECT 1 FROM copyright_repeat_infringer_reviews review
        WHERE review.account_user_id = rationale.account_user_id
          AND (review.outcome IS NULL OR review.outcome_at >= cutoff_at)))
  )
$$;

CREATE OR REPLACE FUNCTION fn_reject_copyright_decision_rationale_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE retention_cutoff TIMESTAMPTZ;
BEGIN
  IF TG_OP = 'UPDATE' AND fn_copyright_retention_erasure_permitted(
    TG_TABLE_NAME, to_jsonb(OLD), to_jsonb(NEW)) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    -- A case record may later be removed after its controlled erasure. Its already-redacted
    -- rationale can follow the case through the notice FK's ON DELETE CASCADE.
    IF OLD.copyright_notice_id IS NOT NULL AND OLD.rationale_ciphertext = 'erased' THEN
      RETURN OLD;
    END IF;
    retention_cutoff := NULLIF(current_setting('app.copyright_rationale_retention_cutoff', TRUE), '')::timestamptz;
    IF retention_cutoff IS NOT NULL
      AND fn_copyright_decision_rationale_retention_eligible(OLD, retention_cutoff) THEN
      RETURN OLD;
    END IF;
  END IF;
  RAISE EXCEPTION 'copyright decision rationale is retained legal evidence'
    USING ERRCODE = 'check_violation';
END;
$$;

CREATE OR REPLACE TRIGGER trigger_copyright_decision_rationales_immutable
BEFORE UPDATE OR DELETE ON copyright_decision_rationales
FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_decision_rationale_mutation();

COMMENT ON FUNCTION fn_copyright_decision_rationale_retention_eligible(copyright_decision_rationales, timestamptz) IS 'True after case erasure or after the approved 1095-day noncase terminal window, with open reviews and preservation holds excluded.';
COMMENT ON FUNCTION fn_reject_copyright_decision_rationale_mutation() IS 'Permits only controlled case redaction or bounded retention deletion of eligible legal rationale.';
