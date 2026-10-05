-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
-- Threading uses only keyed digests.  Plain RFC headers remain encrypted in the
-- immutable MIME parse and are never used as a public lookup key.

ALTER TABLE copyright_notice_correspondence_messages
  ADD CONSTRAINT fk_copyright_correspondence__email_intake
  FOREIGN KEY (copyright_notice_email_intake_id)
  REFERENCES copyright_notice_email_intakes(id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE copyright_notice_correspondence_messages
  VALIDATE CONSTRAINT fk_copyright_correspondence__email_intake;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE copyright_notice_email_thread_references (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_email_intake_id uuid NOT NULL CONSTRAINT fk_copyright_notice_email_thread_references__intake REFERENCES copyright_notice_email_intakes(id) ON DELETE RESTRICT,
  lookup_token text NOT NULL CHECK (char_length(lookup_token) = 64),
  reference_kind copyright_notice_email_thread_reference_kinds NOT NULL CHECK (reference_kind IN ('message_id', 'reply_reference')),
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_cop_not_ema_thr_ref__intake_id__lookup_token__reference_kind UNIQUE (copyright_notice_email_intake_id, lookup_token, reference_kind)
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE copyright_notice_email_intake_notice_links (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_email_intake_id uuid NOT NULL CONSTRAINT uq_copyright_notice_email_intake_notice_links__intake_id UNIQUE CONSTRAINT fk_copyright_notice_email_intake_notice_links__intake REFERENCES copyright_notice_email_intakes(id) ON DELETE RESTRICT,
  copyright_notice_id uuid NOT NULL CONSTRAINT fk_copyright_notice_email_intake_notice_links__notice REFERENCES copyright_notices(id) ON DELETE RESTRICT,
  copyright_notice_email_intake_recommendation_id uuid CONSTRAINT fk_copyright_notice_email_intake_notice_links__recommendation REFERENCES copyright_notice_email_intake_recommendations(id) ON DELETE RESTRICT,
  link_kind copyright_notice_email_intake_link_kinds NOT NULL CHECK (link_kind IN ('initial', 'thread')),
  matched_reference_lookup text CONSTRAINT chk_copy_noti_email_intak_notic_links__matched_reference_lookup CHECK (matched_reference_lookup IS NULL OR char_length(matched_reference_lookup) = 64),
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_copyr_notice_email_intake_notice_links__notice_id__intake_id UNIQUE (copyright_notice_id, copyright_notice_email_intake_id)
);

ALTER TABLE copyright_notice_lifecycle_changes
  ADD CONSTRAINT fk_copyright_lifecycle_events__email_intake_notice
  FOREIGN KEY (copyright_notice_id, copyright_notice_email_intake_id)
  REFERENCES copyright_notice_email_intake_notice_links(copyright_notice_id, copyright_notice_email_intake_id)
  ON DELETE RESTRICT NOT VALID;
ALTER TABLE copyright_notice_lifecycle_changes
  VALIDATE CONSTRAINT fk_copyright_lifecycle_events__email_intake_notice;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE copyright_notice_email_correspondence_reviews (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_email_intake_id uuid NOT NULL CONSTRAINT fk_copyright_notice_email_correspondence_reviews__intake REFERENCES copyright_notice_email_intakes(id) ON DELETE RESTRICT,
  copyright_notice_id uuid NOT NULL CONSTRAINT fk_copyright_notice_email_correspondence_reviews__notice REFERENCES copyright_notices(id) ON DELETE RESTRICT,
  copyright_notice_email_intake_recommendation_id uuid,
  action copyright_notice_email_correspondence_review_actions NOT NULL CHECK (action IN ('pending', 'admitted', 'rejected')),
  kind copyright_notice_email_correspondence_review_kinds CHECK (kind IN ('supplement', 'appeal', 'counter_notice', 'withdrawal', 'court_or_ccb_hold', 'complaint')),
  copyright_notice_submission_id uuid CONSTRAINT uq_copyright_notice_email_correspondence_reviews__submission_id UNIQUE CONSTRAINT fk_copyright_notice_email_correspondence_reviews__submission REFERENCES copyright_notice_submissions(id) ON DELETE RESTRICT,
  copyright_notice_correspondence_id uuid CONSTRAINT uq_copyright_notice_email_correspond_reviews__correspondence_id UNIQUE CONSTRAINT fk_copyright_notice_email_correspondenc_reviews__correspondence REFERENCES copyright_notice_correspondence_messages(id) ON DELETE RESTRICT,
  reviewed_at timestamptz,
  reviewed_by_id uuid CONSTRAINT fk_copyright_notice_email_correspondence_reviews__reviewed_by REFERENCES users(id) ON DELETE SET NULL,
  rationale_ciphertext text,
  manual_fallback_reason_ciphertext text,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_copyright_notice_email_correspond_reviews__intake_id__action UNIQUE (copyright_notice_email_intake_id, action),
  CHECK ((action = 'pending' AND reviewed_at IS NULL AND reviewed_by_id IS NULL AND kind IS NULL)
    OR (action IN ('admitted', 'rejected') AND reviewed_at IS NOT NULL AND reviewed_by_id IS NOT NULL AND kind IS NOT NULL)),
  CHECK ((action = 'admitted') = (copyright_notice_submission_id IS NOT NULL AND copyright_notice_correspondence_id IS NOT NULL)),
  CONSTRAINT chk_copyrig_notice_email_correspo_reviews__rationale_ciphertext CHECK (rationale_ciphertext IS NULL OR char_length(rationale_ciphertext) BETWEEN 1 AND 65536),
  CONSTRAINT chk_copy_noti_emai_corr_revi__manual_fallback_reason_ciphertext CHECK (manual_fallback_reason_ciphertext IS NULL OR char_length(manual_fallback_reason_ciphertext) BETWEEN 1 AND 65536),
  CHECK (action = 'pending' OR ((copyright_notice_email_intake_recommendation_id IS NULL) = (manual_fallback_reason_ciphertext IS NOT NULL))),
  CONSTRAINT fk_copyright_email_corresp_reviews__recommendation_intake
    FOREIGN KEY (copyright_notice_email_intake_id, copyright_notice_email_intake_recommendation_id)
    REFERENCES copyright_notice_email_intake_recommendations(copyright_notice_email_intake_id, id) ON DELETE RESTRICT
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_email_thread_references__lookup
  ON copyright_notice_email_thread_references(lookup_token, id);
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_correspondence_messages__email_intake
  ON copyright_notice_correspondence_messages(copyright_notice_email_intake_id)
  WHERE copyright_notice_email_intake_id IS NOT NULL;
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_email_intake_notice_links__notice
  ON copyright_notice_email_intake_notice_links(copyright_notice_id, id);
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_email_intake_notice_links__recommendation
  ON copyright_notice_email_intake_notice_links(copyright_notice_email_intake_recommendation_id)
  WHERE copyright_notice_email_intake_recommendation_id IS NOT NULL;
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_email_correspondence_reviews__notice
  ON copyright_notice_email_correspondence_reviews(copyright_notice_id, id);
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_email_correspondence_reviews__reviewer
  ON copyright_notice_email_correspondence_reviews(reviewed_by_id)
  WHERE reviewed_by_id IS NOT NULL;
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE UNIQUE INDEX idx_copyright_notice_email_correspondence_reviews__terminal
  ON copyright_notice_email_correspondence_reviews(copyright_notice_email_intake_id)
  WHERE action IN ('admitted', 'rejected');
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_email_corresponden_reviews__recommendation
  ON copyright_notice_email_correspondence_reviews(copyright_notice_email_intake_recommendation_id)
  WHERE copyright_notice_email_intake_recommendation_id IS NOT NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_copyright_email_thread_references_immutable
  BEFORE UPDATE OR DELETE ON copyright_notice_email_thread_references
  FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_notice_immutable_evidence();
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_copyright_email_thread_links_immutable
  BEFORE UPDATE OR DELETE ON copyright_notice_email_intake_notice_links
  FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_notice_immutable_evidence();
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_copyright_email_correspondence_reviews_immutable
  BEFORE UPDATE OR DELETE ON copyright_notice_email_correspondence_reviews
  FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_immutable_with_actor_erasure('reviewed_by_id');
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_copyright_email_correspondence_reviews_require_actor
  BEFORE INSERT ON copyright_notice_email_correspondence_reviews
  FOR EACH ROW WHEN (NEW.action <> 'pending')
  EXECUTE FUNCTION fn_reject_copyright_human_actor('reviewed_by_id');

COMMENT ON TABLE copyright_notice_email_thread_references IS 'Keyed RFC Message-ID and In-Reply-To/References values used only for private case correlation.';
COMMENT ON COLUMN copyright_notice_email_thread_references.copyright_notice_email_intake_id IS 'Inbound email whose private thread token was recorded.';
COMMENT ON COLUMN copyright_notice_email_thread_references.lookup_token IS 'Keyed digest of a normalized RFC message reference.';
COMMENT ON COLUMN copyright_notice_email_thread_references.reference_kind IS 'Whether the token names this message or a referenced parent.';
COMMENT ON TABLE copyright_notice_email_intake_notice_links IS 'Immutable private association between an email intake and its admitted or matched copyright case.';
COMMENT ON COLUMN copyright_notice_email_intake_notice_links.copyright_notice_email_intake_id IS 'Inbound email associated with the case.';
COMMENT ON COLUMN copyright_notice_email_intake_notice_links.copyright_notice_id IS 'Copyright case associated with the inbound email.';
COMMENT ON COLUMN copyright_notice_email_intake_notice_links.copyright_notice_email_intake_recommendation_id IS 'Agent recommendation retained as provenance for the link.';
COMMENT ON COLUMN copyright_notice_email_intake_notice_links.link_kind IS 'Whether the email opened the case or matched its thread.';
COMMENT ON COLUMN copyright_notice_email_intake_notice_links.matched_reference_lookup IS 'Keyed digest that caused thread correlation.';
COMMENT ON TABLE copyright_notice_email_correspondence_reviews IS 'Append-only pending and moderator decisions for matched inbound copyright email; no decision is automatic.';
COMMENT ON COLUMN copyright_notice_email_correspondence_reviews.copyright_notice_email_intake_id IS 'Matched inbound email reviewed by staff.';
COMMENT ON COLUMN copyright_notice_email_correspondence_reviews.copyright_notice_id IS 'Copyright case to which the email was matched.';
COMMENT ON COLUMN copyright_notice_email_correspondence_reviews.copyright_notice_email_intake_recommendation_id IS 'Agent recommendation consulted by the moderator.';
COMMENT ON COLUMN copyright_notice_email_correspondence_reviews.action IS 'Pending, admitted, or rejected human-review outcome.';
COMMENT ON COLUMN copyright_notice_email_correspondence_reviews.kind IS 'Moderator-classified legal meaning of the email.';
COMMENT ON COLUMN copyright_notice_email_correspondence_reviews.copyright_notice_submission_id IS 'Immutable submission created when the email is admitted.';
COMMENT ON COLUMN copyright_notice_email_correspondence_reviews.copyright_notice_correspondence_id IS 'Private inbound correspondence created when admitted.';
COMMENT ON COLUMN copyright_notice_email_correspondence_reviews.reviewed_at IS 'Time a moderator made the terminal decision.';
COMMENT ON COLUMN copyright_notice_email_correspondence_reviews.reviewed_by_id IS 'Moderator who made the terminal decision.';
COMMENT ON COLUMN copyright_notice_email_correspondence_reviews.rationale_ciphertext IS 'Encrypted moderator rationale.';
COMMENT ON COLUMN copyright_notice_email_correspondence_reviews.manual_fallback_reason_ciphertext IS 'Encrypted reason staff proceeded without an agent recommendation.';
COMMENT ON COLUMN copyright_notice_correspondence_messages.copyright_notice_email_intake_id IS 'Immutable original email intake containing the raw MIME evidence for an inbound correspondence.';
