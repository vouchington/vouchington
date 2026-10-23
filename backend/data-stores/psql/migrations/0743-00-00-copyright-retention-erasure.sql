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
  copyright_notice_id UUID NOT NULL UNIQUE REFERENCES copyright_notices (id) ON DELETE CASCADE,
  retention_days INTEGER NOT NULL CHECK (retention_days > 0),
  erased_object_count INTEGER NOT NULL CHECK (erased_object_count >= 0),
  legal_clock_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL);

CREATE TRIGGER trigger_copyright_retention_erasures_immutable BEFORE UPDATE OR DELETE ON copyright_notice_retention_erasures FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_notice_immutable_evidence();

CREATE FUNCTION fn_project_copyright_minimal_record_legal_clock(target_notice_id uuid)
RETURNS timestamptz LANGUAGE sql STABLE AS $$
  SELECT GREATEST(
    notice.created_at,
    (SELECT erased.legal_clock_at FROM copyright_notice_retention_erasures erased
      WHERE erased.copyright_notice_id = notice.id),
    (SELECT event.created_at FROM copyright_notice_lifecycle_changes event
      WHERE event.copyright_notice_id = notice.id ORDER BY event.id DESC LIMIT 1),
    (SELECT work.updated_at FROM copyright_notice_delivery_work_items work
      WHERE work.copyright_notice_id = notice.id ORDER BY work.updated_at DESC LIMIT 1),
    (SELECT incident.updated_at FROM copyright_repeat_infringer_incidents incident
      WHERE incident.copyright_notice_id = notice.id ORDER BY incident.updated_at DESC LIMIT 1),
    (SELECT capability.updated_at FROM copyright_notice_guest_capabilities capability
      WHERE capability.copyright_notice_id = notice.id
      ORDER BY capability.updated_at DESC LIMIT 1),
    (SELECT capability.expires_at FROM copyright_notice_guest_capabilities capability
      WHERE capability.copyright_notice_id = notice.id AND capability.revoked_at IS NULL
      ORDER BY capability.expires_at DESC LIMIT 1),
    identity.email_activity_at,
    (SELECT review.reviewed_at FROM copyright_notice_email_correspondence_reviews review
      WHERE review.copyright_notice_id = notice.id AND review.reviewed_at IS NOT NULL
      ORDER BY review.reviewed_at DESC LIMIT 1)
  ) FROM copyright_notices notice
  JOIN copyright_notice_retained_identities identity ON identity.id = notice.id
  WHERE notice.id = target_notice_id
$$;

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
    WHEN 'copyright_territorial_notice_receipts' THEN ARRAY['requester_user_id', 'hosted_use_url', 'grounds_ciphertext', 'notifier_email_ciphertext']
    WHEN 'copyright_territorial_decisions' THEN ARRAY['rationale_ciphertext', 'public_explanation_ciphertext']
    WHEN 'copyright_territorial_redress_requests' THEN ARRAY['submitted_by_id', 'explanation_ciphertext']
    WHEN 'copyright_territorial_redress_decisions' THEN ARRAY['rationale_ciphertext']
    WHEN 'copyright_eu_supervised_complaints' THEN ARRAY['explanation_ciphertext']
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
COMMENT ON COLUMN copyright_notice_retention_erasures.legal_clock_at IS 'Latest substantive case activity captured before erasure rewrites updated_at values; the minimal-record window does not restart at erasure.';
COMMENT ON COLUMN copyright_notice_retention_erasures.created_at IS 'Time the case was erased, derived from the UUIDv7 id; the row is append-only.';
COMMENT ON FUNCTION fn_copyright_retention_erasable_columns(text) IS 'Columns, per table, that a retention-erasure transaction may overwrite in place; NULL for any table that is never erased. The TypeScript erasure spec must list exactly these columns.';
COMMENT ON FUNCTION fn_copyright_retention_erasure_permitted(text, jsonb, jsonb) IS 'True only inside a transaction that set app.copyright_retention_erasure to on and only when the update changes nothing outside the table''s erasable columns; legal-record guards call it before rejecting an update.';
