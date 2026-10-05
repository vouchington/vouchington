-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
-- Copyright-designated email is retained before any agent or moderation workflow runs.  It is
-- intentionally separate from a legal case because email cannot safely identify a target until a
-- moderator verifies the agent's extraction.

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE copyright_notice_email_intakes (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  ses_message_id text NOT NULL UNIQUE CHECK (char_length(ses_message_id) BETWEEN 1 AND 512),
  received_at timestamptz NOT NULL,
  raw_storage_key text NOT NULL CHECK (char_length(raw_storage_key) BETWEEN 1 AND 1024),
  raw_sha256 bytea NOT NULL CHECK (octet_length(raw_sha256) = 32),
  raw_media_type_id bigint NOT NULL REFERENCES media_types(id) ON DELETE RESTRICT,
  raw_byte_size integer NOT NULL CHECK (raw_byte_size >= 0),
  spf_verdict email_security_verdicts NOT NULL CHECK (spf_verdict IN ('pass', 'fail', 'gray', 'processing_failed', 'unknown')),
  dkim_verdict email_security_verdicts NOT NULL CHECK (dkim_verdict IN ('pass', 'fail', 'gray', 'processing_failed', 'unknown')),
  dmarc_verdict email_security_verdicts NOT NULL CHECK (dmarc_verdict IN ('pass', 'fail', 'gray', 'processing_failed', 'unknown')),
  spam_verdict email_security_verdicts NOT NULL CHECK (spam_verdict IN ('pass', 'fail', 'gray', 'processing_failed', 'unknown')),
  virus_verdict email_security_verdicts NOT NULL CHECK (virus_verdict IN ('pass', 'fail', 'gray', 'processing_failed', 'unknown')),
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE copyright_notice_lifecycle_changes
  ADD CONSTRAINT copyright_lifecycle_event_email_intake_fk
  FOREIGN KEY (copyright_notice_email_intake_id)
  REFERENCES copyright_notice_email_intakes(id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE copyright_notice_lifecycle_changes
  VALIDATE CONSTRAINT copyright_lifecycle_event_email_intake_fk;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE copyright_notice_email_intake_parses (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_email_intake_id uuid NOT NULL UNIQUE REFERENCES copyright_notice_email_intakes(id) ON DELETE RESTRICT,
  status copyright_notice_email_intake_parse_statuses NOT NULL CHECK (status IN ('succeeded', 'failed')),
  sender_email_ciphertext text CHECK (char_length(sender_email_ciphertext) BETWEEN 1 AND 1048576),
  sender_name_ciphertext text,
  subject_ciphertext text CHECK (char_length(subject_ciphertext) BETWEEN 1 AND 4194304),
  body_ciphertext text CHECK (char_length(body_ciphertext) BETWEEN 1 AND 4194304),
  message_id_ciphertext text CHECK (char_length(message_id_ciphertext) BETWEEN 1 AND 1048576),
  reply_references_ciphertext text CHECK (char_length(reply_references_ciphertext) BETWEEN 1 AND 1048576),
  error_ciphertext text CHECK (char_length(error_ciphertext) BETWEEN 1 AND 1048576),
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (status = 'succeeded' AND sender_email_ciphertext IS NOT NULL AND subject_ciphertext IS NOT NULL AND body_ciphertext IS NOT NULL AND error_ciphertext IS NULL)
    OR
    (status = 'failed' AND sender_email_ciphertext IS NULL AND sender_name_ciphertext IS NULL AND subject_ciphertext IS NULL AND body_ciphertext IS NULL AND message_id_ciphertext IS NULL AND reply_references_ciphertext IS NULL AND error_ciphertext IS NOT NULL)
  )
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE copyright_notice_email_intake_attachments (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_email_intake_id uuid NOT NULL REFERENCES copyright_notice_email_intakes(id) ON DELETE RESTRICT,
  ordinal integer NOT NULL CHECK (ordinal >= 0),
  filename_ciphertext text CHECK (char_length(filename_ciphertext) BETWEEN 1 AND 16384),
  content_id_ciphertext text CHECK (char_length(content_id_ciphertext) BETWEEN 1 AND 16384),
  media_type_id bigint NOT NULL REFERENCES media_types(id) ON DELETE RESTRICT,
  byte_size integer NOT NULL CHECK (byte_size >= 0),
  sha256 bytea NOT NULL CHECK (octet_length(sha256) = 32),
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (copyright_notice_email_intake_id, ordinal)
);

CREATE TABLE copyright_notice_email_intake_recommendations (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_email_intake_id uuid NOT NULL REFERENCES copyright_notice_email_intakes(id) ON DELETE RESTRICT,
  input_sha256 bytea NOT NULL CHECK (octet_length(input_sha256) = 32),
  prompt_version text NOT NULL CHECK (char_length(prompt_version) BETWEEN 1 AND 100),
  model text NOT NULL CHECK (char_length(model) BETWEEN 1 AND 255),
  structured_output_ciphertext text NOT NULL CHECK (char_length(structured_output_ciphertext) BETWEEN 1 AND 1048576),
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (copyright_notice_email_intake_id, input_sha256, prompt_version),
  UNIQUE (copyright_notice_email_intake_id, id)
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE copyright_notice_email_intake_reviews (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_email_intake_id uuid NOT NULL REFERENCES copyright_notice_email_intakes(id) ON DELETE RESTRICT,
  copyright_notice_email_intake_recommendation_id uuid,
  reviewed_at timestamptz NOT NULL,
  reviewed_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decision copyright_notice_email_intake_review_decisions NOT NULL CHECK (decision IN ('approved', 'rejected', 'legal_process')),
  rationale_ciphertext text NOT NULL CHECK (char_length(rationale_ciphertext) BETWEEN 1 AND 1048576),
  promoted_copyright_notice_id uuid UNIQUE REFERENCES copyright_notices(id) ON DELETE RESTRICT,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (copyright_notice_email_intake_id),
  CHECK ((decision = 'approved') = (promoted_copyright_notice_id IS NOT NULL)),
  CONSTRAINT fk_copyright_email_reviews__recommendation_intake
    FOREIGN KEY (copyright_notice_email_intake_id, copyright_notice_email_intake_recommendation_id)
    REFERENCES copyright_notice_email_intake_recommendations(copyright_notice_email_intake_id, id) ON DELETE RESTRICT
);

CREATE INDEX idx_copyright_email_intake_attachments__intake ON copyright_notice_email_intake_attachments(copyright_notice_email_intake_id, id);
CREATE INDEX idx_copyright_email_recommendations__intake ON copyright_notice_email_intake_recommendations(copyright_notice_email_intake_id, id DESC);
CREATE INDEX idx_copyright_email_reviews__intake ON copyright_notice_email_intake_reviews(copyright_notice_email_intake_id, id DESC);
CREATE INDEX idx_copyright_email_reviews__reviewer ON copyright_notice_email_intake_reviews(reviewed_by_id, id DESC);
CREATE INDEX idx_copyright_email_reviews__recommendation ON copyright_notice_email_intake_reviews(copyright_notice_email_intake_recommendation_id) WHERE copyright_notice_email_intake_recommendation_id IS NOT NULL;

CREATE TRIGGER trigger_copyright_email_intakes_immutable BEFORE UPDATE OR DELETE ON copyright_notice_email_intakes FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_notice_immutable_evidence();
CREATE TRIGGER trigger_copyright_email_parses_immutable BEFORE UPDATE OR DELETE ON copyright_notice_email_intake_parses FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_notice_immutable_evidence();
CREATE TRIGGER trigger_copyright_email_attachments_immutable BEFORE UPDATE OR DELETE ON copyright_notice_email_intake_attachments FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_notice_immutable_evidence();
CREATE TRIGGER trigger_copyright_email_recommendations_immutable BEFORE UPDATE OR DELETE ON copyright_notice_email_intake_recommendations FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_notice_immutable_evidence();
CREATE TRIGGER trigger_copyright_email_reviews_immutable BEFORE UPDATE OR DELETE ON copyright_notice_email_intake_reviews FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_immutable_with_actor_erasure('reviewed_by_id');
CREATE TRIGGER trigger_copyright_email_reviews_require_actor BEFORE INSERT ON copyright_notice_email_intake_reviews FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_human_actor('reviewed_by_id');

COMMENT ON TABLE copyright_notice_email_intakes IS 'Immutable, private records for email sent to the designated copyright inbox before a moderator validates it into a legal case.';
COMMENT ON COLUMN copyright_notice_email_intakes.raw_storage_key IS 'Private immutable original RFC 5322 object. The original preserves every attachment and is retained before the SES source object can be deleted.';
COMMENT ON TABLE copyright_notice_email_intake_attachments IS 'Private parsed attachment metadata; attachment bytes remain preserved inside the original MIME object until a moderator admits them as case evidence.';
COMMENT ON TABLE copyright_notice_email_intake_recommendations IS 'Immutable agent extraction and recommendation. It is advisory only and cannot impose a copyright restriction.';
COMMENT ON TABLE copyright_notice_email_intake_reviews IS 'Append-only staff decision on an email intake: approval into a case, rejection, or closure as legal process with no reply. This row is the audit record of the decision. A moderator must review before an email can create or affect a copyright case.';
COMMENT ON COLUMN copyright_notice_email_intakes.ses_message_id IS 'Stable SES delivery identifier used for replay-safe admission.';
COMMENT ON COLUMN copyright_notice_email_intakes.received_at IS 'Timestamp assigned by the inbound email delivery.';
COMMENT ON COLUMN copyright_notice_email_intakes.raw_sha256 IS 'SHA-256 digest of the preserved original RFC 5322 message.';
COMMENT ON COLUMN copyright_notice_email_intakes.raw_media_type_id IS 'Media type of the preserved original message.';
COMMENT ON COLUMN copyright_notice_email_intakes.raw_byte_size IS 'Byte size of the preserved original message.';
COMMENT ON COLUMN copyright_notice_email_intakes.spf_verdict IS 'SES SPF verdict from the amazonses.com Authentication-Results header SES added at receipt; unknown when SES reported none. Advisory risk signal only.';
COMMENT ON COLUMN copyright_notice_email_intakes.dkim_verdict IS 'SES DKIM verdict from the amazonses.com Authentication-Results header; pass means a DKIM signature validated, not that the signing domain aligns with the From domain. unknown when SES reported none. Advisory risk signal only.';
COMMENT ON COLUMN copyright_notice_email_intakes.dmarc_verdict IS 'SES DMARC verdict from the amazonses.com Authentication-Results header; unknown when SES reported none. Advisory risk signal only.';
COMMENT ON COLUMN copyright_notice_email_intakes.spam_verdict IS 'SES spam verdict from the X-SES-Spam-Verdict header SES added at receipt; unknown when SES reported none. Advisory risk signal only.';
COMMENT ON COLUMN copyright_notice_email_intakes.virus_verdict IS 'SES malware verdict from the X-SES-Virus-Verdict header SES added at receipt; unknown when SES reported none. A fail quarantines the original message so staff cannot download it.';
COMMENT ON TABLE copyright_notice_email_intake_parses IS 'Append-only bounded MIME parse result. Failed parsing remains a staff-visible legal intake with the immutable original attached.';
COMMENT ON COLUMN copyright_notice_email_intake_parses.copyright_notice_email_intake_id IS 'Immutable email evidence record parsed by this result.';
COMMENT ON COLUMN copyright_notice_email_intake_parses.status IS 'Whether bounded MIME parsing succeeded or failed.';
COMMENT ON COLUMN copyright_notice_email_intake_parses.sender_email_ciphertext IS 'Encrypted sender email address; never exposed in the public case projection.';
COMMENT ON COLUMN copyright_notice_email_intake_parses.sender_name_ciphertext IS 'Encrypted optional sender display name.';
COMMENT ON COLUMN copyright_notice_email_intake_parses.subject_ciphertext IS 'Encrypted original email subject.';
COMMENT ON COLUMN copyright_notice_email_intake_parses.body_ciphertext IS 'Encrypted parsed text body supplied to the extraction agent.';
COMMENT ON COLUMN copyright_notice_email_intake_parses.message_id_ciphertext IS 'Encrypted RFC Message-ID retained for case-scoped correspondence threading.';
COMMENT ON COLUMN copyright_notice_email_intake_parses.reply_references_ciphertext IS 'Encrypted bounded RFC reply references retained for case-scoped correspondence threading.';
COMMENT ON COLUMN copyright_notice_email_intake_parses.error_ciphertext IS 'Encrypted bounded parser failure for moderator review; raw parser output is not retained.';
COMMENT ON COLUMN copyright_notice_email_intake_attachments.copyright_notice_email_intake_id IS 'Owning immutable email intake.';
COMMENT ON COLUMN copyright_notice_email_intake_attachments.ordinal IS 'Zero-based MIME attachment order; duplicate attachment bytes remain distinct evidence.';
COMMENT ON COLUMN copyright_notice_email_intake_attachments.filename_ciphertext IS 'Encrypted attachment filename metadata.';
COMMENT ON COLUMN copyright_notice_email_intake_attachments.content_id_ciphertext IS 'Encrypted MIME content identifier metadata.';
COMMENT ON COLUMN copyright_notice_email_intake_attachments.media_type_id IS 'Declared attachment media type.';
COMMENT ON COLUMN copyright_notice_email_intake_attachments.byte_size IS 'Decoded attachment byte size.';
COMMENT ON COLUMN copyright_notice_email_intake_attachments.sha256 IS 'SHA-256 digest computed while streaming the attachment.';
COMMENT ON COLUMN copyright_notice_email_intake_recommendations.copyright_notice_email_intake_id IS 'Email intake evaluated by this advisory recommendation.';
COMMENT ON COLUMN copyright_notice_email_intake_recommendations.input_sha256 IS 'Digest of the exact sanitized extraction input.';
COMMENT ON COLUMN copyright_notice_email_intake_recommendations.prompt_version IS 'Versioned extraction and recommendation prompt.';
COMMENT ON COLUMN copyright_notice_email_intake_recommendations.model IS 'Model identifier recorded for recommendation provenance.';
COMMENT ON COLUMN copyright_notice_email_intake_recommendations.structured_output_ciphertext IS 'Encrypted bounded agent extraction and recommendation.';
COMMENT ON COLUMN copyright_notice_email_intake_reviews.copyright_notice_email_intake_id IS 'Email intake reviewed by a moderator.';
COMMENT ON COLUMN copyright_notice_email_intake_reviews.copyright_notice_email_intake_recommendation_id IS 'Optional advisory recommendation reviewed as provenance.';
COMMENT ON COLUMN copyright_notice_email_intake_reviews.reviewed_at IS 'Moderator-supplied review completion timestamp.';
COMMENT ON COLUMN copyright_notice_email_intake_reviews.reviewed_by_id IS 'Staff member who decided the intake; erased on account deletion.';
COMMENT ON COLUMN copyright_notice_email_intake_reviews.decision IS 'Staff decision: approved opened a case, rejected declined the email as a copyright notice and may have queued a reply, legal_process closed it as legal process such as a subpoena with no reply, case, or claimant-visible event.';
COMMENT ON COLUMN copyright_notice_email_intake_reviews.rationale_ciphertext IS 'Encrypted staff rationale, or for legal_process the encrypted reason; it can name a legal matter and is never logged or returned.';
COMMENT ON COLUMN copyright_notice_email_intake_reviews.promoted_copyright_notice_id IS 'Legal case created by an approved review; null for every other decision.';

-- Current indexes for fresh schema bootstrap.
CREATE INDEX IF NOT EXISTS idx_copyright_notice_email_intakes__received_id
  ON copyright_notice_email_intakes (received_at, id);

CREATE INDEX idx_copyright_notice_email_intakes__raw_media_type_id ON copyright_notice_email_intakes (raw_media_type_id);

CREATE INDEX idx_copyright_notice_email_intake_attachments__media_type_id ON copyright_notice_email_intake_attachments (media_type_id);
