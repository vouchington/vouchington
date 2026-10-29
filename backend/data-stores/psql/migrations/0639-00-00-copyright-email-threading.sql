-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
-- Threading uses keyed digests in a private UUID identity table. Plain RFC headers remain
-- encrypted in the immutable MIME parse and are never used as a public lookup key.

ALTER TABLE copyright_notice_correspondence_messages
  ADD CONSTRAINT fk_copyright_correspondence__email_intake
  FOREIGN KEY (copyright_notice_email_intake_id)
  REFERENCES copyright_notice_email_intakes(id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE copyright_notice_correspondence_messages
  VALIDATE CONSTRAINT fk_copyright_correspondence__email_intake;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE copyright_notice_email_thread_tokens (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  lookup_digest text NOT NULL CONSTRAINT uq_copyright_notice_email_thread_tokens__lookup_digest UNIQUE
    CONSTRAINT chk_copyright_notice_email_thread_tokens__lookup_digest CHECK (lookup_digest ~ '^[0-9A-Fa-f]{64}$'),
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL
);

CREATE TABLE copyright_notice_email_thread_retirements (
  copyright_notice_id uuid PRIMARY KEY REFERENCES copyright_notices(id) ON DELETE RESTRICT,
  retired_before_intake_bound uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER trigger_copyright_email_thread_retirements_updated_at
  BEFORE UPDATE ON copyright_notice_email_thread_retirements
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
COMMENT ON TABLE copyright_notice_email_thread_retirements IS 'Durable case threading high-water: previously admitted intake IDs below the bound cannot rebuild expired references on replay; fresh sources may still thread when the case accepts them.';
COMMENT ON COLUMN copyright_notice_email_thread_retirements.copyright_notice_id IS 'Case whose email threading is retired.';
COMMENT ON COLUMN copyright_notice_email_thread_retirements.retired_before_intake_bound IS 'Exclusive UUIDv7 intake-age boundary committed atomically with the first cleanup page, then advanced for later closed windows; this synthetic bound is not a foreign-key reference.';
COMMENT ON COLUMN copyright_notice_email_thread_retirements.updated_at IS 'Last time the closed-case threading high-water advanced.';

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE copyright_notice_email_thread_references (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_email_intake_id uuid NOT NULL CONSTRAINT fk_copyright_notice_email_thread_references__intake REFERENCES copyright_notice_email_intakes(id) ON DELETE RESTRICT,
  token_id uuid CONSTRAINT fk_copyright_notice_email_thread_references__token REFERENCES copyright_notice_email_thread_tokens(id) ON DELETE RESTRICT,
  reference_kind copyright_notice_email_thread_reference_kinds NOT NULL CHECK (reference_kind IN ('message_id', 'in_reply_to', 'references')),
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,

  CONSTRAINT uq_cop_not_ema_thr_ref__intake_id__token_id__reference_kind UNIQUE (copyright_notice_email_intake_id, token_id, reference_kind)
);
CREATE INDEX idx_copyright_notice_email_thread_references__intake_id
  ON copyright_notice_email_thread_references (copyright_notice_email_intake_id, id);

-- A message's intake row is immutable. Each edge is recorded once, when one token resolves.
CREATE TABLE copyright_notice_email_message_ancestors (
  reply_message_intake_receipt_id uuid NOT NULL,
  ancestor_message_intake_receipt_id uuid NOT NULL,
  reference_kind copyright_notice_email_thread_reference_kinds NOT NULL CHECK (reference_kind IN ('in_reply_to', 'references')),
  PRIMARY KEY (reply_message_intake_receipt_id, ancestor_message_intake_receipt_id),
  CONSTRAINT chk_copyright_email_message_ancestors__distinct CHECK (reply_message_intake_receipt_id <> ancestor_message_intake_receipt_id)
);
ALTER TABLE copyright_notice_email_message_ancestors
  ADD CONSTRAINT fk_copyright_notice_email_message_ancestors__reply
  FOREIGN KEY (reply_message_intake_receipt_id) REFERENCES copyright_notice_email_intake_receipts(id)
  ON DELETE RESTRICT NOT VALID;
ALTER TABLE copyright_notice_email_message_ancestors
  VALIDATE CONSTRAINT fk_copyright_notice_email_message_ancestors__reply;
ALTER TABLE copyright_notice_email_message_ancestors
  ADD CONSTRAINT fk_copyright_notice_email_message_ancestors__ancestor
  FOREIGN KEY (ancestor_message_intake_receipt_id) REFERENCES copyright_notice_email_intake_receipts(id)
  ON DELETE RESTRICT NOT VALID;
ALTER TABLE copyright_notice_email_message_ancestors
  VALIDATE CONSTRAINT fk_copyright_notice_email_message_ancestors__ancestor;
CREATE INDEX idx_copyright_notice_email_message_ancestors__ancestor_reply
  ON copyright_notice_email_message_ancestors (ancestor_message_intake_receipt_id, reply_message_intake_receipt_id);
CREATE FUNCTION fn_ensure_copyright_email_ancestor_live_endpoints()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE intake_id uuid;
BEGIN
  -- Receipts retain existing ancestry after erasure. New edges still require live intakes,
  -- and these locks fence a concurrent private-intake deletion through commit.
  FOR intake_id IN
    SELECT unnest(ARRAY[NEW.reply_message_intake_receipt_id, NEW.ancestor_message_intake_receipt_id])
    ORDER BY 1
  LOOP
    PERFORM 1 FROM copyright_notice_email_intakes
      WHERE id = intake_id AND raw_storage_object_id IS NOT NULL FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'copyright email ancestor source is no longer live'
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    PERFORM 1 FROM copyright_notice_email_intake_receipts
      WHERE id = intake_id AND erased_at IS NULL FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'copyright email ancestor source is under retention erasure'
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trigger_copyright_email_ancestor_requires_live_endpoints
  BEFORE INSERT ON copyright_notice_email_message_ancestors
  FOR EACH ROW EXECUTE FUNCTION fn_ensure_copyright_email_ancestor_live_endpoints();
CREATE TRIGGER trigger_copyright_email_message_ancestors_immutable
  BEFORE UPDATE OR DELETE ON copyright_notice_email_message_ancestors
  FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_notice_immutable_evidence();
COMMENT ON TABLE copyright_notice_email_message_ancestors IS 'Resolved ancestor edges between inbound email receipts. Retained endpoints preserve linked-case ancestry after an unlinked private intake is erased; receipts never authorize threading or access.';
COMMENT ON COLUMN copyright_notice_email_message_ancestors.reply_message_intake_receipt_id IS 'Inbound reply intake that named the ancestor.';
COMMENT ON COLUMN copyright_notice_email_message_ancestors.ancestor_message_intake_receipt_id IS 'Inbound ancestor intake resolved from one unambiguous keyed RFC Message-ID.';
COMMENT ON COLUMN copyright_notice_email_message_ancestors.reference_kind IS 'Whether In-Reply-To or References resolved this ancestor. An existing edge is never rewritten when the other header names the same intake.';

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE copyright_notice_email_intake_notice_links (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_email_intake_receipt_id uuid NOT NULL CONSTRAINT uq_copyright_notice_email_intake_notice_links__intake_id UNIQUE CONSTRAINT fk_copyright_notice_email_intake_notice_links__intake_receipt REFERENCES copyright_notice_email_intake_receipts(id) ON DELETE RESTRICT,
  copyright_notice_id uuid NOT NULL CONSTRAINT fk_copyright_notice_email_intake_notice_links__notice REFERENCES copyright_notices(id) ON DELETE CASCADE,
  link_kind copyright_notice_email_intake_link_kinds NOT NULL CHECK (link_kind IN ('initial', 'thread')),
  correspondence_action copyright_notice_email_correspondence_review_actions,
  correspondence_kind copyright_notice_email_correspondence_review_kinds,
  correspondence_submission_id uuid UNIQUE REFERENCES copyright_notice_submissions(id) ON DELETE RESTRICT,
  correspondence_message_id uuid UNIQUE REFERENCES copyright_notice_correspondence_messages(id) ON DELETE RESTRICT,
  correspondence_reviewed_at timestamptz,
  correspondence_reviewed_by_id uuid REFERENCES retained_user_identities(id) ON DELETE RESTRICT,
  correspondence_rationale_ciphertext text,
  correspondence_manual_fallback_reason_ciphertext text,
  matched_token_id uuid CONSTRAINT fk_copyright_notice_email_intake_notice_links__matched_token REFERENCES copyright_notice_email_thread_tokens(id) ON DELETE RESTRICT,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,

  CONSTRAINT uq_copyr_notice_email_intake_notice_links__notice_id__intake_id UNIQUE (copyright_notice_id, copyright_notice_email_intake_receipt_id),
  CONSTRAINT chk_copyright_email_links__correspondence_result CHECK (
    (link_kind = 'initial' AND correspondence_action IS NULL AND correspondence_kind IS NULL
      AND correspondence_submission_id IS NULL AND correspondence_message_id IS NULL
      AND correspondence_reviewed_at IS NULL AND correspondence_reviewed_by_id IS NULL
      AND correspondence_rationale_ciphertext IS NULL AND correspondence_manual_fallback_reason_ciphertext IS NULL)
    OR (link_kind = 'thread' AND (
      (correspondence_action = 'pending' AND correspondence_kind IS NULL
        AND correspondence_submission_id IS NULL AND correspondence_message_id IS NULL
        AND correspondence_reviewed_at IS NULL AND correspondence_reviewed_by_id IS NULL
        AND correspondence_rationale_ciphertext IS NULL AND correspondence_manual_fallback_reason_ciphertext IS NULL)
      OR (correspondence_action = 'admitted' AND correspondence_kind IS NOT NULL
        AND correspondence_submission_id IS NOT NULL AND correspondence_message_id IS NOT NULL
        AND correspondence_reviewed_at IS NOT NULL AND correspondence_reviewed_by_id IS NOT NULL)
      OR (correspondence_action = 'rejected' AND correspondence_kind IS NOT NULL
        AND correspondence_submission_id IS NULL AND correspondence_message_id IS NULL
        AND correspondence_reviewed_at IS NOT NULL AND correspondence_reviewed_by_id IS NOT NULL))))
);

ALTER TABLE copyright_notice_lifecycle_changes
  ADD CONSTRAINT fk_copyright_lifecycle_events__email_intake_notice
  FOREIGN KEY (copyright_notice_id, copyright_notice_email_intake_id)
  REFERENCES copyright_notice_email_intake_notice_links(copyright_notice_id, copyright_notice_email_intake_receipt_id)
  ON DELETE CASCADE NOT VALID;
ALTER TABLE copyright_notice_lifecycle_changes
  VALIDATE CONSTRAINT fk_copyright_lifecycle_events__email_intake_notice;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE copyright_notice_email_correspondence_reviews (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_email_intake_id uuid NOT NULL CONSTRAINT fk_copyright_notice_email_correspondence_reviews__intake REFERENCES copyright_notice_email_intakes(id) ON DELETE RESTRICT,
  copyright_notice_id uuid NOT NULL CONSTRAINT fk_copyright_notice_email_correspondence_reviews__notice REFERENCES copyright_notices(id) ON DELETE CASCADE,
  copyright_notice_email_intake_recommendation_id uuid,
  action copyright_notice_email_correspondence_review_actions NOT NULL CHECK (action IN ('admitted', 'rejected')),
  kind copyright_notice_email_correspondence_review_kinds CHECK (kind IN ('supplement', 'appeal', 'counter_notice', 'withdrawal', 'court_or_ccb_hold', 'complaint')),
  copyright_notice_submission_id uuid CONSTRAINT fk_copyright_notice_email_correspondence_reviews__submission REFERENCES copyright_notice_submissions(id) ON DELETE RESTRICT,
  copyright_notice_correspondence_message_id uuid CONSTRAINT fk_copyright_notice_email_correspondenc_reviews__correspondence REFERENCES copyright_notice_correspondence_messages(id) ON DELETE RESTRICT,
  reviewed_at timestamptz NOT NULL,
  reviewed_by_id uuid NOT NULL CONSTRAINT fk_copyright_notice_email_correspondence_reviews__reviewed_by REFERENCES retained_user_identities(id) ON DELETE RESTRICT,
  rationale_ciphertext text,
  manual_fallback_reason_ciphertext text,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,

  CHECK (kind IS NOT NULL),
  CHECK ((action = 'admitted') = (copyright_notice_submission_id IS NOT NULL AND copyright_notice_correspondence_message_id IS NOT NULL)),
  CONSTRAINT chk_copyrig_notice_email_correspo_reviews__rationale_ciphertext CHECK (rationale_ciphertext IS NULL OR char_length(rationale_ciphertext) BETWEEN 1 AND 65536),
  CONSTRAINT chk_copy_noti_emai_corr_revi__manual_fallback_reason_ciphertext CHECK (manual_fallback_reason_ciphertext IS NULL OR char_length(manual_fallback_reason_ciphertext) BETWEEN 1 AND 65536),
  CHECK ((copyright_notice_email_intake_recommendation_id IS NULL) = (manual_fallback_reason_ciphertext IS NOT NULL)),
  CONSTRAINT fk_copyright_email_corresp_reviews__recommendation_intake
    FOREIGN KEY (copyright_notice_email_intake_id, copyright_notice_email_intake_recommendation_id)
    REFERENCES copyright_notice_email_intake_recommendation_identities(copyright_notice_email_intake_receipt_id, id) ON DELETE RESTRICT
) PARTITION BY RANGE (id);

-- Each intake has at most one case link and one review. Retain only their latest factual
-- activity instant so the legal clock never scans an unbounded case thread.
CREATE FUNCTION fn_register_copyright_email_case_activity()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  target_notice_id uuid;
  activity_at timestamptz;
BEGIN
  IF TG_TABLE_NAME = 'copyright_notice_email_intake_notice_links' THEN
    target_notice_id := NEW.copyright_notice_id;
    SELECT GREATEST(uuid_extract_timestamp(NEW.id), receipt.created_at, intake.received_at,
        receipt.reviewed_at, receipt.last_delivery_activity_at)
      INTO activity_at
    FROM copyright_notice_email_intake_receipts receipt
    LEFT JOIN copyright_notice_email_intakes intake ON intake.id = receipt.id
    WHERE receipt.id = NEW.copyright_notice_email_intake_receipt_id;
  ELSE
    SELECT link.copyright_notice_id INTO target_notice_id
    FROM copyright_notice_email_intake_notice_links link
    WHERE link.copyright_notice_email_intake_receipt_id = NEW.id;
    activity_at := GREATEST(NEW.reviewed_at, NEW.last_delivery_activity_at);
  END IF;
  IF target_notice_id IS NOT NULL AND activity_at IS NOT NULL THEN
    UPDATE copyright_notice_retained_identities
      SET email_activity_at = GREATEST(email_activity_at, activity_at),
        proof_generation = proof_generation + 1
      WHERE id = target_notice_id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trigger_register_copyright_email_link_activity
AFTER INSERT ON copyright_notice_email_intake_notice_links FOR EACH ROW
EXECUTE FUNCTION fn_register_copyright_email_case_activity();
CREATE TRIGGER trigger_register_copyright_email_review_activity
AFTER UPDATE OF reviewed_at, last_delivery_activity_at ON copyright_notice_email_intake_receipts FOR EACH ROW
EXECUTE FUNCTION fn_register_copyright_email_case_activity();

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_email_thread_references__token
  ON copyright_notice_email_thread_references(token_id, id)
  WHERE token_id IS NOT NULL;
CREATE INDEX idx_copyright_notice_email_intake_notice_links__matched_token
  ON copyright_notice_email_intake_notice_links(matched_token_id)
  WHERE matched_token_id IS NOT NULL;
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_correspondence_messages__email_intake
  ON copyright_notice_correspondence_messages(copyright_notice_email_intake_id)
  WHERE copyright_notice_email_intake_id IS NOT NULL;
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_email_intake_notice_links__notice
  ON copyright_notice_email_intake_notice_links(copyright_notice_id, id);
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_email_correspondence_reviews__notice
  ON copyright_notice_email_correspondence_reviews(copyright_notice_id, id);
CREATE INDEX idx_copyright_notice_email_correspondence_reviews__clock
  ON copyright_notice_email_correspondence_reviews(copyright_notice_id, reviewed_at DESC)
  WHERE reviewed_at IS NOT NULL;
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_email_correspondence_reviews__reviewer
  ON copyright_notice_email_correspondence_reviews(reviewed_by_id)
  WHERE reviewed_by_id IS NOT NULL;
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_email_corresponden_reviews__recommendation
  ON copyright_notice_email_correspondence_reviews(copyright_notice_email_intake_recommendation_id)
  WHERE copyright_notice_email_intake_recommendation_id IS NOT NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_copyright_email_thread_references_immutable
  BEFORE UPDATE OR DELETE ON copyright_notice_email_thread_references
  FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_notice_immutable_evidence();
CREATE FUNCTION fn_reject_copyright_email_thread_reference_without_token()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.token_id IS NULL AND
    (TG_OP = 'INSERT' OR current_setting('app.copyright_retention_erasure', true) IS DISTINCT FROM 'on') THEN
    RAISE EXCEPTION 'Copyright email thread reference token may be cleared only by retention erasure';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trigger_copyright_email_thread_references_require_token
  BEFORE INSERT OR UPDATE ON copyright_notice_email_thread_references
  FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_email_thread_reference_without_token();
CREATE TRIGGER trigger_copyright_email_thread_tokens_immutable
  BEFORE UPDATE OR DELETE ON copyright_notice_email_thread_tokens
  FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_notice_immutable_evidence();
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE FUNCTION fn_reject_copyright_email_link_current_decision()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND fn_project_copyright_minimal_purge_child_allowed(TG_TABLE_NAME, to_jsonb(OLD)) THEN RETURN OLD; END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'case email links remain legal scope records' USING ERRCODE = 'check_violation';
  END IF;
  IF fn_copyright_retention_erasure_permitted(TG_TABLE_NAME, to_jsonb(OLD), to_jsonb(NEW)) THEN
    RETURN NEW;
  END IF;
  IF current_setting('app.copyright_operational_retention', true) = 'on'
    AND OLD.matched_token_id IS NOT NULL AND NEW.matched_token_id IS NULL
    AND (to_jsonb(OLD) - 'matched_token_id') = (to_jsonb(NEW) - 'matched_token_id') THEN
    RETURN NEW;
  END IF;
  IF OLD.link_kind = 'thread' AND OLD.correspondence_action = 'pending'
    AND NEW.correspondence_action IN ('admitted', 'rejected')
    AND (to_jsonb(OLD) - ARRAY['correspondence_action', 'correspondence_kind',
      'correspondence_submission_id', 'correspondence_message_id', 'correspondence_reviewed_at',
      'correspondence_reviewed_by_id', 'correspondence_rationale_ciphertext',
      'correspondence_manual_fallback_reason_ciphertext'])
      = (to_jsonb(NEW) - ARRAY['correspondence_action', 'correspondence_kind',
      'correspondence_submission_id', 'correspondence_message_id', 'correspondence_reviewed_at',
      'correspondence_reviewed_by_id', 'correspondence_rationale_ciphertext',
      'correspondence_manual_fallback_reason_ciphertext']) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'case email link identity and terminal decision are immutable'
    USING ERRCODE = 'check_violation';
END;
$$;
CREATE TRIGGER trigger_copyright_email_thread_links_current_decision
  BEFORE UPDATE OR DELETE ON copyright_notice_email_intake_notice_links
  FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_email_link_current_decision();
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_copyright_email_correspondence_reviews_immutable
  BEFORE UPDATE OR DELETE ON copyright_notice_email_correspondence_reviews
  FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_immutable_with_actor_erasure('reviewed_by_id');
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_copyright_email_correspondence_reviews_require_actor
  BEFORE INSERT ON copyright_notice_email_correspondence_reviews
  FOR EACH ROW WHEN (NEW.action <> 'pending')
  EXECUTE FUNCTION fn_reject_copyright_human_actor('reviewed_by_id');

COMMENT ON TABLE copyright_notice_email_thread_tokens IS 'Private UUID identities for keyed RFC message-reference digests; exclusively owned tokens expire after the case reply window, while shared tokens survive.';
COMMENT ON COLUMN copyright_notice_email_thread_tokens.lookup_digest IS 'Keyed hex64 digest of a normalized RFC message reference; retention erasure overwrites it only when no live reference remains.';
COMMENT ON TABLE copyright_notice_email_thread_references IS 'Private UUID references to keyed RFC Message-ID and In-Reply-To/References tokens; exclusively owned references expire with their token after the case reply window.';
COMMENT ON COLUMN copyright_notice_email_thread_references.copyright_notice_email_intake_id IS 'Inbound email whose private thread token was recorded.';
COMMENT ON COLUMN copyright_notice_email_thread_references.token_id IS 'Private token identity; NULL only after the owning case is erased under the retention-erasure flag.';
COMMENT ON COLUMN copyright_notice_email_thread_references.reference_kind IS 'Whether the token is this message''s Message-ID, an In-Reply-To token, or a References token.';
COMMENT ON TABLE copyright_notice_email_intake_notice_links IS 'Private association between an inbound email and its case, owning the final correspondence review result independently of finite review history.';
COMMENT ON COLUMN copyright_notice_email_intake_notice_links.copyright_notice_email_intake_receipt_id IS 'Inbound email associated with the case.';
COMMENT ON COLUMN copyright_notice_email_intake_notice_links.copyright_notice_id IS 'Copyright case associated with the inbound email.';
COMMENT ON COLUMN copyright_notice_email_intake_notice_links.link_kind IS 'Whether the email opened the case or matched its thread.';
COMMENT ON COLUMN copyright_notice_email_intake_notice_links.correspondence_action IS 'Current pending, admitted, or rejected result for a matched email; null for an initial case email.';
COMMENT ON COLUMN copyright_notice_email_intake_notice_links.correspondence_kind IS 'Staff classification of a decided matched email.';
COMMENT ON COLUMN copyright_notice_email_intake_notice_links.correspondence_submission_id IS 'Submission created by admission of this matched email.';
COMMENT ON COLUMN copyright_notice_email_intake_notice_links.correspondence_message_id IS 'Inbound case correspondence created by admission.';
COMMENT ON COLUMN copyright_notice_email_intake_notice_links.correspondence_reviewed_at IS 'Time staff decided this matched email.';
COMMENT ON COLUMN copyright_notice_email_intake_notice_links.correspondence_reviewed_by_id IS 'Retained identity of staff who decided this matched email.';
COMMENT ON COLUMN copyright_notice_email_intake_notice_links.matched_token_id IS 'Private token identity that caused thread correlation; cleared when the case is erased.';
COMMENT ON TABLE copyright_notice_email_correspondence_reviews IS 'Append-only pending and moderator decisions for matched inbound copyright email; no decision is automatic.';
COMMENT ON COLUMN copyright_notice_email_correspondence_reviews.copyright_notice_email_intake_id IS 'Matched inbound email reviewed by staff.';
COMMENT ON COLUMN copyright_notice_email_correspondence_reviews.copyright_notice_id IS 'Copyright case to which the email was matched.';
COMMENT ON COLUMN copyright_notice_email_correspondence_reviews.copyright_notice_email_intake_recommendation_id IS 'Agent recommendation consulted by the moderator.';
COMMENT ON COLUMN copyright_notice_email_correspondence_reviews.action IS 'Pending, admitted, or rejected human-review outcome.';
COMMENT ON COLUMN copyright_notice_email_correspondence_reviews.kind IS 'Moderator-classified legal meaning of the email.';
COMMENT ON COLUMN copyright_notice_email_correspondence_reviews.copyright_notice_submission_id IS 'Immutable submission created when the email is admitted.';
COMMENT ON COLUMN copyright_notice_email_correspondence_reviews.copyright_notice_correspondence_message_id IS 'Private inbound correspondence created when admitted.';
COMMENT ON COLUMN copyright_notice_email_correspondence_reviews.reviewed_at IS 'Time a moderator made the terminal decision.';
COMMENT ON COLUMN copyright_notice_email_correspondence_reviews.reviewed_by_id IS 'Moderator who made the terminal decision.';
COMMENT ON COLUMN copyright_notice_email_correspondence_reviews.rationale_ciphertext IS 'Encrypted moderator rationale.';
COMMENT ON COLUMN copyright_notice_email_correspondence_reviews.manual_fallback_reason_ciphertext IS 'Encrypted reason staff proceeded without an agent recommendation.';
COMMENT ON COLUMN copyright_notice_correspondence_messages.copyright_notice_email_intake_id IS 'Immutable original email intake containing the raw MIME evidence for an inbound correspondence.';

-- Current-case thread activity is maintained at every write boundary, so a retention check
-- never needs to aggregate an unbounded case graph or historical reference set.
CREATE TABLE copyright_notice_thread_retention_activities (
  copyright_notice_id uuid PRIMARY KEY REFERENCES copyright_notices(id) ON DELETE CASCADE,
  last_activity_at timestamptz NOT NULL
);
COMMENT ON TABLE copyright_notice_thread_retention_activities IS 'Latest case-thread write clock used to bound the closed-window retention check; never grants access to retained source identities.';
COMMENT ON COLUMN copyright_notice_thread_retention_activities.copyright_notice_id IS 'Case whose latest thread-related activity is retained here.';
COMMENT ON COLUMN copyright_notice_thread_retention_activities.last_activity_at IS 'Latest write or retained capability expiry relevant to the case thread window.';

CREATE FUNCTION fn_copyright_touch_thread_retention_activity(case_id uuid, activity_at timestamptz)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM copyright_notices WHERE id = case_id FOR KEY SHARE;
  INSERT INTO copyright_notice_thread_retention_activities (copyright_notice_id, last_activity_at)
  VALUES (case_id, COALESCE(activity_at, CURRENT_TIMESTAMP))
  ON CONFLICT (copyright_notice_id) DO UPDATE
    SET last_activity_at = GREATEST(copyright_notice_thread_retention_activities.last_activity_at,
                                    EXCLUDED.last_activity_at);
END;
$$;

CREATE FUNCTION fn_update_copyright_thread_activity_on_link()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE clock_at timestamptz;
BEGIN
  SELECT GREATEST(
    uuid_extract_timestamp(NEW.id), intake.received_at,
    (SELECT reference.created_at FROM copyright_notice_email_thread_references reference
      WHERE reference.copyright_notice_email_intake_id = NEW.copyright_notice_email_intake_receipt_id
      ORDER BY reference.id DESC LIMIT 1),
    receipt.reviewed_at, receipt.last_delivery_activity_at,
    CURRENT_TIMESTAMP
  ) INTO clock_at
  FROM copyright_notice_email_intake_receipts receipt
  LEFT JOIN copyright_notice_email_intakes intake ON intake.id = receipt.id
  WHERE receipt.id = NEW.copyright_notice_email_intake_receipt_id;
  PERFORM fn_copyright_touch_thread_retention_activity(NEW.copyright_notice_id, clock_at);
  RETURN NEW;
END;
$$;
CREATE TRIGGER trigger_copyright_thread_activity_on_link
  AFTER INSERT ON copyright_notice_email_intake_notice_links
  FOR EACH ROW EXECUTE FUNCTION fn_update_copyright_thread_activity_on_link();

CREATE FUNCTION fn_update_copyright_thread_activity_on_reference()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE case_id uuid;
BEGIN
  SELECT link.copyright_notice_id INTO case_id
  FROM copyright_notice_email_intake_notice_links link
  WHERE link.copyright_notice_email_intake_receipt_id = NEW.copyright_notice_email_intake_id;
  IF case_id IS NOT NULL THEN
    PERFORM fn_copyright_touch_thread_retention_activity(case_id, uuid_extract_timestamp(NEW.id));
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trigger_copyright_thread_activity_on_reference
  AFTER INSERT ON copyright_notice_email_thread_references
  FOR EACH ROW EXECUTE FUNCTION fn_update_copyright_thread_activity_on_reference();

CREATE FUNCTION fn_update_copyright_thread_activity_on_edge()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE case_id uuid;
BEGIN
  FOR case_id IN
    SELECT DISTINCT link.copyright_notice_id
    FROM copyright_notice_email_intake_notice_links link
    WHERE link.copyright_notice_email_intake_receipt_id IN
      (NEW.reply_message_intake_receipt_id, NEW.ancestor_message_intake_receipt_id)
    ORDER BY link.copyright_notice_id
  LOOP
    PERFORM fn_copyright_touch_thread_retention_activity(case_id, CURRENT_TIMESTAMP);
  END LOOP;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trigger_copyright_thread_activity_on_edge
  AFTER INSERT ON copyright_notice_email_message_ancestors
  FOR EACH ROW EXECUTE FUNCTION fn_update_copyright_thread_activity_on_edge();

CREATE FUNCTION fn_update_copyright_thread_activity_on_intake_review()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE case_id uuid;
BEGIN
  SELECT link.copyright_notice_id INTO case_id
  FROM copyright_notice_email_intake_notice_links link
  WHERE link.copyright_notice_email_intake_receipt_id = NEW.copyright_notice_email_intake_receipt_id;
  IF case_id IS NOT NULL THEN
    PERFORM fn_copyright_touch_thread_retention_activity(case_id, NEW.reviewed_at);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trigger_copyright_thread_activity_on_intake_review
  AFTER INSERT ON copyright_notice_email_intake_reviews
  FOR EACH ROW EXECUTE FUNCTION fn_update_copyright_thread_activity_on_intake_review();

CREATE FUNCTION fn_update_copyright_thread_activity_on_correspondence_review()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM fn_copyright_touch_thread_retention_activity(
    NEW.copyright_notice_id, COALESCE(NEW.reviewed_at, uuid_extract_timestamp(NEW.id)));
  RETURN NEW;
END;
$$;
CREATE TRIGGER trigger_copyright_thread_activity_on_correspondence_review
  AFTER INSERT ON copyright_notice_email_correspondence_reviews
  FOR EACH ROW EXECUTE FUNCTION fn_update_copyright_thread_activity_on_correspondence_review();

COMMENT ON COLUMN copyright_notice_email_intake_notice_links.correspondence_rationale_ciphertext IS 'Encrypted current staff correspondence rationale, erasable after case retention.';
COMMENT ON COLUMN copyright_notice_email_intake_notice_links.correspondence_manual_fallback_reason_ciphertext IS 'Encrypted current reason staff proceeded without an agent recommendation, erasable after case retention.';

CREATE INDEX idx_copyright_notice_email_intake_notice_links__reviewed_by
  ON copyright_notice_email_intake_notice_links (correspondence_reviewed_by_id)
  WHERE correspondence_reviewed_by_id IS NOT NULL;

CREATE INDEX idx_copyright_notice_email_correspondence_reviews__intake
  ON copyright_notice_email_correspondence_reviews (copyright_notice_email_intake_id)
  WHERE copyright_notice_email_intake_id IS NOT NULL;

CREATE INDEX idx_copyright_notice_email_correspondence_reviews__submission
  ON copyright_notice_email_correspondence_reviews (copyright_notice_submission_id)
  WHERE copyright_notice_submission_id IS NOT NULL;

CREATE INDEX idx_copyright_notice_email_correspondence_reviews__message
  ON copyright_notice_email_correspondence_reviews (copyright_notice_correspondence_message_id)
  WHERE copyright_notice_correspondence_message_id IS NOT NULL;
