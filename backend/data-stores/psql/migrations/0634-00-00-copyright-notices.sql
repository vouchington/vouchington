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
  placement_key text NOT NULL CHECK (char_length(placement_key) BETWEEN 1 AND 512),
  placement_revision integer NOT NULL CHECK (placement_revision >= 0),
  hosted_use_url text NOT NULL,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (copyright_notice_id, placement_key, placement_revision)
);

CREATE TABLE copyright_notice_target_images (
  copyright_notice_target_id uuid PRIMARY KEY REFERENCES copyright_notice_targets(id) ON DELETE CASCADE,
  image_id uuid NOT NULL REFERENCES images(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE copyright_restrictions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_target_id uuid NOT NULL REFERENCES copyright_notice_targets(id) ON DELETE CASCADE,
  imposed_at timestamptz NOT NULL,
  lifted_at timestamptz,
  imposed_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  lifted_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  human_reviewed_at timestamptz,
  human_review_action text CHECK (human_review_action IN ('confirm', 'modify', 'reverse')),
  human_reviewed_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
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
  copyright_notice_id uuid NOT NULL REFERENCES copyright_notices(id) ON DELETE RESTRICT,
  copyright_notice_submission_id uuid REFERENCES copyright_notice_submissions(id) ON DELETE RESTRICT,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  composition_kind text NOT NULL CHECK (composition_kind IN ('inbound', 'deterministic_template', 'staff', 'agent')),
  correspondence_kind text NOT NULL CHECK (correspondence_kind IN (
    'receipt',
    'request_information',
    'restriction_notice',
    'counter_notice_forwarding',
    'restoration_notice',
    'status_update'
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
  event_type text NOT NULL CHECK (char_length(event_type) BETWEEN 1 AND 100),
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE copyright_notice_action_intents (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_restriction_id uuid NOT NULL REFERENCES copyright_restrictions(id) ON DELETE CASCADE,
  copyright_notice_deadline_id uuid REFERENCES copyright_notice_deadlines(id) ON DELETE RESTRICT,
  expected_placement_revision integer NOT NULL CHECK (expected_placement_revision >= 0),
  action text NOT NULL CHECK (action IN ('withhold', 'restore')),
  completed_at timestamptz,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (copyright_restriction_id, expected_placement_revision, action),
  CHECK (copyright_notice_deadline_id IS NULL OR action = 'restore')
);

CREATE INDEX idx_copyright_notice_targets__placement ON copyright_notice_targets(placement_key, placement_revision);
CREATE INDEX idx_copyright_notice_target_images__image ON copyright_notice_target_images(image_id);
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
COMMENT ON COLUMN copyright_notice_targets.placement_key IS 'Stable opaque key for the specific hosted placement; it is not a polymorphic entity identifier.';
COMMENT ON COLUMN copyright_notice_targets.placement_revision IS 'Placement revision observed when the allegation target was captured.';
COMMENT ON COLUMN copyright_notice_targets.hosted_use_url IS 'Immutable URL snapshot supplied or resolved for the identified hosted use.';

COMMENT ON TABLE copyright_notice_target_images IS 'Typed image subtype for a copyright target; future video support adds a sibling typed relation without a polymorphic foreign key.';
COMMENT ON COLUMN copyright_notice_target_images.copyright_notice_target_id IS 'Copyright target whose hosted media is the referenced image.';
COMMENT ON COLUMN copyright_notice_target_images.image_id IS 'Image asset captured for the exact hosted placement revision.';

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
COMMENT ON COLUMN copyright_notice_lifecycle_events.metadata IS 'Private structured event snapshot; member responses never serialize this object directly.';

COMMENT ON TABLE copyright_notice_action_intents IS 'Revision-fenced delivery action intent; workers must not apply a stale placement revision.';
COMMENT ON COLUMN copyright_notice_action_intents.copyright_restriction_id IS 'Independent legal restriction this delivery action implements.';
COMMENT ON COLUMN copyright_notice_action_intents.copyright_notice_deadline_id IS 'Counter-notice deadline authorizing a statutory restoration; NULL for withholds and non-statutory restores.';
COMMENT ON COLUMN copyright_notice_action_intents.expected_placement_revision IS 'Revision fence that must still match before delivery state changes.';
COMMENT ON COLUMN copyright_notice_action_intents.action IS 'Requested reversible delivery transition: withhold or restore.';
COMMENT ON COLUMN copyright_notice_action_intents.completed_at IS 'One-way timestamp set only after the fenced delivery transition is durably confirmed.';
