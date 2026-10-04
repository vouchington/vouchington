-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
-- Copyright evidence retention erasure (#1101). A case that has aged past the counsel-approved
-- retention period keeps its legal skeleton (receipt, decisions, dates, repeat-infringer facts) but
-- loses claimant personal data and stored evidence. Legal-record guards stay in force; they allow a
-- transaction that sets app.copyright_retention_erasure to overwrite only the columns listed in
-- fn_copyright_retention_erasable_columns. Rows are overwritten in place, never deleted, so every
-- foreign key and immutability trigger keeps holding.

CREATE TABLE copyright_notice_retention_erasures (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_id UUID NOT NULL UNIQUE REFERENCES copyright_notices (id) ON DELETE RESTRICT,
  retention_days INTEGER NOT NULL CHECK (retention_days > 0),
  erased_object_count INTEGER NOT NULL CHECK (erased_object_count >= 0),
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER trigger_copyright_retention_erasures_immutable BEFORE UPDATE OR DELETE ON copyright_notice_retention_erasures FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_notice_immutable_evidence();

CREATE OR REPLACE FUNCTION fn_copyright_retention_erasable_columns(table_name text)
RETURNS text[] LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE table_name
    WHEN 'copyright_notices' THEN ARRAY['claimant_user_id', 'claimant_display_name', 'claimant_contact_ciphertext', 'work_description']
    WHEN 'copyright_notice_submissions' THEN ARRAY['submitted_by_user_id', 'body_ciphertext']
    WHEN 'copyright_notice_submission_guidance' THEN ARRAY['guidance_ciphertext']
    WHEN 'copyright_notice_submission_requests' THEN ARRAY['requester_user_id']
    WHEN 'copyright_notice_form_intakes' THEN ARRAY['requester_user_id', 'requester_identity_sha256', 'electronic_signature_ciphertext']
    WHEN 'copyright_notice_form_screenings' THEN ARRAY['rationale_ciphertext', 'guidance_ciphertext']
    WHEN 'copyright_notice_form_intake_reviews' THEN ARRAY['rationale_ciphertext']
    WHEN 'copyright_notice_evidence_artifacts' THEN ARRAY['storage_key']
    WHEN 'copyright_notice_email_intakes' THEN ARRAY['raw_storage_key']
    WHEN 'copyright_notice_email_intake_parses' THEN ARRAY['sender_email_ciphertext', 'sender_name_ciphertext', 'subject_ciphertext', 'body_ciphertext', 'message_id_ciphertext', 'reply_references_ciphertext', 'error_ciphertext']
    WHEN 'copyright_notice_email_intake_attachments' THEN ARRAY['filename_ciphertext', 'content_id_ciphertext']
    WHEN 'copyright_notice_email_thread_references' THEN ARRAY['lookup_token']
    WHEN 'copyright_notice_email_intake_notice_links' THEN ARRAY['matched_reference_lookup']
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
    WHEN 'copyright_notice_delivery_intents' THEN ARRAY['body_ciphertext', 'failure_ciphertext']
    WHEN 'copyright_notice_delivery_recipients' THEN ARRAY['email_ciphertext']
    WHEN 'copyright_notice_lifecycle_change_rationales' THEN ARRAY['review_rationale_ciphertext']
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
COMMENT ON COLUMN copyright_notice_retention_erasures.retention_days IS 'Counsel-approved retention period, in days, that was in force when the case was erased.';
COMMENT ON COLUMN copyright_notice_retention_erasures.erased_object_count IS 'Count of stored evidence object keys the case referenced; every version of each was removed from the evidence bucket before this row was written.';
COMMENT ON COLUMN copyright_notice_retention_erasures.created_at IS 'Time the case was erased, derived from the UUIDv7 id; the row is append-only.';
COMMENT ON FUNCTION fn_copyright_retention_erasable_columns(text) IS 'Columns, per table, that a retention-erasure transaction may overwrite in place; NULL for any table that is never erased. The TypeScript erasure spec must list exactly these columns.';
COMMENT ON FUNCTION fn_copyright_retention_erasure_permitted(text, jsonb, jsonb) IS 'True only inside a transaction that set app.copyright_retention_erasure to on and only when the update changes nothing outside the table''s erasable columns; legal-record guards call it before rejecting an update.';
