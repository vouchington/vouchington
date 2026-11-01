-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
-- Copyright evidence retention erasure (#1101). A case that has aged past the owner-approved
-- retention period keeps its legal skeleton (receipt, decisions, dates, repeat-infringer facts) but
-- loses claimant personal data and stored evidence. Legal-record guards stay in force; they allow a
-- transaction that sets app.copyright_retention_erasure to overwrite only the columns listed in
-- fn_copyright_retention_erasable_columns. Rows are overwritten in place, never deleted, so every
-- foreign key and immutability trigger keeps holding until final case deletion.

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE FUNCTION fn_copyright_retention_erasable_columns(table_name text)
RETURNS text[] LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE table_name
    WHEN 'copyright_notices' THEN ARRAY['claimant_user_id', 'claimant_display_name', 'claimant_contact_ciphertext', 'work_description', 'territorial_rationale_ciphertext', 'territorial_public_explanation_ciphertext']
    WHEN 'copyright_notice_submissions' THEN ARRAY['submitted_by_id', 'body_ciphertext']
    WHEN 'copyright_notice_submission_guidance' THEN ARRAY['guidance_ciphertext']
    WHEN 'copyright_notice_submission_requests' THEN ARRAY['requester_user_id']
    WHEN 'copyright_notice_form_intakes' THEN ARRAY['requester_user_id', 'requester_identity_sha256', 'electronic_signature_ciphertext']
    WHEN 'copyright_notice_form_screenings' THEN ARRAY['rationale_ciphertext', 'guidance_ciphertext']
    WHEN 'copyright_notice_form_intake_reviews' THEN ARRAY['rationale_ciphertext']
    WHEN 'copyright_notice_evidence_artifacts' THEN ARRAY['storage_object_id']
    WHEN 'copyright_notice_email_intake_receipts' THEN ARRAY['review_rationale_ciphertext']
    WHEN 'copyright_notice_email_intakes' THEN ARRAY['raw_storage_object_id', 'current_recommendation_output_ciphertext']
    WHEN 'copyright_notice_email_intake_parses' THEN ARRAY['sender_email_ciphertext', 'sender_name_ciphertext', 'subject_ciphertext', 'body_ciphertext', 'message_id_ciphertext', 'reply_references_ciphertext', 'error_ciphertext']
    WHEN 'copyright_notice_email_intake_attachments' THEN ARRAY['filename_ciphertext', 'content_id_ciphertext']
    WHEN 'copyright_notice_email_thread_tokens' THEN ARRAY['lookup_digest']
    WHEN 'copyright_notice_email_thread_references' THEN ARRAY['token_id']
    WHEN 'copyright_notice_email_intake_notice_links' THEN ARRAY['matched_token_id', 'correspondence_rationale_ciphertext', 'correspondence_manual_fallback_reason_ciphertext']
    WHEN 'copyright_notice_email_intake_recommendations' THEN ARRAY['structured_output_ciphertext']
    WHEN 'copyright_notice_email_intake_reviews' THEN ARRAY['rationale_ciphertext']
    WHEN 'copyright_notice_email_correspondence_reviews' THEN ARRAY['rationale_ciphertext', 'manual_fallback_reason_ciphertext']
    WHEN 'copyright_notice_appeal_recommendations' THEN ARRAY['rationale_ciphertext']
    WHEN 'copyright_notice_appeal_reviews' THEN ARRAY['rationale_ciphertext', 'manual_fallback_reason_ciphertext']
    WHEN 'copyright_restriction_administrator_lifts' THEN ARRAY['rationale_ciphertext']
    WHEN 'copyright_restrictions' THEN ARRAY['administrator_lift_rationale_ciphertext']
    WHEN 'copyright_notice_counter_notice_reviews' THEN ARRAY['rationale_ciphertext']
    WHEN 'copyright_notice_legal_hold_assessments' THEN ARRAY['rationale_ciphertext']
    WHEN 'copyright_notice_legal_hold_resolutions' THEN ARRAY['rationale_ciphertext']
    WHEN 'copyright_notice_correspondence_messages' THEN ARRAY['body_ciphertext']
    WHEN 'copyright_notice_delivery_work_items' THEN ARRAY['body_ciphertext', 'failure_ciphertext']
    WHEN 'copyright_notice_delivery_recipients' THEN ARRAY['email_ciphertext']
    WHEN 'copyright_notice_lifecycle_changes' THEN ARRAY['review_rationale_ciphertext']
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
        WHERE link.copyright_notice_email_intake_id = NEW.copyright_notice_email_intake_receipt_id)
    ORDER BY notice.id
  LOOP
    PERFORM 1 FROM copyright_notices WHERE id = case_id FOR UPDATE;
  END LOOP;
  IF EXISTS (SELECT 1 FROM copyright_notices erased
    WHERE erased.evidence_erased_at IS NOT NULL
      AND (erased.id = NEW.copyright_notice_id
      OR erased.id IN (
        SELECT link.copyright_notice_id FROM copyright_notice_email_intake_notice_links link
        WHERE link.copyright_notice_email_intake_id = NEW.copyright_notice_email_intake_receipt_id))) THEN
    RETURN NULL;
  END IF;
  UPDATE copyright_notices notice SET last_legal_activity_at =
    GREATEST(notice.last_legal_activity_at, clock_timestamp())
    WHERE notice.id = NEW.copyright_notice_id
      OR notice.id IN (SELECT link.copyright_notice_id
        FROM copyright_notice_email_intake_notice_links link
        WHERE link.copyright_notice_email_intake_id = NEW.copyright_notice_email_intake_receipt_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_copyright_decision_rationales_skip_erased
BEFORE INSERT ON copyright_decision_rationales
FOR EACH ROW EXECUTE FUNCTION fn_reject_erased_copyright_decision_rationale();
COMMENT ON FUNCTION fn_reject_erased_copyright_decision_rationale() IS 'Serializes with case erasure and suppresses fresh legal rationale ciphertext after an erasure marker exists, without suppressing the security attempt.';

CREATE OR REPLACE FUNCTION fn_reject_copyright_decision_rationale_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE retention_cutoff TIMESTAMPTZ;
BEGIN
  IF TG_OP = 'DELETE' AND fn_copyright_case_purge_permitted(TG_TABLE_NAME) THEN RETURN OLD; END IF;
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

COMMENT ON FUNCTION fn_reject_copyright_decision_rationale_mutation() IS 'Permits only controlled case redaction or bounded retention deletion of eligible legal rationale.';

-- Receipt-owned private rows have no case FK. Serialize their current writers
-- with the linked case before each new row, so a page cannot pass an old cursor
-- and later miss new ciphertext after the evidence marker is committed.
CREATE FUNCTION fn_fence_copyright_linked_email_private_write()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  receipt_id uuid;
  work_id uuid;
  case_id uuid;
  erased_at timestamptz;
BEGIN
  CASE TG_ARGV[0]
    WHEN 'intake', 'receipt' THEN
      receipt_id := NULLIF(to_jsonb(NEW) ->> TG_ARGV[1], '')::uuid;
    WHEN 'work' THEN
      work_id := NULLIF(to_jsonb(NEW) ->> TG_ARGV[1], '')::uuid;
    WHEN 'attempt' THEN
      SELECT attempt.work_item_id INTO work_id FROM copyright_notice_delivery_attempts attempt
        WHERE attempt.id = NULLIF(to_jsonb(NEW) ->> TG_ARGV[1], '')::uuid;
    ELSE RAISE EXCEPTION 'unsupported copyright linked-email write source';
  END CASE;
  IF work_id IS NOT NULL THEN
    SELECT work.copyright_notice_email_intake_receipt_id INTO receipt_id
    FROM copyright_notice_delivery_work_items work WHERE work.id = work_id;
  END IF;
  IF receipt_id IS NULL THEN RETURN NEW; END IF;
  SELECT notice.id, notice.evidence_erased_at INTO case_id, erased_at
    FROM copyright_notice_email_intake_notice_links link
    JOIN copyright_notices notice ON notice.id = link.copyright_notice_id
    WHERE link.copyright_notice_email_intake_id = receipt_id
    FOR UPDATE OF notice;
  IF case_id IS NULL THEN RETURN NEW; END IF;
  IF erased_at IS NOT NULL THEN
    RAISE EXCEPTION 'erased copyright case cannot acquire private email facts'
      USING ERRCODE = 'check_violation';
  END IF;
  UPDATE copyright_notices SET last_legal_activity_at =
    GREATEST(last_legal_activity_at, clock_timestamp()) WHERE id = case_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trigger_fence_copyright_email_parse_case
  BEFORE INSERT ON copyright_notice_email_intake_parses FOR EACH ROW
  EXECUTE FUNCTION fn_fence_copyright_linked_email_private_write('intake', 'copyright_notice_email_intake_id');
CREATE TRIGGER trigger_fence_copyright_email_attachment_case
  BEFORE INSERT ON copyright_notice_email_intake_attachments FOR EACH ROW
  EXECUTE FUNCTION fn_fence_copyright_linked_email_private_write('intake', 'copyright_notice_email_intake_id');
CREATE TRIGGER trigger_fence_copyright_email_reference_case
  BEFORE INSERT ON copyright_notice_email_thread_references FOR EACH ROW
  EXECUTE FUNCTION fn_fence_copyright_linked_email_private_write('intake', 'copyright_notice_email_intake_id');
CREATE TRIGGER trigger_fence_copyright_email_recommendation_case
  BEFORE INSERT ON copyright_notice_email_intake_recommendations FOR EACH ROW
  EXECUTE FUNCTION fn_fence_copyright_linked_email_private_write('receipt', 'copyright_notice_email_intake_receipt_id');
CREATE TRIGGER trigger_fence_copyright_email_review_case
  BEFORE INSERT ON copyright_notice_email_intake_reviews FOR EACH ROW
  EXECUTE FUNCTION fn_fence_copyright_linked_email_private_write('receipt', 'copyright_notice_email_intake_receipt_id');
CREATE TRIGGER trigger_fence_copyright_email_recommendation_identity_case
  BEFORE INSERT ON copyright_notice_email_intake_recommendation_identities FOR EACH ROW
  EXECUTE FUNCTION fn_fence_copyright_linked_email_private_write('receipt', 'copyright_notice_email_intake_receipt_id');
CREATE TRIGGER trigger_fence_copyright_email_delivery_work_case
  BEFORE INSERT ON copyright_notice_delivery_work_items FOR EACH ROW
  EXECUTE FUNCTION fn_fence_copyright_linked_email_private_write('receipt', 'copyright_notice_email_intake_receipt_id');
CREATE TRIGGER trigger_fence_copyright_email_delivery_recipient_case
  BEFORE INSERT ON copyright_notice_delivery_recipients FOR EACH ROW
  EXECUTE FUNCTION fn_fence_copyright_linked_email_private_write('work', 'copyright_notice_delivery_work_item_id');
CREATE TRIGGER trigger_fence_copyright_email_delivery_attempt_case
  BEFORE INSERT ON copyright_notice_delivery_attempts FOR EACH ROW
  EXECUTE FUNCTION fn_fence_copyright_linked_email_private_write('work', 'work_item_id');
CREATE TRIGGER trigger_fence_copyright_email_delivery_result_case
  BEFORE INSERT ON copyright_notice_delivery_attempt_results FOR EACH ROW
  EXECUTE FUNCTION fn_fence_copyright_linked_email_private_write('attempt', 'attempt_id');
