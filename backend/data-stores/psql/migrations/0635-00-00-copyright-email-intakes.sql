-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
-- Copyright-designated email is retained before any agent or moderation workflow runs.  It is
-- intentionally separate from a legal case because email cannot safely identify a target until a
-- moderator verifies the agent's extraction.

CREATE TABLE copyright_notice_email_intake_receipts (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  amazon_ses_message_id text NOT NULL UNIQUE CHECK (char_length(amazon_ses_message_id) BETWEEN 1 AND 512),
  raw_sha256 bytea NOT NULL CHECK (octet_length(raw_sha256) = 32),
  raw_storage_key_sha256 bytea NOT NULL CHECK (octet_length(raw_storage_key_sha256) = 32),
  raw_byte_size integer NOT NULL CHECK (raw_byte_size >= 0),
  erased_at timestamptz,
  review_decision copyright_notice_email_intake_review_decisions,
  review_retirement_check_after timestamptz NOT NULL DEFAULT '-infinity'::timestamptz,
  current_preservation_hold_token uuid,
  preservation_hold_kind text CHECK (preservation_hold_kind IN ('litigation_threat', 'regulator_request', 'court_request')),
  preservation_hold_placed_at timestamptz,
  preservation_hold_placed_by_id uuid REFERENCES retained_user_identities(id) ON DELETE RESTRICT,
  preservation_hold_released_at timestamptz,
  preservation_hold_released_by_id uuid REFERENCES retained_user_identities(id) ON DELETE RESTRICT,
  last_preservation_hold_released_at timestamptz,
  review_rationale_ciphertext text
    CHECK (char_length(review_rationale_ciphertext) BETWEEN 1 AND 1048576),
  reviewed_at timestamptz,
  reviewed_by_id uuid REFERENCES retained_user_identities(id) ON DELETE RESTRICT,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  CONSTRAINT chk_copyright_email_intake_receipts__review_result CHECK (
    (review_decision IS NULL AND reviewed_at IS NULL AND reviewed_by_id IS NULL AND review_rationale_ciphertext IS NULL)
    OR (review_decision IS NOT NULL AND reviewed_at IS NOT NULL AND reviewed_by_id IS NOT NULL AND review_rationale_ciphertext IS NOT NULL)),
  CONSTRAINT chk_copyright_email_receipts__preservation CHECK (
    (preservation_hold_kind IS NULL AND current_preservation_hold_token IS NULL
      AND preservation_hold_placed_at IS NULL AND preservation_hold_placed_by_id IS NULL
      AND preservation_hold_released_at IS NULL AND preservation_hold_released_by_id IS NULL)
    OR (preservation_hold_kind IS NOT NULL AND preservation_hold_placed_at IS NOT NULL
      AND preservation_hold_placed_by_id IS NOT NULL
      AND ((current_preservation_hold_token IS NOT NULL AND preservation_hold_released_at IS NULL
        AND preservation_hold_released_by_id IS NULL)
      OR (current_preservation_hold_token IS NULL AND preservation_hold_released_at IS NOT NULL
        AND preservation_hold_released_by_id IS NOT NULL
        AND last_preservation_hold_released_at >= preservation_hold_released_at))))
);
COMMENT ON TABLE copyright_notice_email_intake_receipts IS 'Minimal SES replay identity retained after an unlinked private intake and its evidence are erased; this row never authorizes access to an intake.';
COMMENT ON COLUMN copyright_notice_email_intake_receipts.amazon_ses_message_id IS 'Stable opaque SES delivery identifier reserved against re-admission after erasure.';
COMMENT ON COLUMN copyright_notice_email_intake_receipts.raw_sha256 IS 'Digest of the original MIME used to reject a reused SES delivery identifier.';
COMMENT ON COLUMN copyright_notice_email_intake_receipts.raw_storage_key_sha256 IS 'Digest of the original object key used to reject changed replay evidence without keeping the key.';
COMMENT ON COLUMN copyright_notice_email_intake_receipts.raw_byte_size IS 'Original MIME size used to reject changed replay evidence.';
COMMENT ON COLUMN copyright_notice_email_intake_receipts.erased_at IS 'Time the private intake began operational erasure; the replay identity survives.';
COMMENT ON COLUMN copyright_notice_email_intake_receipts.review_rationale_ciphertext IS 'Final initial-review explanation encrypted under the global stored-secret key; erased after the finite standalone legal-record window.';
COMMENT ON COLUMN copyright_notice_email_intake_receipts.review_decision IS 'Final initial staff review result until the standalone legal-record window expires.';
COMMENT ON COLUMN copyright_notice_email_intake_receipts.reviewed_at IS 'Time of the final initial staff review.';
COMMENT ON COLUMN copyright_notice_email_intake_receipts.reviewed_by_id IS 'Retained identity of the staff member who made the final initial review.';
COMMENT ON COLUMN copyright_notice_email_intake_receipts.review_retirement_check_after IS 'Next bounded eligibility probe for a completed standalone review; a blocked receipt yields to later candidates.';
COMMENT ON COLUMN copyright_notice_email_intake_receipts.current_preservation_hold_token IS 'Current standalone receipt preservation authority, cleared only by its matching release.';
COMMENT ON COLUMN copyright_notice_email_intake_receipts.preservation_hold_kind IS 'Legal basis of the latest standalone receipt preservation hold.';
COMMENT ON COLUMN copyright_notice_email_intake_receipts.preservation_hold_placed_at IS 'Time the latest standalone receipt preservation hold was placed.';
COMMENT ON COLUMN copyright_notice_email_intake_receipts.preservation_hold_placed_by_id IS 'Retained staff identity that placed the latest receipt hold.';
COMMENT ON COLUMN copyright_notice_email_intake_receipts.preservation_hold_released_at IS 'Time the latest receipt hold was released.';
COMMENT ON COLUMN copyright_notice_email_intake_receipts.preservation_hold_released_by_id IS 'Retained staff identity that released the latest receipt hold.';
COMMENT ON COLUMN copyright_notice_email_intake_receipts.last_preservation_hold_released_at IS 'Latest receipt hold release, which restarts the six-year legal-record clock.';
CREATE INDEX idx_cpyrght_ntc_eml_intk_rcpts__preservation_placed_by ON copyright_notice_email_intake_receipts(preservation_hold_placed_by_id) WHERE preservation_hold_placed_by_id IS NOT NULL;
CREATE INDEX idx_cpyrght_ntc_eml_intk_rcpts__preservation_released_by ON copyright_notice_email_intake_receipts(preservation_hold_released_by_id) WHERE preservation_hold_released_by_id IS NOT NULL;
CREATE INDEX idx_copyright_email_receipts__review_retirement ON copyright_notice_email_intake_receipts(review_retirement_check_after, reviewed_at, id)
  WHERE review_decision IS NOT NULL;

CREATE FUNCTION fn_copyright_receipt_review_retirement_eligible(receipt_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM copyright_notice_email_intake_receipts receipt
    WHERE receipt.id = receipt_id AND receipt.review_decision IS NOT NULL
      AND receipt.reviewed_at IS NOT NULL
      AND receipt.erased_at IS NOT NULL AND receipt.current_preservation_hold_token IS NULL
      AND GREATEST(receipt.created_at, receipt.reviewed_at, receipt.last_preservation_hold_released_at,
        (SELECT max(GREATEST(delivery.created_at, delivery.sent_at, delivery.bounced_at))
         FROM copyright_notice_delivery_work_items delivery
         WHERE delivery.copyright_notice_email_intake_receipt_id = receipt.id))
        <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC' - make_interval(years => 6)) AT TIME ZONE 'UTC'
      AND NOT EXISTS (SELECT 1 FROM copyright_notice_email_intakes intake WHERE intake.id = receipt.id)
      AND NOT EXISTS (SELECT 1 FROM copyright_notice_email_intake_notice_links link
        WHERE link.copyright_notice_email_intake_receipt_id = receipt.id)
      AND NOT EXISTS (SELECT 1 FROM copyright_notice_email_intake_reviews review
        WHERE review.copyright_notice_email_intake_receipt_id = receipt.id
          AND review.promoted_copyright_notice_id IS NOT NULL)
      AND NOT EXISTS (SELECT 1 FROM copyright_notice_correspondence_messages correspondence
        WHERE correspondence.copyright_notice_email_intake_id = receipt.id)
      AND NOT EXISTS (SELECT 1 FROM copyright_notice_delivery_work_items delivery
        WHERE delivery.copyright_notice_email_intake_receipt_id = receipt.id
          AND delivery.state IN ('pending', 'claimed')));
END;
$$;
COMMENT ON FUNCTION fn_copyright_receipt_review_retirement_eligible IS 'Six-calendar-year standalone review eligibility after private intake deletion, with live links, delivery and preservation checked.';

CREATE FUNCTION fn_copyright_receipt_review_retirement_allowed(
  old_row copyright_notice_email_intake_receipts,
  new_row copyright_notice_email_intake_receipts
) RETURNS boolean LANGUAGE plpgsql STABLE AS $$
BEGIN
  IF current_setting('app.copyright_receipt_review_retirement', true) IS DISTINCT FROM 'on'
    OR old_row.review_decision IS NULL OR old_row.reviewed_at IS NULL
    OR NOT fn_copyright_receipt_review_retirement_eligible(old_row.id)
    THEN RETURN false; END IF;
  RETURN new_row.review_decision IS NULL AND new_row.reviewed_at IS NULL
    AND new_row.reviewed_by_id IS NULL AND new_row.review_rationale_ciphertext IS NULL
    AND new_row.review_retirement_check_after = '-infinity'::timestamptz
    AND new_row.current_preservation_hold_token IS NULL
    AND new_row.preservation_hold_kind IS NULL AND new_row.preservation_hold_placed_at IS NULL
    AND new_row.preservation_hold_placed_by_id IS NULL
    AND new_row.preservation_hold_released_at IS NULL
    AND new_row.preservation_hold_released_by_id IS NULL
    AND new_row.last_preservation_hold_released_at IS NULL
    AND (to_jsonb(old_row) - ARRAY['review_decision', 'reviewed_at', 'reviewed_by_id',
      'review_rationale_ciphertext', 'review_retirement_check_after', 'preservation_hold_kind',
      'preservation_hold_placed_at', 'preservation_hold_placed_by_id',
      'preservation_hold_released_at', 'preservation_hold_released_by_id',
      'last_preservation_hold_released_at']) =
      (to_jsonb(new_row) - ARRAY['review_decision', 'reviewed_at', 'reviewed_by_id',
      'review_rationale_ciphertext', 'review_retirement_check_after', 'preservation_hold_kind',
      'preservation_hold_placed_at', 'preservation_hold_placed_by_id',
      'preservation_hold_released_at', 'preservation_hold_released_by_id',
      'last_preservation_hold_released_at']);
END;
$$;
COMMENT ON FUNCTION fn_copyright_receipt_review_retirement_allowed IS 'Narrow six-year retirement gate for unlinked final receipt review facts after private evidence erasure and preservation checks.';

CREATE FUNCTION fn_reject_copyright_email_receipt_current_review()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'copyright email replay receipt is retained' USING ERRCODE = 'check_violation';
  END IF;
  IF fn_copyright_retention_erasure_permitted(TG_TABLE_NAME, to_jsonb(OLD), to_jsonb(NEW)) THEN
    RETURN NEW;
  END IF;
  IF fn_copyright_receipt_review_retirement_allowed(OLD, NEW) THEN RETURN NEW; END IF;
  IF current_setting('app.copyright_receipt_review_retirement', true) = 'on'
    AND OLD.review_decision IS NOT NULL
    AND NEW.review_retirement_check_after > OLD.review_retirement_check_after
    AND (to_jsonb(OLD) - 'review_retirement_check_after') =
        (to_jsonb(NEW) - 'review_retirement_check_after') THEN RETURN NEW; END IF;
  IF (to_jsonb(OLD) - ARRAY['current_preservation_hold_token', 'preservation_hold_kind',
      'preservation_hold_placed_at', 'preservation_hold_placed_by_id', 'preservation_hold_released_at',
      'preservation_hold_released_by_id', 'last_preservation_hold_released_at']) =
     (to_jsonb(NEW) - ARRAY['current_preservation_hold_token', 'preservation_hold_kind',
      'preservation_hold_placed_at', 'preservation_hold_placed_by_id', 'preservation_hold_released_at',
      'preservation_hold_released_by_id', 'last_preservation_hold_released_at']) THEN
    IF OLD.current_preservation_hold_token IS NULL AND NEW.current_preservation_hold_token IS NOT NULL
      AND OLD.review_decision IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM copyright_notice_email_intake_notice_links link
        WHERE link.copyright_notice_email_intake_receipt_id = OLD.id)
      AND NOT EXISTS (SELECT 1 FROM copyright_notice_email_intake_reviews review
        WHERE review.copyright_notice_email_intake_receipt_id = OLD.id
          AND review.promoted_copyright_notice_id IS NOT NULL)
      AND NOT EXISTS (SELECT 1 FROM copyright_notice_correspondence_messages correspondence
        WHERE correspondence.copyright_notice_email_intake_id = OLD.id)
      AND NEW.last_preservation_hold_released_at IS NOT DISTINCT FROM OLD.last_preservation_hold_released_at
      AND NEW.preservation_hold_released_at IS NULL AND NEW.preservation_hold_released_by_id IS NULL THEN RETURN NEW; END IF;
    IF OLD.current_preservation_hold_token IS NOT NULL AND NEW.current_preservation_hold_token IS NULL
      AND ROW(NEW.preservation_hold_kind, NEW.preservation_hold_placed_at, NEW.preservation_hold_placed_by_id)
        IS NOT DISTINCT FROM ROW(OLD.preservation_hold_kind, OLD.preservation_hold_placed_at, OLD.preservation_hold_placed_by_id)
      AND NEW.preservation_hold_released_at IS NOT NULL AND NEW.preservation_hold_released_by_id IS NOT NULL
      AND NEW.last_preservation_hold_released_at = GREATEST(OLD.last_preservation_hold_released_at, NEW.preservation_hold_released_at)
      THEN RETURN NEW; END IF;
  END IF;
  IF (to_jsonb(OLD) - ARRAY['review_decision', 'reviewed_at', 'reviewed_by_id', 'review_rationale_ciphertext', 'erased_at'])
      IS DISTINCT FROM
     (to_jsonb(NEW) - ARRAY['review_decision', 'reviewed_at', 'reviewed_by_id', 'review_rationale_ciphertext', 'erased_at'])
    OR (OLD.erased_at IS NOT NULL AND NEW.erased_at IS DISTINCT FROM OLD.erased_at)
    OR (OLD.review_decision IS NOT NULL AND ROW(NEW.review_decision, NEW.reviewed_at, NEW.reviewed_by_id, NEW.review_rationale_ciphertext)
      IS DISTINCT FROM ROW(OLD.review_decision, OLD.reviewed_at, OLD.reviewed_by_id, OLD.review_rationale_ciphertext))
    OR (OLD.review_decision IS NULL AND NEW.review_decision IS NOT NULL AND OLD.erased_at IS NOT NULL) THEN
    RAISE EXCEPTION 'copyright email receipt identity and completed review are immutable' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trigger_copyright_email_receipts_current_review
  BEFORE UPDATE OR DELETE ON copyright_notice_email_intake_receipts
  FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_email_receipt_current_review();

CREATE TABLE copyright_notice_email_intake_recommendation_identities (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_email_intake_receipt_id uuid NOT NULL REFERENCES copyright_notice_email_intake_receipts(id) ON DELETE RESTRICT,
  input_sha256 bytea NOT NULL CHECK (octet_length(input_sha256) = 32),
  prompt_version text NOT NULL CHECK (char_length(prompt_version) BETWEEN 1 AND 100),
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  CONSTRAINT uq_copyright_email_recommendation_identities__receipt_id UNIQUE (copyright_notice_email_intake_receipt_id, id),
  CONSTRAINT uq_copyright_email_recommendation_identities__dedup UNIQUE (copyright_notice_email_intake_receipt_id, input_sha256, prompt_version)
);
COMMENT ON TABLE copyright_notice_email_intake_recommendation_identities IS 'Minimal durable recommendation identity for exact replay and reviewed provenance; no advisory output or authorization.';
COMMENT ON COLUMN copyright_notice_email_intake_recommendation_identities.copyright_notice_email_intake_receipt_id IS 'Receipt whose agent input yielded this recommendation identity.';
COMMENT ON COLUMN copyright_notice_email_intake_recommendation_identities.input_sha256 IS 'Input digest used only for exact recommendation replay.';
COMMENT ON COLUMN copyright_notice_email_intake_recommendation_identities.prompt_version IS 'Prompt version used only for exact recommendation replay.';

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE copyright_notice_email_intakes (
  id uuid PRIMARY KEY REFERENCES copyright_notice_email_intake_receipts(id) ON DELETE RESTRICT,
  amazon_ses_message_id text NOT NULL UNIQUE CHECK (char_length(amazon_ses_message_id) BETWEEN 1 AND 512),
  received_at timestamptz NOT NULL,
  raw_storage_object_id uuid,
  raw_sha256 bytea NOT NULL CHECK (octet_length(raw_sha256) = 32),
  raw_media_type_id bigint NOT NULL REFERENCES media_types(id) ON DELETE RESTRICT,
  raw_byte_size integer NOT NULL CHECK (raw_byte_size >= 0),
  current_recommendation_identity_id uuid,
  current_recommendation_output_ciphertext text CHECK (char_length(current_recommendation_output_ciphertext) BETWEEN 1 AND 1048576),
  recommendation_completed_at timestamptz,
  spf_verdict email_security_verdicts NOT NULL CHECK (spf_verdict IN ('pass', 'fail', 'gray', 'processing_failed', 'unknown')),
  dkim_verdict email_security_verdicts NOT NULL CHECK (dkim_verdict IN ('pass', 'fail', 'gray', 'processing_failed', 'unknown')),
  dmarc_verdict email_security_verdicts NOT NULL CHECK (dmarc_verdict IN ('pass', 'fail', 'gray', 'processing_failed', 'unknown')),
  spam_verdict email_security_verdicts NOT NULL CHECK (spam_verdict IN ('pass', 'fail', 'gray', 'processing_failed', 'unknown')),
  virus_verdict email_security_verdicts NOT NULL CHECK (virus_verdict IN ('pass', 'fail', 'gray', 'processing_failed', 'unknown')),
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  CONSTRAINT fk_copyright_email_intakes__current_recommendation_identity
    FOREIGN KEY (id, current_recommendation_identity_id)
    REFERENCES copyright_notice_email_intake_recommendation_identities(copyright_notice_email_intake_receipt_id, id) ON DELETE RESTRICT,
  CONSTRAINT chk_copyright_email_intakes__current_recommendation CHECK (
    (current_recommendation_identity_id IS NULL AND current_recommendation_output_ciphertext IS NULL AND recommendation_completed_at IS NULL)
    OR (current_recommendation_identity_id IS NOT NULL AND recommendation_completed_at IS NOT NULL)));
ALTER TABLE copyright_notice_email_intakes
  ADD CONSTRAINT fk_copyright_notice_email_intakes__raw_storage_object
  FOREIGN KEY (raw_storage_object_id) REFERENCES copyright_notice_storage_objects(id)
  ON DELETE RESTRICT NOT VALID;
ALTER TABLE copyright_notice_email_intakes
  VALIDATE CONSTRAINT fk_copyright_notice_email_intakes__raw_storage_object;

ALTER TABLE copyright_notice_lifecycle_changes
  ADD CONSTRAINT copyright_lifecycle_event_email_intake_fk
  FOREIGN KEY (copyright_notice_email_intake_id)
  REFERENCES copyright_notice_email_intakes(id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE copyright_notice_lifecycle_changes
  VALIDATE CONSTRAINT copyright_lifecycle_event_email_intake_fk;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE copyright_notice_email_intake_parses (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_email_intake_id uuid NOT NULL CONSTRAINT uq_copyright_notice_email_intake_parses__intake_id UNIQUE CONSTRAINT fk_copyright_notice_email_intake_parses__intake REFERENCES copyright_notice_email_intakes(id) ON DELETE RESTRICT,
  status copyright_notice_email_intake_parse_statuses NOT NULL CHECK (status IN ('succeeded', 'failed')),
  sender_email_ciphertext text CONSTRAINT chk_copyrig_notice_email_intake_parses__sender_email_ciphertext CHECK (char_length(sender_email_ciphertext) BETWEEN 1 AND 1048576),
  sender_name_ciphertext text,
  subject_ciphertext text CHECK (char_length(subject_ciphertext) BETWEEN 1 AND 4194304),
  body_ciphertext text CHECK (char_length(body_ciphertext) BETWEEN 1 AND 4194304),
  message_id_ciphertext text CONSTRAINT chk_copyright_notice_email_intake_parses__message_id_ciphertext CHECK (char_length(message_id_ciphertext) BETWEEN 1 AND 1048576),
  reply_references_ciphertext text CONSTRAINT chk_copyr_notic_email_intak_parses__reply_references_ciphertext CHECK (char_length(reply_references_ciphertext) BETWEEN 1 AND 1048576),
  error_ciphertext text CHECK (char_length(error_ciphertext) BETWEEN 1 AND 1048576),
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,

  CHECK (
    (status = 'succeeded' AND sender_email_ciphertext IS NOT NULL AND subject_ciphertext IS NOT NULL AND body_ciphertext IS NOT NULL AND error_ciphertext IS NULL)
    OR
    (status = 'failed' AND sender_email_ciphertext IS NULL AND sender_name_ciphertext IS NULL AND subject_ciphertext IS NULL AND body_ciphertext IS NULL AND message_id_ciphertext IS NULL AND reply_references_ciphertext IS NULL AND error_ciphertext IS NOT NULL)
  )
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE copyright_notice_email_intake_attachments (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_email_intake_id uuid NOT NULL CONSTRAINT fk_copyright_notice_email_intake_attachments__intake REFERENCES copyright_notice_email_intakes(id) ON DELETE RESTRICT,
  ordinal integer NOT NULL CHECK (ordinal >= 0),
  filename_ciphertext text CONSTRAINT chk_copyrigh_notice_email_intake_attachmen__filename_ciphertext CHECK (char_length(filename_ciphertext) BETWEEN 1 AND 16384),
  content_id_ciphertext text CONSTRAINT chk_copyrig_notice_email_intake_attachme__content_id_ciphertext CHECK (char_length(content_id_ciphertext) BETWEEN 1 AND 16384),
  media_type_id bigint NOT NULL REFERENCES media_types(id) ON DELETE RESTRICT,
  byte_size integer NOT NULL CHECK (byte_size >= 0),
  sha256 bytea NOT NULL CHECK (octet_length(sha256) = 32),
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,

  CONSTRAINT uq_copyright_notice_email_intake_attachment__intake_id__ordinal UNIQUE (copyright_notice_email_intake_id, ordinal)
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE copyright_notice_email_intake_recommendations (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_email_intake_receipt_id uuid NOT NULL CONSTRAINT fk_copyright_email_recommendations__intake_receipt REFERENCES copyright_notice_email_intake_receipts(id) ON DELETE RESTRICT,
  input_sha256 bytea NOT NULL CONSTRAINT chk_copyright_notice_email_intake_recommendations__input_sha256 CHECK (octet_length(input_sha256) = 32),
  prompt_version text NOT NULL CONSTRAINT chk_copyright_notice_email_intake_recommendatio__prompt_version CHECK (char_length(prompt_version) BETWEEN 1 AND 100),
  model text NOT NULL CHECK (char_length(model) BETWEEN 1 AND 255),
  structured_output_ciphertext text NOT NULL CONSTRAINT chk_copyr_notic_email_intak_recom__structured_output_ciphertext CHECK (char_length(structured_output_ciphertext) BETWEEN 1 AND 1048576),
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,

  CONSTRAINT fk_copyright_email_recommendations__identity
    FOREIGN KEY (copyright_notice_email_intake_receipt_id, id)
    REFERENCES copyright_notice_email_intake_recommendation_identities(copyright_notice_email_intake_receipt_id, id) ON DELETE RESTRICT,
  CONSTRAINT uq_copyright_notice_email_intake_recommendations__intake_id__id UNIQUE (copyright_notice_email_intake_receipt_id, id)
) PARTITION BY RANGE (id);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE copyright_notice_email_intake_reviews (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_email_intake_receipt_id uuid NOT NULL CONSTRAINT fk_copyright_notice_email_intake_reviews__intake_receipt REFERENCES copyright_notice_email_intake_receipts(id) ON DELETE RESTRICT,
  copyright_notice_email_intake_recommendation_id uuid,
  reviewed_at timestamptz NOT NULL,
  reviewed_by_id uuid REFERENCES retained_user_identities(id) ON DELETE RESTRICT,
  decision copyright_notice_email_intake_review_decisions NOT NULL CHECK (decision IN ('approved', 'rejected', 'legal_process')),
  rationale_ciphertext text NOT NULL CONSTRAINT chk_copyright_notice_email_intake_reviews__rationale_ciphertext CHECK (char_length(rationale_ciphertext) BETWEEN 1 AND 1048576),
  promoted_copyright_notice_id uuid CONSTRAINT fk_copyri_notice_email_intake_review__promoted_copyright_notice REFERENCES copyright_notices(id) ON DELETE RESTRICT,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,

  CHECK ((decision = 'approved') = (promoted_copyright_notice_id IS NOT NULL)),
  CONSTRAINT fk_copyright_email_reviews__recommendation_intake
    FOREIGN KEY (copyright_notice_email_intake_receipt_id, copyright_notice_email_intake_recommendation_id)
    REFERENCES copyright_notice_email_intake_recommendation_identities(copyright_notice_email_intake_receipt_id, id) ON DELETE RESTRICT
) PARTITION BY RANGE (id);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_email_intake_attachments__intake ON copyright_notice_email_intake_attachments(copyright_notice_email_intake_id, id);
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_email_intake_recommendations__intake ON copyright_notice_email_intake_recommendations(copyright_notice_email_intake_receipt_id, id DESC);
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_email_intake_reviews__intake ON copyright_notice_email_intake_reviews(copyright_notice_email_intake_receipt_id, id DESC);
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_email_intake_reviews__promoted_notice
  ON copyright_notice_email_intake_reviews(promoted_copyright_notice_id, id)
  WHERE promoted_copyright_notice_id IS NOT NULL;
CREATE INDEX idx_copyright_notice_email_intake_reviews__reviewer ON copyright_notice_email_intake_reviews(reviewed_by_id, id DESC);
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_email_intake_reviews__recommendation ON copyright_notice_email_intake_reviews(copyright_notice_email_intake_recommendation_id) WHERE copyright_notice_email_intake_recommendation_id IS NOT NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE FUNCTION fn_reject_copyright_email_intake_current_recommendation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_setting('app.copyright_operational_retention', true) = 'on' THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'copyright email intake deletion requires operational retention' USING ERRCODE = 'check_violation';
  END IF;
  IF fn_copyright_retention_erasure_permitted(TG_TABLE_NAME, to_jsonb(OLD), to_jsonb(NEW)) THEN
    RETURN NEW;
  END IF;
  IF (to_jsonb(OLD) - ARRAY['current_recommendation_identity_id', 'current_recommendation_output_ciphertext', 'recommendation_completed_at'])
    IS DISTINCT FROM
    (to_jsonb(NEW) - ARRAY['current_recommendation_identity_id', 'current_recommendation_output_ciphertext', 'recommendation_completed_at'])
    OR NEW.current_recommendation_identity_id IS NULL
    OR NEW.current_recommendation_output_ciphertext IS NULL
    OR NEW.recommendation_completed_at IS NULL
    OR NEW.recommendation_completed_at < COALESCE(OLD.recommendation_completed_at, '-infinity'::timestamptz) THEN
    RAISE EXCEPTION 'copyright email intake current recommendation is the only mutable live result' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM 1 FROM copyright_notice_email_intake_receipts receipt
    WHERE receipt.id = NEW.id AND receipt.erased_at IS NULL FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'erased copyright email intake cannot accept a recommendation' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trigger_copyright_email_intakes_current_result BEFORE UPDATE OR DELETE
  ON copyright_notice_email_intakes FOR EACH ROW
  EXECUTE FUNCTION fn_reject_copyright_email_intake_current_recommendation();
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_copyright_email_intakes_require_storage_object BEFORE INSERT OR UPDATE ON copyright_notice_email_intakes FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_missing_storage_object('raw_storage_object_id');
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_copyright_email_parses_immutable BEFORE UPDATE OR DELETE ON copyright_notice_email_intake_parses FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_notice_immutable_evidence();
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_copyright_email_attachments_immutable BEFORE UPDATE OR DELETE ON copyright_notice_email_intake_attachments FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_notice_immutable_evidence();
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_copyright_email_recommendations_immutable BEFORE UPDATE OR DELETE ON copyright_notice_email_intake_recommendations FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_notice_immutable_evidence();
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_copyright_email_reviews_immutable BEFORE UPDATE OR DELETE ON copyright_notice_email_intake_reviews FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_immutable_with_actor_erasure('reviewed_by_id');
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_copyright_email_reviews_require_actor BEFORE INSERT ON copyright_notice_email_intake_reviews FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_human_actor('reviewed_by_id');

COMMENT ON TABLE copyright_notice_email_intakes IS 'Immutable, private records for email sent to the designated copyright inbox before a moderator validates it into a legal case.';
COMMENT ON COLUMN copyright_notice_email_intakes.raw_storage_object_id IS 'Registry identity of the immutable original RFC 5322 object; cleared only by retention erasure after the object is no longer shared.';
COMMENT ON TABLE copyright_notice_email_intake_attachments IS 'Private parsed attachment metadata; attachment bytes remain preserved inside the original MIME object until a moderator admits them as case evidence.';
COMMENT ON TABLE copyright_notice_email_intake_recommendations IS 'Immutable agent extraction and recommendation. It is advisory only and cannot impose a copyright restriction.';
COMMENT ON TABLE copyright_notice_email_intake_reviews IS 'Append-only staff decision on an email intake: approval into a case, rejection, or closure as legal process with no reply. This row is the audit record of the decision. A moderator must review before an email can create or affect a copyright case.';
COMMENT ON COLUMN copyright_notice_email_intakes.amazon_ses_message_id IS 'Stable SES delivery identifier used for replay-safe admission.';
COMMENT ON COLUMN copyright_notice_email_intakes.received_at IS 'Timestamp assigned by the inbound email delivery.';
COMMENT ON COLUMN copyright_notice_email_intakes.raw_sha256 IS 'SHA-256 digest of the preserved original RFC 5322 message.';
COMMENT ON COLUMN copyright_notice_email_intakes.raw_media_type_id IS 'Media type of the preserved original message.';
COMMENT ON COLUMN copyright_notice_email_intakes.raw_byte_size IS 'Byte size of the preserved original message.';
COMMENT ON COLUMN copyright_notice_email_intakes.spf_verdict IS 'SES SPF verdict from the amazonses.com Authentication-Results header SES added at receipt; unknown when SES reported none. Advisory risk signal only.';
COMMENT ON COLUMN copyright_notice_email_intakes.dkim_verdict IS 'SES DKIM verdict from the amazonses.com Authentication-Results header; pass means a DKIM signature validated, not that the signing domain aligns with the From domain. unknown when SES reported none. Advisory risk signal only.';
COMMENT ON COLUMN copyright_notice_email_intakes.dmarc_verdict IS 'SES DMARC verdict from the amazonses.com Authentication-Results header; unknown when SES reported none. Advisory risk signal only.';
COMMENT ON COLUMN copyright_notice_email_intakes.spam_verdict IS 'SES spam verdict from the X-SES-Spam-Verdict header SES added at receipt; unknown when SES reported none. Advisory risk signal only.';
COMMENT ON COLUMN copyright_notice_email_intakes.virus_verdict IS 'SES malware verdict from the X-SES-Virus-Verdict header SES added at receipt; unknown when SES reported none. Only pass permits staff to download the original message; every other verdict quarantines it.';
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
COMMENT ON COLUMN copyright_notice_email_intake_recommendations.copyright_notice_email_intake_receipt_id IS 'Retained intake receipt identity evaluated by this advisory recommendation; it does not authorize a deleted intake.';
COMMENT ON COLUMN copyright_notice_email_intakes.current_recommendation_identity_id IS 'Retained identity of the current advisory result while the private intake remains live.';
COMMENT ON COLUMN copyright_notice_email_intakes.current_recommendation_output_ciphertext IS 'Encrypted current advisory result; detailed agent history may expire independently.';
COMMENT ON COLUMN copyright_notice_email_intakes.recommendation_completed_at IS 'When the current advisory result completed; current dispatch state does not depend on history rows.';
COMMENT ON COLUMN copyright_notice_email_intake_recommendations.input_sha256 IS 'Digest of the exact sanitized extraction input.';
COMMENT ON COLUMN copyright_notice_email_intake_recommendations.prompt_version IS 'Versioned extraction and recommendation prompt.';
COMMENT ON COLUMN copyright_notice_email_intake_recommendations.model IS 'Model identifier recorded for recommendation provenance.';
COMMENT ON COLUMN copyright_notice_email_intake_recommendations.structured_output_ciphertext IS 'Encrypted bounded agent extraction and recommendation.';
COMMENT ON COLUMN copyright_notice_email_intake_reviews.copyright_notice_email_intake_receipt_id IS 'Retained intake receipt identity reviewed by a moderator; the review remains after private source erasure.';
COMMENT ON COLUMN copyright_notice_email_intake_reviews.copyright_notice_email_intake_recommendation_id IS 'Optional advisory recommendation reviewed as provenance.';
COMMENT ON COLUMN copyright_notice_email_intake_reviews.reviewed_at IS 'Moderator-supplied review completion timestamp.';
COMMENT ON COLUMN copyright_notice_email_intake_reviews.reviewed_by_id IS 'Staff member who decided the intake; erased on account deletion.';
COMMENT ON COLUMN copyright_notice_email_intake_reviews.decision IS 'Staff decision: approved opened a case, rejected declined the email as a copyright notice and may have queued a reply, legal_process closed it as legal process such as a subpoena with no reply, case, or claimant-visible event.';
COMMENT ON COLUMN copyright_notice_email_intake_reviews.rationale_ciphertext IS 'Encrypted staff rationale, or for legal_process the encrypted reason; it can name a legal matter and is never logged or returned.';
COMMENT ON COLUMN copyright_notice_email_intake_reviews.promoted_copyright_notice_id IS 'Legal case created by an approved review; null for every other decision.';

-- Current indexes for fresh schema bootstrap.
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_copyright_notice_email_intakes__received_id
  ON copyright_notice_email_intakes (received_at, id);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_email_intakes__raw_media_type_id ON copyright_notice_email_intakes (raw_media_type_id);
CREATE INDEX idx_copyright_notice_email_intakes__raw_storage_object_id
  ON copyright_notice_email_intakes (raw_storage_object_id)
  WHERE raw_storage_object_id IS NOT NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_email_intake_attachments__media_type_id ON copyright_notice_email_intake_attachments (media_type_id);

COMMENT ON COLUMN copyright_notice_email_intake_recommendation_identities.id IS 'Published UUIDv7 recommendation identity, not an authorization grant.';
COMMENT ON COLUMN copyright_notice_email_intake_recommendation_identities.created_at IS 'Identity creation time derived from its UUIDv7 id.';

CREATE INDEX idx_copyright_notice_email_intake_receipts__reviewed_by
  ON copyright_notice_email_intake_receipts (reviewed_by_id)
  WHERE reviewed_by_id IS NOT NULL;
