-- Copyright complaints are a distinct legal aggregate.  This migration records
-- evidence and decisions only; it deliberately enables no media restriction.

CREATE TABLE copyright_notices (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  jurisdiction text NOT NULL CHECK (jurisdiction IN ('us_dmca', 'eu_dsa', 'uk', 'other')),
  legal_basis text NOT NULL CHECK (legal_basis = 'copyright'),
  received_at timestamptz NOT NULL,
  accepted_at timestamptz,
  provisional_withholding_at timestamptz,
  claimant_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  claimant_display_name text,
  claimant_contact_ciphertext text NOT NULL,
  work_description text NOT NULL,
  policy_version text NOT NULL,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (accepted_at IS NULL OR accepted_at >= received_at),
  CHECK (provisional_withholding_at IS NULL OR (accepted_at IS NOT NULL AND provisional_withholding_at >= accepted_at))
);

CREATE TABLE copyright_notice_targets (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_id uuid NOT NULL REFERENCES copyright_notices(id) ON DELETE CASCADE,
  placement_id uuid NOT NULL REFERENCES retained_image_placement_bindings(placement_id) ON DELETE RESTRICT,
  placement_revision integer NOT NULL CHECK (placement_revision >= 0),
  hosted_use_url text NOT NULL,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (copyright_notice_id, placement_id, placement_revision),
  UNIQUE (id, placement_id)
);

CREATE TABLE copyright_notice_target_images (
  copyright_notice_target_id uuid PRIMARY KEY REFERENCES copyright_notice_targets(id) ON DELETE CASCADE,
  placement_id uuid NOT NULL,
  image_id uuid NOT NULL REFERENCES retained_image_identities(id) ON DELETE RESTRICT,
  binding_family text NOT NULL DEFAULT 'post' CHECK (binding_family = 'post'),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (copyright_notice_target_id, placement_id)
    REFERENCES copyright_notice_targets(id, placement_id) ON DELETE RESTRICT,
  FOREIGN KEY (placement_id, image_id, binding_family)
    REFERENCES retained_image_placement_bindings(placement_id, image_id, binding_family) ON DELETE RESTRICT
);

CREATE TABLE copyright_restrictions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  authorizing_assessment_id uuid NOT NULL,
  copyright_notice_target_id uuid NOT NULL REFERENCES copyright_notice_targets(id) ON DELETE CASCADE,
  imposed_at timestamptz NOT NULL,
  lifted_at timestamptz,
  imposed_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  lifted_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  human_reviewed_at timestamptz,
  human_review_action text CHECK (human_review_action IN ('confirm', 'modify', 'reverse')),
  human_reviewed_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  applicability text NOT NULL CHECK (applicability IN ('global', 'countries')),
  countries_sealed_at timestamptz,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (lifted_at IS NULL OR lifted_at >= imposed_at),
  CHECK (human_reviewed_at IS NULL OR human_reviewed_at >= imposed_at),
  CHECK (
    (human_reviewed_at IS NULL AND human_review_action IS NULL AND human_reviewed_by_id IS NULL)
    OR
    (human_reviewed_at IS NOT NULL AND human_review_action IS NOT NULL)
  )
);
CREATE UNIQUE INDEX idx_copyright_restrictions__one_active_per_target ON copyright_restrictions(copyright_notice_target_id) WHERE lifted_at IS NULL;

CREATE TABLE copyright_restriction_countries (
  copyright_restriction_id uuid NOT NULL REFERENCES copyright_restrictions(id) ON DELETE RESTRICT,
  country_code text NOT NULL,
  PRIMARY KEY (copyright_restriction_id, country_code)
);

ALTER TABLE copyright_restriction_countries
  ADD CONSTRAINT fk_copyright_restriction_countries__country
  FOREIGN KEY (country_code) REFERENCES countries(code) ON DELETE RESTRICT NOT VALID;
ALTER TABLE copyright_restriction_countries
  VALIDATE CONSTRAINT fk_copyright_restriction_countries__country;

CREATE INDEX idx_copyright_restriction_countries__country
  ON copyright_restriction_countries (country_code);

CREATE OR REPLACE FUNCTION fn_guard_copyright_restriction_country()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'copyright restriction countries are immutable' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM copyright_restrictions restriction
    WHERE restriction.id = NEW.copyright_restriction_id
      AND (restriction.applicability <> 'countries' OR restriction.countries_sealed_at IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'copyright restriction countries are immutable' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_copyright_restriction_country_guard
BEFORE INSERT OR UPDATE OR DELETE ON copyright_restriction_countries
FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_restriction_country();

CREATE OR REPLACE FUNCTION fn_seal_copyright_restriction_applicability()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  country_count integer;
BEGIN
  SELECT count(*) INTO country_count
  FROM copyright_restriction_countries
  WHERE copyright_restriction_id = NEW.id;
  IF NEW.applicability = 'global' AND country_count <> 0 THEN
    RAISE EXCEPTION 'global copyright applicability cannot name countries' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.applicability = 'countries' AND country_count < 1 THEN
    RAISE EXCEPTION 'country-set copyright applicability requires a country' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE copyright_restrictions
  SET countries_sealed_at = CURRENT_TIMESTAMP
  WHERE id = NEW.id AND countries_sealed_at IS NULL;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER trigger_seal_copyright_restriction_applicability
AFTER INSERT ON copyright_restrictions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION fn_seal_copyright_restriction_applicability();

COMMENT ON COLUMN copyright_restrictions.applicability IS 'Finite delivery scope of this ground: global, or the child country set.';
COMMENT ON COLUMN copyright_restrictions.countries_sealed_at IS 'When the applicability fact and its country rows became immutable.';
COMMENT ON TABLE copyright_restriction_countries IS 'Countries where a country-set copyright ground denies delivery. Global grounds have none.';
COMMENT ON COLUMN copyright_restriction_countries.country_code IS 'ISO 3166-1 alpha-2 country from the supported country lookup.';

CREATE TABLE copyright_notice_submissions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_id uuid NOT NULL REFERENCES copyright_notices(id) ON DELETE CASCADE,
  submitted_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('notice', 'supplement', 'appeal', 'counter_notice', 'withdrawal', 'court_or_ccb_hold')),
  received_at timestamptz NOT NULL,
  source_kind text NOT NULL CHECK (source_kind IN ('signed_in_form', 'guest_form', 'email', 'staff')),
  body_ciphertext text NOT NULL CHECK (char_length(body_ciphertext) BETWEEN 1 AND 1048576),
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE copyright_notice_evidence_artifacts (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_submission_id uuid NOT NULL REFERENCES copyright_notice_submissions(id) ON DELETE CASCADE,
  storage_key text NOT NULL,
  sha256 bytea NOT NULL CHECK (octet_length(sha256) = 32),
  mime_type text NOT NULL,
  byte_size integer NOT NULL CHECK (byte_size >= 0),
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (copyright_notice_submission_id, storage_key)
);

CREATE TABLE copyright_notice_submission_assessments (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_form_screening_id uuid,
  copyright_notice_submission_id uuid NOT NULL REFERENCES copyright_notice_submissions(id) ON DELETE CASCADE,
  supersedes_assessment_id uuid UNIQUE REFERENCES copyright_notice_submission_assessments(id) ON DELETE RESTRICT,
  assessed_at timestamptz NOT NULL,
  assessed_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  substantially_compliant boolean NOT NULL,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE copyright_notice_counter_notice_assessment_targets (
  copyright_notice_submission_assessment_id uuid NOT NULL REFERENCES copyright_notice_submission_assessments(id) ON DELETE CASCADE,
  copyright_notice_target_id uuid NOT NULL REFERENCES copyright_notice_targets(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (copyright_notice_submission_assessment_id, copyright_notice_target_id)
);

CREATE TABLE copyright_notice_legal_hold_assessments (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_submission_id uuid NOT NULL REFERENCES copyright_notice_submissions(id) ON DELETE CASCADE,
  assessed_at timestamptz NOT NULL,
  assessed_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  from_original_claimant boolean NOT NULL,
  proceeding_kind text CHECK (proceeding_kind IN ('federal_court', 'ccb')),
  ccb_claim_kind text CHECK (ccb_claim_kind IN ('claim', 'counterclaim')),
  commenced_at timestamptz,
  received_by_designated_agent_at timestamptz,
  same_material boolean NOT NULL,
  rationale_ciphertext text NOT NULL CHECK (char_length(rationale_ciphertext) BETWEEN 1 AND 65536),
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((proceeding_kind IS NULL AND commenced_at IS NULL) OR (proceeding_kind IS NOT NULL AND commenced_at IS NOT NULL)),
  CHECK (
    (proceeding_kind = 'ccb' AND ccb_claim_kind IS NOT NULL)
    OR
    (proceeding_kind IS DISTINCT FROM 'ccb' AND ccb_claim_kind IS NULL)
  )
);

COMMENT ON COLUMN copyright_notice_legal_hold_assessments.rationale_ciphertext IS 'Encrypted moderator rationale supporting the immutable legal-hold qualification assessment.';

CREATE TABLE copyright_notice_legal_hold_assessment_targets (
  copyright_notice_legal_hold_assessment_id uuid NOT NULL REFERENCES copyright_notice_legal_hold_assessments(id) ON DELETE CASCADE,
  copyright_notice_target_id uuid NOT NULL REFERENCES copyright_notice_targets(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (copyright_notice_legal_hold_assessment_id, copyright_notice_target_id)
);

CREATE TABLE copyright_notice_legal_hold_resolutions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_legal_hold_assessment_id uuid NOT NULL UNIQUE REFERENCES copyright_notice_legal_hold_assessments(id) ON DELETE RESTRICT,
  resolved_at timestamptz NOT NULL,
  resolved_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  resolution_kind text NOT NULL CHECK (resolution_kind IN ('dismissed', 'proceeding_ended', 'superseded')),
  rationale_ciphertext text NOT NULL CHECK (char_length(rationale_ciphertext) BETWEEN 1 AND 65536),
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE copyright_notice_deadlines (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_id uuid NOT NULL REFERENCES copyright_notices(id) ON DELETE RESTRICT,
  qualifying_counter_notice_assessment_id uuid NOT NULL UNIQUE REFERENCES copyright_notice_submission_assessments(id) ON DELETE RESTRICT,
  earliest_restoration_at timestamptz NOT NULL,
  escalation_at timestamptz NOT NULL,
  restoration_deadline_at timestamptz NOT NULL,
  resolved_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (earliest_restoration_at < escalation_at),
  CHECK (escalation_at < restoration_deadline_at),
  CHECK (num_nonnulls(resolved_at, cancelled_at) <= 1)
);

CREATE TABLE copyright_notice_correspondence_messages (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_email_intake_id uuid,
  copyright_notice_id uuid NOT NULL REFERENCES copyright_notices(id) ON DELETE RESTRICT,
  copyright_notice_submission_id uuid REFERENCES copyright_notice_submissions(id) ON DELETE RESTRICT,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  composition_kind text NOT NULL CHECK (composition_kind IN ('inbound', 'deterministic_template', 'staff', 'agent')),
  correspondence_kind text NOT NULL CONSTRAINT copyright_correspondence_kind_check CHECK (correspondence_kind IN (
    'receipt',
    'request_information',
    'restriction_notice',
    'counter_notice_forwarding',
    'restoration_notice',
    'status_update',
    'inbound_message'
  )),
  body_ciphertext text NOT NULL CHECK (char_length(body_ciphertext) BETWEEN 1 AND 1048576),
  drafted_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  approved_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  sent_at timestamptz,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (approved_at IS NULL OR composition_kind = 'agent'),
  CHECK (approved_at IS NOT NULL OR approved_by_id IS NULL),
  CHECK (sent_at IS NULL OR composition_kind <> 'agent' OR approved_at IS NOT NULL),
  CHECK (direction = 'outbound' OR sent_at IS NULL),
  CHECK (composition_kind = 'staff' OR drafted_by_id IS NULL),
  CHECK (
    (direction = 'inbound' AND composition_kind = 'inbound' AND copyright_notice_submission_id IS NOT NULL)
    OR
    (direction = 'outbound' AND composition_kind <> 'inbound')
  )
);

CREATE TABLE copyright_notice_lifecycle_events (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_id uuid NOT NULL REFERENCES copyright_notices(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN (
    'notice_received', 'supplement_received', 'appeal_received', 'counter_notice_received',
    'withdrawal_received', 'court_or_ccb_hold_received', 'submission_assessed',
    'appeal_reviewed', 'counter_notice_reviewed', 'evidence_artifact_recorded',
    'outbound_correspondence_created', 'agent_correspondence_approved',
    'email_correspondence_admitted', 'email_correspondence_rejected',
    'provisional_restriction_imposed', 'mandatory_human_review_completed',
    'legal_hold_assessed', 'legal_hold_resolved', 'counter_notice_deadline_started',
    'restoration_intent_created', 'reversal_restoration_intent_created',
    'copyright_action_replayed', 'delivery_intent_replayed',
    'media_delivery_registry_replayed', 'restoration_unavailable',
    'restriction_lifted_placement_retained', 'restoration_authorized_pending_delivery',
    'placement_withheld', 'placement_restored'
  )),
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  copyright_notice_submission_id uuid REFERENCES copyright_notice_submissions(id) ON DELETE RESTRICT,
  copyright_notice_submission_assessment_id uuid REFERENCES copyright_notice_submission_assessments(id) ON DELETE RESTRICT,
  copyright_notice_evidence_artifact_id uuid REFERENCES copyright_notice_evidence_artifacts(id) ON DELETE RESTRICT,
  copyright_notice_correspondence_id uuid REFERENCES copyright_notice_correspondence_messages(id) ON DELETE RESTRICT,
  copyright_notice_legal_hold_assessment_id uuid REFERENCES copyright_notice_legal_hold_assessments(id) ON DELETE RESTRICT,
  copyright_notice_legal_hold_resolution_id uuid REFERENCES copyright_notice_legal_hold_resolutions(id) ON DELETE RESTRICT,
  copyright_notice_deadline_id uuid REFERENCES copyright_notice_deadlines(id) ON DELETE RESTRICT,
  copyright_restriction_id uuid REFERENCES copyright_restrictions(id) ON DELETE RESTRICT,
  copyright_notice_action_intent_id uuid,
  copyright_notice_email_intake_id uuid,
  copyright_notice_delivery_intent_id uuid,
  media_delivery_registry_key text,
  review_action text CHECK (review_action IN ('confirm', 'reverse')),
  review_rationale_ciphertext text CHECK (review_rationale_ciphertext IS NULL OR char_length(review_rationale_ciphertext) BETWEEN 1 AND 65536),
  counter_notice_accepted boolean,
  recovery_source text CHECK (recovery_source IN ('durable_review', 'durable_decision')),
  replay_reason text CHECK (replay_reason = 'operator_replay'),
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((review_action IS NULL AND review_rationale_ciphertext IS NULL)
    OR (event_type = 'mandatory_human_review_completed' AND review_action IS NOT NULL AND review_rationale_ciphertext IS NOT NULL)),
  CHECK (counter_notice_accepted IS NULL OR event_type = 'counter_notice_reviewed'),
  CHECK (recovery_source IS NULL OR event_type = 'submission_assessed'),
  CHECK (replay_reason IS NULL OR event_type IN ('copyright_action_replayed', 'media_delivery_registry_replayed')),
  CHECK ((event_type = 'counter_notice_reviewed') = (counter_notice_accepted IS NOT NULL)),
  CHECK ((event_type = 'mandatory_human_review_completed') = (review_action IS NOT NULL)),
  CHECK (event_type <> 'media_delivery_registry_replayed' OR replay_reason IS NOT NULL),
  CONSTRAINT copyright_lifecycle_event_source_shape CHECK (
    num_nonnulls(
      copyright_notice_submission_id, copyright_notice_submission_assessment_id,
      copyright_notice_evidence_artifact_id, copyright_notice_correspondence_id,
      copyright_notice_legal_hold_assessment_id, copyright_notice_legal_hold_resolution_id,
      copyright_notice_deadline_id, copyright_restriction_id, copyright_notice_action_intent_id,
      copyright_notice_email_intake_id, copyright_notice_delivery_intent_id, media_delivery_registry_key
    ) = CASE WHEN event_type = 'notice_received' THEN 0 ELSE 1 END
    AND CASE
      WHEN event_type = 'notice_received' THEN true
      WHEN event_type IN ('supplement_received', 'appeal_received', 'counter_notice_received',
        'withdrawal_received', 'court_or_ccb_hold_received', 'appeal_reviewed', 'counter_notice_reviewed')
        THEN copyright_notice_submission_id IS NOT NULL
      WHEN event_type = 'submission_assessed' THEN copyright_notice_submission_assessment_id IS NOT NULL
      WHEN event_type = 'evidence_artifact_recorded' THEN copyright_notice_evidence_artifact_id IS NOT NULL
      WHEN event_type IN ('outbound_correspondence_created', 'agent_correspondence_approved',
        'email_correspondence_admitted') THEN copyright_notice_correspondence_id IS NOT NULL
      WHEN event_type = 'legal_hold_assessed' THEN copyright_notice_legal_hold_assessment_id IS NOT NULL
      WHEN event_type = 'legal_hold_resolved' THEN copyright_notice_legal_hold_resolution_id IS NOT NULL
      WHEN event_type = 'counter_notice_deadline_started' THEN copyright_notice_deadline_id IS NOT NULL
      WHEN event_type IN ('provisional_restriction_imposed', 'mandatory_human_review_completed')
        THEN copyright_restriction_id IS NOT NULL
      WHEN event_type IN ('restoration_intent_created', 'reversal_restoration_intent_created',
        'copyright_action_replayed', 'restoration_unavailable',
        'restriction_lifted_placement_retained', 'restoration_authorized_pending_delivery',
        'placement_withheld', 'placement_restored') THEN copyright_notice_action_intent_id IS NOT NULL
      WHEN event_type = 'email_correspondence_rejected' THEN copyright_notice_email_intake_id IS NOT NULL
      WHEN event_type = 'delivery_intent_replayed' THEN copyright_notice_delivery_intent_id IS NOT NULL
      WHEN event_type = 'media_delivery_registry_replayed' THEN media_delivery_registry_key IS NOT NULL
      ELSE false
    END
  )
);

CREATE TABLE copyright_notice_action_intents (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'claimed', 'completed', 'stale', 'blocked', 'failed')),
  delivery_attempt_count integer NOT NULL DEFAULT 0 CHECK (delivery_attempt_count BETWEEN 0 AND 5),
  claimed_at timestamptz,
  completed_at_reason text CHECK (completed_at_reason IS NULL OR completed_at_reason IN ('completed', 'stale', 'blocked', 'failed')),
  failure_message text CHECK (failure_message IS NULL OR char_length(failure_message) BETWEEN 1 AND 4096),
  next_attempt_at timestamptz,
  copyright_restriction_id uuid NOT NULL REFERENCES copyright_restrictions(id) ON DELETE CASCADE,
  copyright_notice_deadline_id uuid REFERENCES copyright_notice_deadlines(id) ON DELETE RESTRICT,
  expected_placement_revision integer NOT NULL CHECK (expected_placement_revision >= 0),
  action text NOT NULL CHECK (action IN ('withhold', 'restore')),
  completed_at timestamptz,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (copyright_restriction_id, expected_placement_revision, action),
  CHECK (copyright_notice_deadline_id IS NULL OR action = 'restore'),
  CONSTRAINT copyright_action_intents_delivery_state CHECK (
    (state = 'pending' AND completed_at IS NULL AND completed_at_reason IS NULL AND claimed_at IS NULL)
    OR (state = 'claimed' AND completed_at IS NULL AND completed_at_reason IS NULL AND claimed_at IS NOT NULL)
    OR (state IN ('completed', 'stale', 'blocked', 'failed')
      AND completed_at IS NOT NULL AND completed_at_reason = state AND next_attempt_at IS NULL)
  ),
  CONSTRAINT copyright_action_intents_retry_schedule CHECK (
    ((state = 'pending' AND (delivery_attempt_count = 0 OR next_attempt_at IS NOT NULL)) OR state <> 'pending')
    AND (state <> 'claimed' OR next_attempt_at IS NULL)
  )
);

ALTER TABLE copyright_notice_lifecycle_events
  ADD CONSTRAINT copyright_lifecycle_event_action_intent_fk
  FOREIGN KEY (copyright_notice_action_intent_id)
  REFERENCES copyright_notice_action_intents(id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE copyright_notice_lifecycle_events
  VALIDATE CONSTRAINT copyright_lifecycle_event_action_intent_fk;

CREATE OR REPLACE FUNCTION fn_guard_copyright_lifecycle_event_source_notice()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.copyright_notice_submission_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM copyright_notice_submissions source
    WHERE source.id = NEW.copyright_notice_submission_id
      AND source.copyright_notice_id = NEW.copyright_notice_id
  ) THEN RAISE EXCEPTION 'lifecycle submission belongs to another notice' USING ERRCODE = 'check_violation'; END IF;

  IF NEW.copyright_notice_submission_assessment_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM copyright_notice_submission_assessments source
    JOIN copyright_notice_submissions submission ON submission.id = source.copyright_notice_submission_id
    WHERE source.id = NEW.copyright_notice_submission_assessment_id
      AND submission.copyright_notice_id = NEW.copyright_notice_id
  ) THEN RAISE EXCEPTION 'lifecycle assessment belongs to another notice' USING ERRCODE = 'check_violation'; END IF;

  IF NEW.copyright_notice_evidence_artifact_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM copyright_notice_evidence_artifacts source
    JOIN copyright_notice_submissions submission ON submission.id = source.copyright_notice_submission_id
    WHERE source.id = NEW.copyright_notice_evidence_artifact_id
      AND submission.copyright_notice_id = NEW.copyright_notice_id
  ) THEN RAISE EXCEPTION 'lifecycle artifact belongs to another notice' USING ERRCODE = 'check_violation'; END IF;

  IF NEW.copyright_notice_correspondence_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM copyright_notice_correspondence_messages source
    WHERE source.id = NEW.copyright_notice_correspondence_id
      AND source.copyright_notice_id = NEW.copyright_notice_id
  ) THEN RAISE EXCEPTION 'lifecycle correspondence belongs to another notice' USING ERRCODE = 'check_violation'; END IF;

  IF NEW.copyright_notice_legal_hold_assessment_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM copyright_notice_legal_hold_assessments source
    JOIN copyright_notice_submissions submission ON submission.id = source.copyright_notice_submission_id
    WHERE source.id = NEW.copyright_notice_legal_hold_assessment_id
      AND submission.copyright_notice_id = NEW.copyright_notice_id
  ) THEN RAISE EXCEPTION 'lifecycle hold assessment belongs to another notice' USING ERRCODE = 'check_violation'; END IF;

  IF NEW.copyright_notice_legal_hold_resolution_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM copyright_notice_legal_hold_resolutions source
    JOIN copyright_notice_legal_hold_assessments assessment ON assessment.id = source.copyright_notice_legal_hold_assessment_id
    JOIN copyright_notice_submissions submission ON submission.id = assessment.copyright_notice_submission_id
    WHERE source.id = NEW.copyright_notice_legal_hold_resolution_id
      AND submission.copyright_notice_id = NEW.copyright_notice_id
  ) THEN RAISE EXCEPTION 'lifecycle hold resolution belongs to another notice' USING ERRCODE = 'check_violation'; END IF;

  IF NEW.copyright_notice_deadline_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM copyright_notice_deadlines source
    WHERE source.id = NEW.copyright_notice_deadline_id
      AND source.copyright_notice_id = NEW.copyright_notice_id
  ) THEN RAISE EXCEPTION 'lifecycle deadline belongs to another notice' USING ERRCODE = 'check_violation'; END IF;

  IF NEW.copyright_restriction_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM copyright_restrictions source
    JOIN copyright_notice_targets target ON target.id = source.copyright_notice_target_id
    WHERE source.id = NEW.copyright_restriction_id
      AND target.copyright_notice_id = NEW.copyright_notice_id
  ) THEN RAISE EXCEPTION 'lifecycle restriction belongs to another notice' USING ERRCODE = 'check_violation'; END IF;

  IF NEW.copyright_notice_action_intent_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM copyright_notice_action_intents source
    JOIN copyright_restrictions restriction ON restriction.id = source.copyright_restriction_id
    JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
    WHERE source.id = NEW.copyright_notice_action_intent_id
      AND target.copyright_notice_id = NEW.copyright_notice_id
  ) THEN RAISE EXCEPTION 'lifecycle action intent belongs to another notice' USING ERRCODE = 'check_violation'; END IF;

  IF NEW.copyright_notice_email_intake_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM copyright_notice_email_intake_notice_links source
    WHERE source.copyright_notice_email_intake_id = NEW.copyright_notice_email_intake_id
      AND source.copyright_notice_id = NEW.copyright_notice_id
  ) THEN RAISE EXCEPTION 'lifecycle email intake belongs to another notice' USING ERRCODE = 'check_violation'; END IF;

  IF NEW.copyright_notice_delivery_intent_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM copyright_notice_delivery_intents source
    WHERE source.id = NEW.copyright_notice_delivery_intent_id
      AND source.copyright_notice_id = NEW.copyright_notice_id
  ) THEN RAISE EXCEPTION 'lifecycle delivery intent belongs to another notice' USING ERRCODE = 'check_violation'; END IF;

  IF NEW.media_delivery_registry_key IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM media_delivery_registry_records source
    JOIN copyright_notice_targets target ON target.placement_id = source.placement_id
    WHERE source.delivery_key = NEW.media_delivery_registry_key
      AND target.copyright_notice_id = NEW.copyright_notice_id
  ) THEN RAISE EXCEPTION 'lifecycle media delivery record belongs to another notice' USING ERRCODE = 'check_violation'; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_guard_copyright_lifecycle_event_source_notice
BEFORE INSERT ON copyright_notice_lifecycle_events
FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_lifecycle_event_source_notice();

CREATE INDEX idx_copyright_notice_targets__placement ON copyright_notice_targets(placement_id, placement_revision);
CREATE INDEX idx_copyright_notice_target_images__image ON copyright_notice_target_images(image_id);
CREATE INDEX idx_copyright_notice_target_images__binding ON copyright_notice_target_images(placement_id, image_id, binding_family);
CREATE INDEX idx_copyright_restrictions__target ON copyright_restrictions(copyright_notice_target_id);
CREATE INDEX idx_copyright_restrictions__human_reviewer ON copyright_restrictions(human_reviewed_by_id) WHERE human_reviewed_by_id IS NOT NULL;
CREATE INDEX idx_copyright_notice_submissions__notice_received ON copyright_notice_submissions(copyright_notice_id, received_at, id);
CREATE INDEX idx_copyright_notice_submissions__submitted_by ON copyright_notice_submissions(submitted_by_user_id) WHERE submitted_by_user_id IS NOT NULL;
CREATE INDEX idx_copyright_notice_assessments__submission ON copyright_notice_submission_assessments(copyright_notice_submission_id, id DESC);
CREATE INDEX idx_copyright_notice_assessments__assessed_by ON copyright_notice_submission_assessments(assessed_by_id) WHERE assessed_by_id IS NOT NULL;
CREATE INDEX idx_copyright_notice_counter_assessment_targets__target ON copyright_notice_counter_notice_assessment_targets(copyright_notice_target_id, copyright_notice_submission_assessment_id);
CREATE INDEX idx_copyright_notice_hold_assessments__submission ON copyright_notice_legal_hold_assessments(copyright_notice_submission_id, id DESC);
CREATE INDEX idx_copyright_notice_hold_assessments__assessed_by ON copyright_notice_legal_hold_assessments(assessed_by_id, id DESC);
CREATE INDEX idx_copyright_notice_hold_targets__target ON copyright_notice_legal_hold_assessment_targets(copyright_notice_target_id, copyright_notice_legal_hold_assessment_id);
CREATE INDEX idx_copyright_notice_hold_resolutions__resolved_by ON copyright_notice_legal_hold_resolutions(resolved_by_id, id DESC);
CREATE INDEX idx_copyright_notice_deadlines__notice ON copyright_notice_deadlines(copyright_notice_id, id DESC);
CREATE INDEX idx_copyright_notice_deadlines__pending ON copyright_notice_deadlines(escalation_at, id) WHERE resolved_at IS NULL AND cancelled_at IS NULL;
CREATE INDEX idx_copyright_notice_correspondence__notice ON copyright_notice_correspondence_messages(copyright_notice_id, id);
CREATE INDEX idx_copyright_notice_correspondence__submission ON copyright_notice_correspondence_messages(copyright_notice_submission_id) WHERE copyright_notice_submission_id IS NOT NULL;
CREATE INDEX idx_copyright_notice_correspondence__drafted_by ON copyright_notice_correspondence_messages(drafted_by_id) WHERE drafted_by_id IS NOT NULL;
CREATE INDEX idx_copyright_notice_correspondence__approved_by ON copyright_notice_correspondence_messages(approved_by_id) WHERE approved_by_id IS NOT NULL;
CREATE INDEX idx_copyright_notice_events__notice ON copyright_notice_lifecycle_events(copyright_notice_id, id DESC);
CREATE INDEX idx_copyright_notice_events__submission ON copyright_notice_lifecycle_events(copyright_notice_submission_id) WHERE copyright_notice_submission_id IS NOT NULL;
CREATE INDEX idx_copyright_notice_events__assessment ON copyright_notice_lifecycle_events(copyright_notice_submission_assessment_id) WHERE copyright_notice_submission_assessment_id IS NOT NULL;
CREATE INDEX idx_copyright_notice_events__artifact ON copyright_notice_lifecycle_events(copyright_notice_evidence_artifact_id) WHERE copyright_notice_evidence_artifact_id IS NOT NULL;
CREATE INDEX idx_copyright_notice_events__correspondence ON copyright_notice_lifecycle_events(copyright_notice_correspondence_id) WHERE copyright_notice_correspondence_id IS NOT NULL;
CREATE INDEX idx_copyright_notice_events__hold_assessment ON copyright_notice_lifecycle_events(copyright_notice_legal_hold_assessment_id) WHERE copyright_notice_legal_hold_assessment_id IS NOT NULL;
CREATE INDEX idx_copyright_notice_events__hold_resolution ON copyright_notice_lifecycle_events(copyright_notice_legal_hold_resolution_id) WHERE copyright_notice_legal_hold_resolution_id IS NOT NULL;
CREATE INDEX idx_copyright_notice_events__deadline ON copyright_notice_lifecycle_events(copyright_notice_deadline_id) WHERE copyright_notice_deadline_id IS NOT NULL;
CREATE INDEX idx_copyright_notice_events__restriction ON copyright_notice_lifecycle_events(copyright_restriction_id) WHERE copyright_restriction_id IS NOT NULL;
CREATE INDEX idx_copyright_notice_events__action_intent ON copyright_notice_lifecycle_events(copyright_notice_action_intent_id) WHERE copyright_notice_action_intent_id IS NOT NULL;
CREATE INDEX idx_copyright_notice_events__email_intake ON copyright_notice_lifecycle_events(copyright_notice_email_intake_id) WHERE copyright_notice_email_intake_id IS NOT NULL;
CREATE INDEX idx_copyright_notice_events__delivery_intent ON copyright_notice_lifecycle_events(copyright_notice_delivery_intent_id) WHERE copyright_notice_delivery_intent_id IS NOT NULL;
CREATE INDEX idx_copyright_notice_events__media_registry ON copyright_notice_lifecycle_events(media_delivery_registry_key) WHERE media_delivery_registry_key IS NOT NULL;
CREATE INDEX idx_copyright_notice_intents__pending ON copyright_notice_action_intents(id) WHERE completed_at IS NULL;
CREATE INDEX idx_copyright_notice_intents__deadline ON copyright_notice_action_intents(copyright_notice_deadline_id) WHERE copyright_notice_deadline_id IS NOT NULL;
CREATE INDEX idx_copyright_notices__claimant_user ON copyright_notices(claimant_user_id) WHERE claimant_user_id IS NOT NULL;
CREATE INDEX idx_copyright_restrictions__imposed_by ON copyright_restrictions(imposed_by_id) WHERE imposed_by_id IS NOT NULL;
CREATE INDEX idx_copyright_restrictions__lifted_by ON copyright_restrictions(lifted_by_id) WHERE lifted_by_id IS NOT NULL;
CREATE INDEX idx_copyright_notice_events__actor ON copyright_notice_lifecycle_events(actor_user_id) WHERE actor_user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION fn_guard_copyright_notice_immutable_evidence()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'copyright legal receipt and evidence records are immutable' USING ERRCODE = 'check_violation';
END;
$$;

CREATE OR REPLACE FUNCTION fn_guard_copyright_immutable_with_actor_erasure()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  actor_column text;
  old_actor jsonb;
  new_actor jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'copyright legal records are retained' USING ERRCODE = 'check_violation';
  END IF;
  IF (to_jsonb(OLD) - TG_ARGV) IS DISTINCT FROM (to_jsonb(NEW) - TG_ARGV) THEN
    RAISE EXCEPTION 'copyright legal records are immutable' USING ERRCODE = 'check_violation';
  END IF;
  FOREACH actor_column IN ARRAY TG_ARGV LOOP
    old_actor := to_jsonb(OLD) -> actor_column;
    new_actor := to_jsonb(NEW) -> actor_column;
    IF old_actor IS DISTINCT FROM new_actor
      AND (old_actor = 'null'::jsonb OR new_actor <> 'null'::jsonb) THEN
      RAISE EXCEPTION 'copyright legal record actors may only be erased' USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fn_require_copyright_human_actor()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF to_jsonb(NEW) ->> TG_ARGV[0] IS NULL THEN
    RAISE EXCEPTION 'copyright human decisions require an identified actor' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fn_guard_copyright_assessment_supersession()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.supersedes_assessment_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM copyright_notice_submission_assessments prior
    WHERE prior.id = NEW.supersedes_assessment_id
      AND prior.copyright_notice_submission_id = NEW.copyright_notice_submission_id
  ) THEN
    RAISE EXCEPTION 'copyright assessment corrections must stay within one submission' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fn_guard_copyright_assessment_source()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM copyright_notice_submissions submission
    WHERE submission.id = NEW.copyright_notice_submission_id
      AND submission.source_kind IN ('guest_form', 'email')
  ) AND NEW.assessed_by_id IS NULL THEN
    RAISE EXCEPTION 'guest and email copyright assessments require a human assessor' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fn_guard_copyright_counter_notice_assessment_target_scope()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM copyright_notice_submission_assessments assessment
    JOIN copyright_notice_submissions submission
      ON submission.id = assessment.copyright_notice_submission_id
    JOIN copyright_notice_targets target
      ON target.id = NEW.copyright_notice_target_id
    WHERE assessment.id = NEW.copyright_notice_submission_assessment_id
      AND submission.kind = 'counter_notice'
      AND target.copyright_notice_id = submission.copyright_notice_id
  ) THEN
    RAISE EXCEPTION 'counter-notice assessments may cover only targets in the same case' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fn_guard_copyright_hold_target_scope()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM copyright_notice_legal_hold_assessments assessment
    JOIN copyright_notice_submissions submission
      ON submission.id = assessment.copyright_notice_submission_id
    JOIN copyright_notice_targets target
      ON target.id = NEW.copyright_notice_target_id
    WHERE assessment.id = NEW.copyright_notice_legal_hold_assessment_id
      AND target.copyright_notice_id = submission.copyright_notice_id
  ) THEN
    RAISE EXCEPTION 'copyright legal holds may cover only targets in the same case' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fn_guard_copyright_notice_submission()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'copyright legal receipt records are retained' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.submitted_by_user_id IS NOT NULL
    AND NEW.submitted_by_user_id IS NULL
    AND ROW(
      OLD.id,
      OLD.copyright_notice_id,
      OLD.kind,
      OLD.received_at,
      OLD.source_kind,
      OLD.body_ciphertext,
      OLD.created_at,
      OLD.updated_at
    ) IS NOT DISTINCT FROM ROW(
      NEW.id,
      NEW.copyright_notice_id,
      NEW.kind,
      NEW.received_at,
      NEW.source_kind,
      NEW.body_ciphertext,
      NEW.created_at,
      NEW.updated_at
    ) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'copyright legal receipt records are immutable' USING ERRCODE = 'check_violation';
END;
$$;

CREATE TRIGGER trigger_copyright_notice_submissions_immutable BEFORE UPDATE OR DELETE ON copyright_notice_submissions FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_notice_submission();
CREATE TRIGGER trigger_copyright_notice_evidence_immutable BEFORE UPDATE OR DELETE ON copyright_notice_evidence_artifacts FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_notice_immutable_evidence();
CREATE TRIGGER trigger_copyright_notice_assessments_immutable BEFORE UPDATE OR DELETE ON copyright_notice_submission_assessments FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_immutable_with_actor_erasure('assessed_by_id');
CREATE TRIGGER trigger_copyright_notice_assessments_scope BEFORE INSERT ON copyright_notice_submission_assessments FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_assessment_supersession();
CREATE TRIGGER trigger_copyright_notice_assessments_source BEFORE INSERT ON copyright_notice_submission_assessments FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_assessment_source();
CREATE TRIGGER trigger_copyright_notice_counter_assessment_targets_immutable BEFORE UPDATE OR DELETE ON copyright_notice_counter_notice_assessment_targets FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_notice_immutable_evidence();
CREATE TRIGGER trigger_copyright_notice_counter_assessment_targets_scope BEFORE INSERT ON copyright_notice_counter_notice_assessment_targets FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_counter_notice_assessment_target_scope();
CREATE TRIGGER trigger_copyright_notice_hold_assessments_immutable BEFORE UPDATE OR DELETE ON copyright_notice_legal_hold_assessments FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_immutable_with_actor_erasure('assessed_by_id');
CREATE TRIGGER trigger_copyright_notice_hold_assessments_require_actor BEFORE INSERT ON copyright_notice_legal_hold_assessments FOR EACH ROW EXECUTE FUNCTION fn_require_copyright_human_actor('assessed_by_id');
CREATE TRIGGER trigger_copyright_notice_hold_targets_immutable BEFORE UPDATE OR DELETE ON copyright_notice_legal_hold_assessment_targets FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_notice_immutable_evidence();
CREATE TRIGGER trigger_copyright_notice_hold_targets_scope BEFORE INSERT ON copyright_notice_legal_hold_assessment_targets FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_hold_target_scope();
CREATE TRIGGER trigger_copyright_notice_hold_resolutions_immutable BEFORE UPDATE OR DELETE ON copyright_notice_legal_hold_resolutions FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_immutable_with_actor_erasure('resolved_by_id');
CREATE TRIGGER trigger_copyright_notice_hold_resolutions_require_actor BEFORE INSERT ON copyright_notice_legal_hold_resolutions FOR EACH ROW EXECUTE FUNCTION fn_require_copyright_human_actor('resolved_by_id');
CREATE TRIGGER trigger_copyright_notice_events_immutable BEFORE UPDATE OR DELETE ON copyright_notice_lifecycle_events FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_immutable_with_actor_erasure('actor_user_id');

CREATE OR REPLACE FUNCTION fn_guard_copyright_notice_identity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'copyright notices are retained legal records' USING ERRCODE = 'check_violation';
  END IF;
  IF ROW(
    OLD.jurisdiction,
    OLD.legal_basis,
    OLD.received_at,
    OLD.claimant_display_name,
    OLD.claimant_contact_ciphertext,
    OLD.work_description,
    OLD.policy_version
  ) IS DISTINCT FROM ROW(
    NEW.jurisdiction,
    NEW.legal_basis,
    NEW.received_at,
    NEW.claimant_display_name,
    NEW.claimant_contact_ciphertext,
    NEW.work_description,
    NEW.policy_version
  ) THEN
    RAISE EXCEPTION 'copyright notice identity and receipt snapshot are immutable' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.claimant_user_id IS DISTINCT FROM NEW.claimant_user_id AND NEW.claimant_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'copyright notice claimant account cannot be reassigned' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_copyright_notices_identity_immutable BEFORE UPDATE OR DELETE ON copyright_notices FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_notice_identity();
CREATE TRIGGER trigger_copyright_notice_targets_immutable BEFORE UPDATE OR DELETE ON copyright_notice_targets FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_notice_immutable_evidence();
CREATE TRIGGER trigger_copyright_notice_target_images_immutable BEFORE UPDATE OR DELETE ON copyright_notice_target_images FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_notice_immutable_evidence();

CREATE OR REPLACE FUNCTION fn_guard_copyright_notice_lifecycle()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'copyright restrictions are append-only legal blockers' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.accepted_at IS NOT NULL AND OLD.accepted_at IS DISTINCT FROM NEW.accepted_at THEN
    RAISE EXCEPTION 'copyright notice acceptance is irreversible' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.provisional_withholding_at IS NOT NULL
    AND OLD.provisional_withholding_at IS DISTINCT FROM NEW.provisional_withholding_at THEN
    RAISE EXCEPTION 'copyright notice provisional withholding timestamp is immutable' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_copyright_notices_lifecycle_guard BEFORE UPDATE ON copyright_notices FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_notice_lifecycle();
CREATE TRIGGER trigger_copyright_notices_updated_at BEFORE UPDATE ON copyright_notices FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE OR REPLACE FUNCTION fn_guard_copyright_restriction_lifecycle()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'copyright restrictions are retained legal records' USING ERRCODE = 'check_violation';
  END IF;
  IF ROW(OLD.copyright_notice_target_id, OLD.imposed_at)
    IS DISTINCT FROM ROW(NEW.copyright_notice_target_id, NEW.imposed_at)
    OR (OLD.imposed_by_id IS DISTINCT FROM NEW.imposed_by_id AND NEW.imposed_by_id IS NOT NULL) THEN
    RAISE EXCEPTION 'copyright restriction origin is immutable' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.lifted_at IS NOT NULL
    AND (OLD.lifted_at IS DISTINCT FROM NEW.lifted_at
      OR (OLD.lifted_by_id IS DISTINCT FROM NEW.lifted_by_id AND NEW.lifted_by_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'copyright restriction lift is immutable' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.human_reviewed_at IS NOT NULL
    AND (ROW(OLD.human_reviewed_at, OLD.human_review_action)
      IS DISTINCT FROM ROW(NEW.human_reviewed_at, NEW.human_review_action)
      OR (OLD.human_reviewed_by_id IS DISTINCT FROM NEW.human_reviewed_by_id
        AND NEW.human_reviewed_by_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'copyright restriction human review is immutable' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.human_reviewed_at IS NULL
    AND NEW.human_reviewed_at IS NOT NULL
    AND NEW.human_reviewed_by_id IS NULL THEN
    RAISE EXCEPTION 'copyright restriction human review requires an identified actor' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_copyright_restrictions_lifecycle_guard BEFORE UPDATE OR DELETE ON copyright_restrictions FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_restriction_lifecycle();
CREATE TRIGGER trigger_copyright_restrictions_updated_at BEFORE UPDATE ON copyright_restrictions FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE OR REPLACE FUNCTION fn_guard_copyright_action_intent()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'copyright action intents are durable saga records' USING ERRCODE = 'check_violation';
  END IF;
  IF ROW(OLD.copyright_restriction_id, OLD.expected_placement_revision, OLD.action)
    IS DISTINCT FROM ROW(NEW.copyright_restriction_id, NEW.expected_placement_revision, NEW.action) THEN
    RAISE EXCEPTION 'copyright action intent identity and revision fence are immutable' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.completed_at IS NOT NULL AND OLD.completed_at IS DISTINCT FROM NEW.completed_at THEN
    RAISE EXCEPTION 'copyright action intent completion is immutable' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_copyright_action_intents_guard BEFORE UPDATE OR DELETE ON copyright_notice_action_intents FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_action_intent();
CREATE TRIGGER trigger_copyright_action_intents_updated_at BEFORE UPDATE ON copyright_notice_action_intents FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE OR REPLACE FUNCTION fn_guard_copyright_deadline()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'copyright deadlines are durable statutory records' USING ERRCODE = 'check_violation';
  END IF;
  IF ROW(
    OLD.copyright_notice_id,
    OLD.qualifying_counter_notice_assessment_id,
    OLD.earliest_restoration_at,
    OLD.escalation_at,
    OLD.restoration_deadline_at
  ) IS DISTINCT FROM ROW(
    NEW.copyright_notice_id,
    NEW.qualifying_counter_notice_assessment_id,
    NEW.earliest_restoration_at,
    NEW.escalation_at,
    NEW.restoration_deadline_at
  ) THEN
    RAISE EXCEPTION 'copyright deadline origin and schedule are immutable' USING ERRCODE = 'check_violation';
  END IF;
  IF (OLD.resolved_at IS NOT NULL OR OLD.cancelled_at IS NOT NULL)
    AND ROW(OLD.resolved_at, OLD.cancelled_at) IS DISTINCT FROM ROW(NEW.resolved_at, NEW.cancelled_at) THEN
    RAISE EXCEPTION 'copyright deadline terminal outcome is immutable' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_copyright_deadlines_guard BEFORE UPDATE OR DELETE ON copyright_notice_deadlines FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_deadline();
CREATE TRIGGER trigger_copyright_deadlines_updated_at BEFORE UPDATE ON copyright_notice_deadlines FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE OR REPLACE FUNCTION fn_guard_copyright_correspondence()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'copyright correspondence is a retained legal record' USING ERRCODE = 'check_violation';
  END IF;
  IF ROW(
    OLD.copyright_notice_id,
    OLD.copyright_notice_submission_id,
    OLD.direction,
    OLD.composition_kind,
    OLD.correspondence_kind,
    NULL
  ) IS DISTINCT FROM ROW(
    NEW.copyright_notice_id,
    NEW.copyright_notice_submission_id,
    NEW.direction,
    NEW.composition_kind,
    NEW.correspondence_kind,
    NULL
  ) THEN
    RAISE EXCEPTION 'copyright correspondence identity is immutable' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.direction = 'inbound' AND OLD.body_ciphertext IS DISTINCT FROM NEW.body_ciphertext THEN
    RAISE EXCEPTION 'inbound copyright correspondence body is immutable' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.approved_at IS NOT NULL AND ROW(
    OLD.body_ciphertext,
    OLD.approved_at
  ) IS DISTINCT FROM ROW(
    NEW.body_ciphertext,
    NEW.approved_at
  ) THEN
    RAISE EXCEPTION 'approved copyright correspondence is immutable' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.sent_at IS NOT NULL AND OLD.body_ciphertext IS DISTINCT FROM NEW.body_ciphertext THEN
    RAISE EXCEPTION 'sent copyright correspondence body is immutable' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.approved_at IS NULL AND NEW.approved_at IS NOT NULL AND NEW.approved_by_id IS NULL THEN
    RAISE EXCEPTION 'copyright correspondence approval requires an identified actor' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.drafted_by_id IS DISTINCT FROM NEW.drafted_by_id AND NEW.drafted_by_id IS NOT NULL THEN
    RAISE EXCEPTION 'copyright correspondence drafter cannot be reassigned' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.approved_by_id IS DISTINCT FROM NEW.approved_by_id
    AND OLD.approved_by_id IS NOT NULL
    AND NEW.approved_by_id IS NOT NULL THEN
    RAISE EXCEPTION 'copyright correspondence approver cannot be reassigned' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.sent_at IS NOT NULL AND OLD.sent_at IS DISTINCT FROM NEW.sent_at THEN
    RAISE EXCEPTION 'copyright correspondence delivery is immutable' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_copyright_correspondence_guard BEFORE UPDATE OR DELETE ON copyright_notice_correspondence_messages FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_correspondence();
CREATE TRIGGER trigger_copyright_correspondence_updated_at BEFORE UPDATE ON copyright_notice_correspondence_messages FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE copyright_notices IS 'Legal copyright allegation aggregate. Member views must use an allowlisted projection and never expose contact or evidence.';
COMMENT ON COLUMN copyright_notices.jurisdiction IS 'Procedure selected for this allegation: US DMCA, EU DSA, UK, or other counsel-reviewed handling.';
COMMENT ON COLUMN copyright_notices.legal_basis IS 'Legal basis for the case; this aggregate is restricted to copyright allegations.';
COMMENT ON COLUMN copyright_notices.received_at IS 'Immutable timestamp when Voucha originally received the allegation.';
COMMENT ON COLUMN copyright_notices.accepted_at IS 'When deterministic or staff validation accepted the allegation into the authenticated member record.';
COMMENT ON COLUMN copyright_notices.provisional_withholding_at IS 'When the case first caused a provisional restriction; NULL when no restriction was imposed.';
COMMENT ON COLUMN copyright_notices.claimant_user_id IS 'Signed-in claimant account linked to the member record; NULL for guest/email claimants or after account deletion.';
COMMENT ON COLUMN copyright_notices.claimant_display_name IS 'Immutable claimant display-name snapshot for authorized legal and staff use.';
COMMENT ON COLUMN copyright_notices.claimant_contact_ciphertext IS 'Authenticated ciphertext containing private claimant contact details.';
COMMENT ON COLUMN copyright_notices.work_description IS 'Private description identifying the copyrighted work claimed by the submitter.';
COMMENT ON COLUMN copyright_notices.policy_version IS 'Version of the intake declarations and legal workflow applied when the allegation was received.';

COMMENT ON TABLE copyright_notice_targets IS 'Immutable media-kind-neutral snapshot of each exact hosted use identified by a copyright allegation.';
COMMENT ON COLUMN copyright_notice_targets.copyright_notice_id IS 'Copyright allegation that identified this hosted use.';
COMMENT ON COLUMN copyright_notice_targets.placement_id IS 'Concrete retained post-image placement identity for the exact hosted use; retention never grants live delivery authority.';
COMMENT ON COLUMN copyright_notice_targets.placement_revision IS 'Placement revision observed when the allegation target was captured.';
COMMENT ON COLUMN copyright_notice_targets.hosted_use_url IS 'Immutable URL snapshot supplied or resolved for the identified hosted use.';

COMMENT ON TABLE copyright_notice_target_images IS 'Typed image subtype for a copyright target; future video support adds a sibling typed relation without a polymorphic foreign key.';
COMMENT ON COLUMN copyright_notice_target_images.copyright_notice_target_id IS 'Copyright target whose hosted media is the referenced image.';
COMMENT ON COLUMN copyright_notice_target_images.placement_id IS 'Retained placement identity shared with the parent target so the image binding matches that exact hosted use.';
COMMENT ON COLUMN copyright_notice_target_images.image_id IS 'Image asset captured for the exact hosted placement revision.';
COMMENT ON COLUMN copyright_notice_target_images.binding_family IS 'Retained placement binding family for this image. The current family is post.';

COMMENT ON TABLE copyright_restrictions IS 'Independent, reversible legal restrictions; lifting one restriction never lifts another active restriction.';
COMMENT ON COLUMN copyright_restrictions.copyright_notice_target_id IS 'Exact allegation target governed by this independent restriction.';
COMMENT ON COLUMN copyright_restrictions.imposed_at IS 'When the independent restriction became active.';
COMMENT ON COLUMN copyright_restrictions.lifted_at IS 'One-way timestamp recording when this restriction was lifted.';
COMMENT ON COLUMN copyright_restrictions.imposed_by_id IS 'Staff actor that imposed the restriction, or NULL for an authorized automatic provisional action.';
COMMENT ON COLUMN copyright_restrictions.lifted_by_id IS 'Staff actor that lifted the restriction; NULL denotes an authorized system restoration.';
COMMENT ON COLUMN copyright_restrictions.human_reviewed_at IS 'When staff completed the mandatory review of this exact provisional restriction.';
COMMENT ON COLUMN copyright_restrictions.human_review_action IS 'Human outcome for this restriction: confirm, modify, or reverse.';
COMMENT ON COLUMN copyright_restrictions.human_reviewed_by_id IS 'Staff reviewer; may become NULL only when the reviewer account is erased.';

COMMENT ON TABLE copyright_notice_submissions IS 'Immutable receipt provenance. Statutory timing always starts from the assessed submission received_at, never parser or approval time.';
COMMENT ON COLUMN copyright_notice_submissions.copyright_notice_id IS 'Legal case to which this immutable inbound submission belongs.';
COMMENT ON COLUMN copyright_notice_submissions.submitted_by_user_id IS 'Authenticated submitting account for a form, appeal, or counter-notice; NULL for email/guest sources or after account deletion.';
COMMENT ON COLUMN copyright_notice_submissions.kind IS 'Submission role: allegation, supplement, ordinary appeal, statutory counter-notice, withdrawal, or proceeding notice.';
COMMENT ON COLUMN copyright_notice_submissions.received_at IS 'Immutable provider or form receipt timestamp for this exact submission.';
COMMENT ON COLUMN copyright_notice_submissions.source_kind IS 'Authenticated form, guest form, email, or staff-recorded source channel.';
COMMENT ON COLUMN copyright_notice_submissions.body_ciphertext IS 'Authenticated ciphertext of the private structured submission or preserved message body.';

COMMENT ON TABLE copyright_notice_submission_assessments IS 'Append-only compliance assessment. A compliant counter-notice uses its referenced immutable submission received_at as the statutory clock origin.';
COMMENT ON COLUMN copyright_notice_submission_assessments.copyright_notice_submission_id IS 'Immutable submission evaluated by this assessment.';
COMMENT ON COLUMN copyright_notice_submission_assessments.supersedes_assessment_id IS 'Prior assessment corrected by this append-only assessment; NULL for the first assessment.';
COMMENT ON COLUMN copyright_notice_submission_assessments.assessed_at IS 'When deterministic validation or a moderator recorded this assessment.';
COMMENT ON COLUMN copyright_notice_submission_assessments.assessed_by_id IS 'Staff assessor; NULL denotes deterministic validation.';
COMMENT ON COLUMN copyright_notice_submission_assessments.substantially_compliant IS 'Whether this exact submission contains the required elements for its legal procedure.';

COMMENT ON TABLE copyright_notice_counter_notice_assessment_targets IS 'Exact hosted targets covered by a substantially compliant statutory counter-notice assessment.';
COMMENT ON COLUMN copyright_notice_counter_notice_assessment_targets.copyright_notice_submission_assessment_id IS 'Counter-notice compliance assessment whose scope is recorded.';
COMMENT ON COLUMN copyright_notice_counter_notice_assessment_targets.copyright_notice_target_id IS 'Exact hosted target the counter-notice asks to restore.';

COMMENT ON TABLE copyright_notice_legal_hold_assessments IS 'Append-only staff assessment of whether a received court or CCB filing qualifies to block restoration under 17 USC 512(g) or 1507(d).';
COMMENT ON COLUMN copyright_notice_legal_hold_assessments.copyright_notice_submission_id IS 'Immutable court or CCB submission evaluated by this assessment.';
COMMENT ON COLUMN copyright_notice_legal_hold_assessments.assessed_at IS 'When staff completed the legal-hold qualification assessment.';
COMMENT ON COLUMN copyright_notice_legal_hold_assessments.assessed_by_id IS 'Staff user responsible for the legal-hold assessment.';
COMMENT ON COLUMN copyright_notice_legal_hold_assessments.from_original_claimant IS 'Whether the filing came from the claimant that sent the original allegation.';
COMMENT ON COLUMN copyright_notice_legal_hold_assessments.proceeding_kind IS 'Commenced federal-court action or qualifying CCB 17 USC 1507(d) proceeding; NULL for a threat or unsupported filing.';
COMMENT ON COLUMN copyright_notice_legal_hold_assessments.ccb_claim_kind IS 'CCB claim or counterclaim category required by 17 USC 1507(d); NULL for non-CCB submissions.';
COMMENT ON COLUMN copyright_notice_legal_hold_assessments.commenced_at IS 'When the qualifying proceeding was commenced, not when it was merely threatened.';
COMMENT ON COLUMN copyright_notice_legal_hold_assessments.received_by_designated_agent_at IS 'When the designated agent received proof of the commenced proceeding; NULL when delivered elsewhere or not proven.';
COMMENT ON COLUMN copyright_notice_legal_hold_assessments.same_material IS 'Whether the proceeding identifies the same hosted material governed by the proposed restoration.';

COMMENT ON TABLE copyright_notice_legal_hold_assessment_targets IS 'Exact allegation targets covered by a legal-hold assessment; unrelated targets remain independently restorable.';
COMMENT ON COLUMN copyright_notice_legal_hold_assessment_targets.copyright_notice_legal_hold_assessment_id IS 'Legal-hold assessment whose material scope is recorded.';
COMMENT ON COLUMN copyright_notice_legal_hold_assessment_targets.copyright_notice_target_id IS 'Exact hosted target covered by the assessed proceeding.';

COMMENT ON TABLE copyright_notice_legal_hold_resolutions IS 'Immutable resolution of a previously assessed restoration hold; a resolved hold no longer blocks restoration.';
COMMENT ON COLUMN copyright_notice_legal_hold_resolutions.copyright_notice_legal_hold_assessment_id IS 'Hold assessment resolved by this immutable record.';
COMMENT ON COLUMN copyright_notice_legal_hold_resolutions.resolved_at IS 'When staff determined the hold no longer applied.';
COMMENT ON COLUMN copyright_notice_legal_hold_resolutions.resolved_by_id IS 'Staff user responsible for resolving the hold.';
COMMENT ON COLUMN copyright_notice_legal_hold_resolutions.resolution_kind IS 'Why the hold ended: dismissed, proceeding ended, or superseded by a corrected assessment.';
COMMENT ON COLUMN copyright_notice_legal_hold_resolutions.rationale_ciphertext IS 'Authenticated ciphertext of private staff rationale and supporting references.';

COMMENT ON TABLE copyright_notice_deadlines IS 'Durable US counter-notice restoration window derived from an immutable substantially compliant counter-notice receipt.';
COMMENT ON COLUMN copyright_notice_deadlines.copyright_notice_id IS 'Legal case governed by this restoration deadline.';
COMMENT ON COLUMN copyright_notice_deadlines.qualifying_counter_notice_assessment_id IS 'Compliance assessment whose referenced submission receipt starts the statutory clock.';
COMMENT ON COLUMN copyright_notice_deadlines.earliest_restoration_at IS 'Start of US federal business day ten in America/New_York.';
COMMENT ON COLUMN copyright_notice_deadlines.escalation_at IS 'Start of US federal business day fourteen, when unresolved restoration requires urgent escalation.';
COMMENT ON COLUMN copyright_notice_deadlines.restoration_deadline_at IS 'Exclusive end of US federal business day fourteen in America/New_York.';
COMMENT ON COLUMN copyright_notice_deadlines.resolved_at IS 'One-way timestamp set when every eligible restriction covered by this deadline is restored.';
COMMENT ON COLUMN copyright_notice_deadlines.cancelled_at IS 'One-way timestamp set when withdrawal, reversal, or another durable ground cancels the deadline.';

COMMENT ON TABLE copyright_notice_correspondence_messages IS 'Private inbound and outbound legal correspondence; agent-composed outbound text requires human approval before delivery.';
COMMENT ON COLUMN copyright_notice_correspondence_messages.copyright_notice_id IS 'Legal case to which this correspondence belongs.';
COMMENT ON COLUMN copyright_notice_correspondence_messages.copyright_notice_submission_id IS 'Inbound submission represented by this message; NULL for outbound correspondence.';
COMMENT ON COLUMN copyright_notice_correspondence_messages.direction IS 'Inbound receipt or outbound legal communication.';
COMMENT ON COLUMN copyright_notice_correspondence_messages.composition_kind IS 'Inbound source, deterministic template, human staff text, or agent-composed text.';
COMMENT ON COLUMN copyright_notice_correspondence_messages.correspondence_kind IS 'Purpose of the legal communication.';
COMMENT ON COLUMN copyright_notice_correspondence_messages.body_ciphertext IS 'Authenticated ciphertext of the private message body.';
COMMENT ON COLUMN copyright_notice_correspondence_messages.drafted_by_id IS 'Staff drafter for human-authored text; NULL for inbound, templates, or agent drafts.';
COMMENT ON COLUMN copyright_notice_correspondence_messages.approved_at IS 'When staff approved agent-composed outbound text.';
COMMENT ON COLUMN copyright_notice_correspondence_messages.approved_by_id IS 'Staff user that approved agent-composed outbound text.';
COMMENT ON COLUMN copyright_notice_correspondence_messages.sent_at IS 'One-way timestamp set after durable delivery intent is recorded.';

COMMENT ON TABLE copyright_notice_evidence_artifacts IS 'Private immutable evidence, including original inbound email MIME and attachments.';
COMMENT ON COLUMN copyright_notice_evidence_artifacts.copyright_notice_submission_id IS 'Submission whose preserved source or attachment this artifact represents.';
COMMENT ON COLUMN copyright_notice_evidence_artifacts.storage_key IS 'Private object-storage key; never included in member projections.';
COMMENT ON COLUMN copyright_notice_evidence_artifacts.sha256 IS 'SHA-256 digest used to verify immutable evidence bytes.';
COMMENT ON COLUMN copyright_notice_evidence_artifacts.mime_type IS 'Untrusted declared or detected media type used only for quarantined processing.';
COMMENT ON COLUMN copyright_notice_evidence_artifacts.byte_size IS 'Preserved artifact byte length for bounds and integrity checks.';

COMMENT ON TABLE copyright_notice_lifecycle_events IS 'Append-only legal workflow audit trail.';
COMMENT ON COLUMN copyright_notice_lifecycle_events.copyright_notice_id IS 'Legal case whose transition or correspondence event was recorded.';
COMMENT ON COLUMN copyright_notice_lifecycle_events.event_type IS 'Versioned legal workflow event name.';
COMMENT ON COLUMN copyright_notice_lifecycle_events.actor_user_id IS 'User or staff actor for the event; NULL for system activity or after account deletion.';
COMMENT ON COLUMN copyright_notice_lifecycle_events.copyright_notice_action_intent_id IS 'Concrete action intent source; its restriction is derived through the required restriction FK.';
COMMENT ON COLUMN copyright_notice_lifecycle_events.copyright_notice_submission_id IS 'Submission whose receipt or review this event records.';
COMMENT ON COLUMN copyright_notice_lifecycle_events.copyright_notice_submission_assessment_id IS 'Assessment that this event records.';
COMMENT ON COLUMN copyright_notice_lifecycle_events.copyright_notice_evidence_artifact_id IS 'Evidence artifact recorded by this event.';
COMMENT ON COLUMN copyright_notice_lifecycle_events.copyright_notice_correspondence_id IS 'Correspondence message this event records.';
COMMENT ON COLUMN copyright_notice_lifecycle_events.copyright_notice_legal_hold_assessment_id IS 'Legal-hold assessment recorded by this event.';
COMMENT ON COLUMN copyright_notice_lifecycle_events.copyright_notice_legal_hold_resolution_id IS 'Legal-hold resolution recorded by this event.';
COMMENT ON COLUMN copyright_notice_lifecycle_events.copyright_notice_deadline_id IS 'Counter-notice deadline started by this event.';
COMMENT ON COLUMN copyright_notice_lifecycle_events.copyright_restriction_id IS 'Restriction imposed or reviewed by this event.';
COMMENT ON COLUMN copyright_notice_lifecycle_events.copyright_notice_email_intake_id IS 'Email intake cited by this event.';
COMMENT ON COLUMN copyright_notice_lifecycle_events.copyright_notice_delivery_intent_id IS 'Delivery intent replayed by this event.';
COMMENT ON COLUMN copyright_notice_lifecycle_events.media_delivery_registry_key IS 'Media delivery registry record replayed by this event.';
COMMENT ON COLUMN copyright_notice_lifecycle_events.review_action IS 'Human review outcome stored on a mandatory-review event.';
COMMENT ON COLUMN copyright_notice_lifecycle_events.review_rationale_ciphertext IS 'Private encrypted human-review rationale; member timelines project only event type and timestamp.';
COMMENT ON COLUMN copyright_notice_lifecycle_events.counter_notice_accepted IS 'Whether the counter-notice review accepted the counter-notice.';
COMMENT ON COLUMN copyright_notice_lifecycle_events.recovery_source IS 'Durable record used to recover an assessed submission.';
COMMENT ON COLUMN copyright_notice_lifecycle_events.replay_reason IS 'Why an operator replayed a failed action or registry record.';

COMMENT ON TABLE copyright_notice_action_intents IS 'Revision-fenced delivery action intent; workers must not apply a stale placement revision.';
COMMENT ON COLUMN copyright_notice_action_intents.copyright_restriction_id IS 'Independent legal restriction this delivery action implements.';
COMMENT ON COLUMN copyright_notice_action_intents.copyright_notice_deadline_id IS 'Counter-notice deadline authorizing a statutory restoration; NULL for withholds and non-statutory restores.';
COMMENT ON COLUMN copyright_notice_action_intents.expected_placement_revision IS 'Revision fence that must still match before delivery state changes.';
COMMENT ON COLUMN copyright_notice_action_intents.action IS 'Requested reversible delivery transition: withhold or restore.';
COMMENT ON COLUMN copyright_notice_action_intents.completed_at IS 'One-way timestamp set only after the fenced delivery transition is durably confirmed.';

-- Current indexes for fresh schema bootstrap.
CREATE INDEX IF NOT EXISTS idx_copyright_notices__received_id
  ON copyright_notices (received_at, id);
