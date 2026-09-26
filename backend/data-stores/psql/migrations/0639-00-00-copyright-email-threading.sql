-- Threading uses only keyed digests.  Plain RFC headers remain encrypted in the
-- immutable MIME parse and are never used as a public lookup key.

ALTER TABLE copyright_notice_correspondence_messages
  ADD CONSTRAINT fk_copyright_correspondence__email_intake
  FOREIGN KEY (copyright_notice_email_intake_id)
  REFERENCES copyright_notice_email_intakes(id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE copyright_notice_correspondence_messages
  VALIDATE CONSTRAINT fk_copyright_correspondence__email_intake;

CREATE TABLE copyright_notice_email_thread_references (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_email_intake_id uuid NOT NULL REFERENCES copyright_notice_email_intakes(id) ON DELETE RESTRICT,
  lookup_token text NOT NULL CHECK (char_length(lookup_token) = 64),
  reference_kind text NOT NULL CHECK (reference_kind IN ('message_id', 'reply_reference')),
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (copyright_notice_email_intake_id, lookup_token, reference_kind)
);

CREATE TABLE copyright_notice_email_intake_notice_links (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_email_intake_id uuid NOT NULL UNIQUE REFERENCES copyright_notice_email_intakes(id) ON DELETE RESTRICT,
  copyright_notice_id uuid NOT NULL REFERENCES copyright_notices(id) ON DELETE RESTRICT,
  copyright_notice_email_intake_recommendation_id uuid REFERENCES copyright_notice_email_intake_recommendations(id) ON DELETE RESTRICT,
  link_kind text NOT NULL CHECK (link_kind IN ('initial', 'thread')),
  matched_reference_lookup text CHECK (matched_reference_lookup IS NULL OR char_length(matched_reference_lookup) = 64),
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE copyright_notice_email_correspondence_reviews (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_email_intake_id uuid NOT NULL REFERENCES copyright_notice_email_intakes(id) ON DELETE RESTRICT,
  copyright_notice_id uuid NOT NULL REFERENCES copyright_notices(id) ON DELETE RESTRICT,
  copyright_notice_email_intake_recommendation_id uuid
    REFERENCES copyright_notice_email_intake_recommendations(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('pending', 'admitted', 'rejected')),
  kind text CHECK (kind IN ('supplement', 'appeal', 'counter_notice', 'withdrawal', 'court_or_ccb_hold')),
  copyright_notice_submission_id uuid UNIQUE REFERENCES copyright_notice_submissions(id) ON DELETE RESTRICT,
  copyright_notice_correspondence_id uuid UNIQUE REFERENCES copyright_notice_correspondence_messages(id) ON DELETE RESTRICT,
  reviewed_at timestamptz,
  reviewed_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  rationale_ciphertext text,
  manual_fallback_reason_ciphertext text,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (copyright_notice_email_intake_id, action),
  CHECK ((action = 'pending' AND reviewed_at IS NULL AND reviewed_by_id IS NULL AND kind IS NULL)
    OR (action IN ('admitted', 'rejected') AND reviewed_at IS NOT NULL AND reviewed_by_id IS NOT NULL AND kind IS NOT NULL)),
  CHECK ((action = 'admitted') = (copyright_notice_submission_id IS NOT NULL AND copyright_notice_correspondence_id IS NOT NULL)),
  CHECK (rationale_ciphertext IS NULL OR char_length(rationale_ciphertext) BETWEEN 1 AND 65536),
  CHECK (manual_fallback_reason_ciphertext IS NULL OR char_length(manual_fallback_reason_ciphertext) BETWEEN 1 AND 65536),
  CHECK (action = 'pending' OR ((copyright_notice_email_intake_recommendation_id IS NULL) = (manual_fallback_reason_ciphertext IS NOT NULL)))
);

CREATE INDEX idx_copyright_email_thread_references__lookup
  ON copyright_notice_email_thread_references(lookup_token, id);
CREATE INDEX idx_copyright_correspondence__email_intake
  ON copyright_notice_correspondence_messages(copyright_notice_email_intake_id)
  WHERE copyright_notice_email_intake_id IS NOT NULL;
CREATE INDEX idx_copyright_email_thread_links__notice
  ON copyright_notice_email_intake_notice_links(copyright_notice_id, id);
CREATE INDEX idx_copyright_email_thread_links__recommendation
  ON copyright_notice_email_intake_notice_links(copyright_notice_email_intake_recommendation_id)
  WHERE copyright_notice_email_intake_recommendation_id IS NOT NULL;
CREATE INDEX idx_copyright_email_correspondence_reviews__notice
  ON copyright_notice_email_correspondence_reviews(copyright_notice_id, id);
CREATE INDEX idx_copyright_email_correspondence_reviews__reviewer
  ON copyright_notice_email_correspondence_reviews(reviewed_by_id)
  WHERE reviewed_by_id IS NOT NULL;
CREATE UNIQUE INDEX idx_copyright_email_correspondence_reviews__terminal
  ON copyright_notice_email_correspondence_reviews(copyright_notice_email_intake_id)
  WHERE action IN ('admitted', 'rejected');
CREATE INDEX idx_copyright_email_correspondence_reviews__recommendation
  ON copyright_notice_email_correspondence_reviews(copyright_notice_email_intake_recommendation_id)
  WHERE copyright_notice_email_intake_recommendation_id IS NOT NULL;

CREATE OR REPLACE FUNCTION fn_guard_copyright_email_correspondence_recommendation_scope()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.copyright_notice_email_intake_recommendation_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM copyright_notice_email_intake_recommendations recommendation
    WHERE recommendation.id = NEW.copyright_notice_email_intake_recommendation_id
      AND recommendation.copyright_notice_email_intake_id = NEW.copyright_notice_email_intake_id
  ) THEN
    RAISE EXCEPTION 'copyright email correspondence recommendation must belong to the same intake' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trigger_copyright_email_correspondence_recommendation_scope
BEFORE INSERT ON copyright_notice_email_correspondence_reviews
FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_email_correspondence_recommendation_scope();

CREATE TRIGGER trigger_copyright_email_thread_references_immutable
  BEFORE UPDATE OR DELETE ON copyright_notice_email_thread_references
  FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_notice_immutable_evidence();
CREATE TRIGGER trigger_copyright_email_thread_links_immutable
  BEFORE UPDATE OR DELETE ON copyright_notice_email_intake_notice_links
  FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_notice_immutable_evidence();
CREATE TRIGGER trigger_copyright_email_correspondence_reviews_immutable
  BEFORE UPDATE OR DELETE ON copyright_notice_email_correspondence_reviews
  FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_immutable_with_actor_erasure('reviewed_by_id');
CREATE TRIGGER trigger_copyright_email_correspondence_reviews_require_actor
  BEFORE INSERT ON copyright_notice_email_correspondence_reviews
  FOR EACH ROW WHEN (NEW.action <> 'pending')
  EXECUTE FUNCTION fn_require_copyright_human_actor('reviewed_by_id');

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
