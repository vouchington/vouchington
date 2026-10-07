CREATE TYPE copyright_notice_lifecycle_change_types AS ENUM ('notice_received', 'supplement_received', 'appeal_received', 'counter_notice_received',
    'withdrawal_received', 'court_or_ccb_hold_received', 'submission_assessed',
    'appeal_reviewed', 'counter_notice_reviewed', 'evidence_artifact_recorded',
    'outbound_correspondence_created', 'agent_correspondence_approved',
    'email_correspondence_admitted', 'email_correspondence_rejected',
    'provisional_restriction_imposed', 'mandatory_human_review_completed', 'restriction_lifted_by_administrator',
    'legal_hold_assessed', 'legal_hold_resolved', 'counter_notice_deadline_started',
    'restoration_intent_created', 'reversal_restoration_intent_created',
    'copyright_action_replayed', 'delivery_intent_replayed',
    'media_delivery_registry_replayed', 'restoration_unavailable',
    'restriction_lifted_placement_retained', 'restoration_authorized_pending_delivery',
    'placement_withheld', 'placement_restored', 'guest_capability_issued',
    'guest_capability_revoked', 'guest_capability_revoked_by_withdrawal');
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
-- Copyright complaints are a distinct legal aggregate.  This migration records
-- evidence and decisions only; it deliberately enables no media restriction.

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE copyright_notices (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  jurisdiction copyright_jurisdictions NOT NULL CHECK (jurisdiction IN ('us_dmca', 'eu_dsa', 'uk', 'other')),
  legal_basis copyright_notice_legal_bases NOT NULL CHECK (legal_basis = 'copyright'),
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
  -- Composite-foreign-key target: EU/UK territorial rows pin their notice to its jurisdiction.
  CONSTRAINT uq_copyright_notices__id_jurisdiction UNIQUE (id, jurisdiction),
  CHECK (accepted_at IS NULL OR accepted_at >= received_at),
  CHECK (provisional_withholding_at IS NULL OR (accepted_at IS NOT NULL AND provisional_withholding_at >= accepted_at))
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE copyright_notice_targets (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_id uuid NOT NULL REFERENCES copyright_notices(id) ON DELETE CASCADE,
  placement_id uuid NOT NULL REFERENCES retained_image_placement_bindings(placement_id) ON DELETE RESTRICT,
  placement_revision integer NOT NULL CHECK (placement_revision >= 0),
  surface_activation_revision integer CHECK (surface_activation_revision >= 0 AND surface_activation_revision <= placement_revision),
  surface_owner_user_id uuid REFERENCES retained_user_identities(id) ON DELETE RESTRICT,
  hosted_use_url text NOT NULL,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,

  CONSTRAINT uq_copy_noti_targe__notice_id__placement_id__placement_revision UNIQUE (copyright_notice_id, placement_id, placement_revision),
  UNIQUE (id, placement_id),
  UNIQUE (copyright_notice_id, id)
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE copyright_notice_target_images (
  copyright_notice_target_id uuid PRIMARY KEY REFERENCES copyright_notice_targets(id) ON DELETE CASCADE,
  placement_id uuid NOT NULL,
  image_id uuid NOT NULL REFERENCES retained_image_identities(id) ON DELETE RESTRICT,
  binding_family image_binding_families NOT NULL CHECK (binding_family IN ('post', 'surface')),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_copyright_notice_target_images__target__placement FOREIGN KEY (copyright_notice_target_id, placement_id)
    REFERENCES copyright_notice_targets(id, placement_id) ON DELETE RESTRICT,
  CONSTRAINT fk_copyr_notice_target_images__placement__image__binding_family FOREIGN KEY (placement_id, image_id, binding_family)
    REFERENCES retained_image_placement_bindings(placement_id, image_id, binding_family) ON DELETE RESTRICT
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE copyright_restrictions (
  copyright_notice_id uuid NOT NULL,
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  authorizing_assessment_id uuid NOT NULL,
  copyright_notice_target_id uuid NOT NULL,
  imposed_at timestamptz NOT NULL,
  lifted_at timestamptz,
  imposed_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  lifted_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  human_reviewed_at timestamptz,
  human_review_action copyright_restriction_human_review_actions CHECK (human_review_action IN ('confirm', 'modify', 'reverse')),
  human_reviewed_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (lifted_at IS NULL OR lifted_at >= imposed_at),
  CHECK (human_reviewed_at IS NULL OR human_reviewed_at >= imposed_at),
  CHECK (
    (human_reviewed_at IS NULL AND human_review_action IS NULL AND human_reviewed_by_id IS NULL)
    OR
    (human_reviewed_at IS NOT NULL AND human_review_action IS NOT NULL)
  ),
  CONSTRAINT fk_copyright_restrictions__parent_notice
    FOREIGN KEY (copyright_notice_id, copyright_notice_target_id)
    REFERENCES copyright_notice_targets(copyright_notice_id, id) ON DELETE CASCADE,
  UNIQUE (copyright_notice_id, id)
);
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_update_copyright_restrictions_scope
  BEFORE INSERT ON copyright_restrictions FOR EACH ROW
  EXECUTE FUNCTION fn_update_parent_notice_scope('copyright_notice_targets', 'copyright_notice_target_id');
COMMENT ON COLUMN copyright_restrictions.copyright_notice_id IS 'Parent notice scope used by concrete composite foreign keys; populated from the owning parent on insertion.';

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE UNIQUE INDEX idx_copyright_restrictions__one_active_per_target ON copyright_restrictions(copyright_notice_target_id) WHERE lifted_at IS NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE copyright_notice_submissions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_id uuid NOT NULL REFERENCES copyright_notices(id) ON DELETE CASCADE,
  submitted_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  kind copyright_notice_submission_kinds NOT NULL CHECK (kind IN ('notice', 'supplement', 'appeal', 'counter_notice', 'withdrawal', 'court_or_ccb_hold', 'complaint')),
  received_at timestamptz NOT NULL,
  source_kind copyright_notice_submission_source_kinds NOT NULL CHECK (source_kind IN ('signed_in_form', 'guest_form', 'email', 'staff')),
  body_ciphertext text NOT NULL CHECK (char_length(body_ciphertext) BETWEEN 1 AND 1048576),
  copyright_notice_guest_capability_id uuid,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,

  CONSTRAINT copyright_submission_guest_capability_shape CHECK (
    copyright_notice_guest_capability_id IS NULL
    OR (source_kind = 'guest_form' AND kind IN ('supplement', 'withdrawal', 'court_or_ccb_hold'))
  ),
  CONSTRAINT copyright_notice_submissions_id_notice_unique UNIQUE (id, copyright_notice_id)
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE copyright_notice_evidence_artifacts (
  copyright_notice_id uuid NOT NULL,
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_submission_id uuid NOT NULL,
  storage_key text NOT NULL,
  sha256 bytea NOT NULL CHECK (octet_length(sha256) = 32),
  media_type_id bigint NOT NULL REFERENCES media_types(id) ON DELETE RESTRICT,
  byte_size integer NOT NULL CHECK (byte_size >= 0),
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,

  CONSTRAINT uq_copyrig_notice_evidence_artifact__submission_id__storage_key UNIQUE (copyright_notice_submission_id, storage_key),
  CONSTRAINT fk_copyright_artifacts__parent_notice
    FOREIGN KEY (copyright_notice_id, copyright_notice_submission_id)
    REFERENCES copyright_notice_submissions(copyright_notice_id, id) ON DELETE CASCADE,
  UNIQUE (copyright_notice_id, id)
);
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_update_copyright_artifacts_scope
  BEFORE INSERT ON copyright_notice_evidence_artifacts FOR EACH ROW
  EXECUTE FUNCTION fn_update_parent_notice_scope('copyright_notice_submissions', 'copyright_notice_submission_id');
COMMENT ON COLUMN copyright_notice_evidence_artifacts.copyright_notice_id IS 'Parent notice scope used by concrete composite foreign keys; populated from the owning parent on insertion.';

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE copyright_notice_submission_assessments (
  copyright_notice_id uuid NOT NULL,
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_form_screening_id uuid,
  copyright_notice_submission_id uuid NOT NULL,
  supersedes_assessment_id uuid CONSTRAINT uq_copyrigh_notice_submissi_assessmen__supersedes_assessment_id UNIQUE,
  assessed_at timestamptz NOT NULL,
  assessed_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  is_substantially_compliant boolean NOT NULL,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,

  CONSTRAINT fk_copyright_assessments__parent_notice
    FOREIGN KEY (copyright_notice_id, copyright_notice_submission_id)
    REFERENCES copyright_notice_submissions(copyright_notice_id, id) ON DELETE CASCADE,
  CONSTRAINT uq_copyright_notice_submission_assessments__notice_id__id UNIQUE (copyright_notice_id, id),
  CONSTRAINT uq_copyright_notice_submission_assessments__submission_id__id UNIQUE (copyright_notice_submission_id, id),
  CONSTRAINT fk_copyright_assessments__supersedes_submission
    FOREIGN KEY (copyright_notice_submission_id, supersedes_assessment_id)
    REFERENCES copyright_notice_submission_assessments(copyright_notice_submission_id, id) ON DELETE RESTRICT
);
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_update_copyright_assessments_scope
  BEFORE INSERT ON copyright_notice_submission_assessments FOR EACH ROW
  EXECUTE FUNCTION fn_update_parent_notice_scope('copyright_notice_submissions', 'copyright_notice_submission_id');
COMMENT ON COLUMN copyright_notice_submission_assessments.copyright_notice_id IS 'Parent notice scope used by concrete composite foreign keys; populated from the owning parent on insertion.';

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE copyright_notice_counter_notice_assessment_targets (
  copyright_notice_id uuid NOT NULL,
  copyright_notice_submission_assessment_id uuid NOT NULL,
  copyright_notice_target_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (copyright_notice_submission_assessment_id, copyright_notice_target_id),
  CONSTRAINT fk_copyright_counter_targets__parent_notice
    FOREIGN KEY (copyright_notice_id, copyright_notice_submission_assessment_id)
    REFERENCES copyright_notice_submission_assessments(copyright_notice_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_copyright_counter_targets__target_notice
    FOREIGN KEY (copyright_notice_id, copyright_notice_target_id)
    REFERENCES copyright_notice_targets(copyright_notice_id, id) ON DELETE RESTRICT
);
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_update_copyright_counter_targets_scope
  BEFORE INSERT ON copyright_notice_counter_notice_assessment_targets FOR EACH ROW
  EXECUTE FUNCTION fn_update_parent_notice_scope('copyright_notice_submission_assessments', 'copyright_notice_submission_assessment_id');
COMMENT ON COLUMN copyright_notice_counter_notice_assessment_targets.copyright_notice_id IS 'Parent notice scope used by concrete composite foreign keys; populated from the owning parent on insertion.';

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE copyright_notice_legal_hold_assessments (
  copyright_notice_id uuid NOT NULL,
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_submission_id uuid NOT NULL,
  assessed_at timestamptz NOT NULL,
  assessed_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  is_from_original_claimant boolean NOT NULL,
  proceeding_kind copyright_notice_legal_hold_assessment_proceeding_kinds CHECK (proceeding_kind IN ('federal_court', 'ccb')),
  ccb_claim_kind copyright_notice_legal_hold_assessment_ccb_claim_kinds CHECK (ccb_claim_kind IN ('claim', 'counterclaim')),
  commenced_at timestamptz,
  received_by_designated_agent_at timestamptz,
  is_same_material boolean NOT NULL,
  rationale_ciphertext text NOT NULL CONSTRAINT chk_copyright_notice_legal_hold_assessmen__rationale_ciphertext CHECK (char_length(rationale_ciphertext) BETWEEN 1 AND 65536),
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,

  CHECK ((proceeding_kind IS NULL AND commenced_at IS NULL) OR (proceeding_kind IS NOT NULL AND commenced_at IS NOT NULL)),
  CHECK (
    (proceeding_kind = 'ccb' AND ccb_claim_kind IS NOT NULL)
    OR
    (proceeding_kind IS DISTINCT FROM 'ccb' AND ccb_claim_kind IS NULL)
  ),
  CONSTRAINT fk_copyright_hold_assessments__parent_notice
    FOREIGN KEY (copyright_notice_id, copyright_notice_submission_id)
    REFERENCES copyright_notice_submissions(copyright_notice_id, id) ON DELETE CASCADE,
  CONSTRAINT uq_copyright_notice_legal_hold_assessments__notice_id__id UNIQUE (copyright_notice_id, id)
);
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_update_copyright_hold_assessments_scope
  BEFORE INSERT ON copyright_notice_legal_hold_assessments FOR EACH ROW
  EXECUTE FUNCTION fn_update_parent_notice_scope('copyright_notice_submissions', 'copyright_notice_submission_id');
COMMENT ON COLUMN copyright_notice_legal_hold_assessments.copyright_notice_id IS 'Parent notice scope used by concrete composite foreign keys; populated from the owning parent on insertion.';

COMMENT ON COLUMN copyright_notice_legal_hold_assessments.rationale_ciphertext IS 'Encrypted moderator rationale supporting the immutable legal-hold qualification assessment.';

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE copyright_notice_legal_hold_assessment_targets (
  copyright_notice_id uuid NOT NULL,
  copyright_notice_legal_hold_assessment_id uuid NOT NULL,
  copyright_notice_target_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (copyright_notice_legal_hold_assessment_id, copyright_notice_target_id),
  CONSTRAINT fk_copyright_hold_targets__parent_notice
    FOREIGN KEY (copyright_notice_id, copyright_notice_legal_hold_assessment_id)
    REFERENCES copyright_notice_legal_hold_assessments(copyright_notice_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_copyright_hold_targets__target_notice
    FOREIGN KEY (copyright_notice_id, copyright_notice_target_id)
    REFERENCES copyright_notice_targets(copyright_notice_id, id) ON DELETE RESTRICT
);
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_update_copyright_hold_targets_scope
  BEFORE INSERT ON copyright_notice_legal_hold_assessment_targets FOR EACH ROW
  EXECUTE FUNCTION fn_update_parent_notice_scope('copyright_notice_legal_hold_assessments', 'copyright_notice_legal_hold_assessment_id');
COMMENT ON COLUMN copyright_notice_legal_hold_assessment_targets.copyright_notice_id IS 'Parent notice scope used by concrete composite foreign keys; populated from the owning parent on insertion.';

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE copyright_notice_legal_hold_resolutions (
  copyright_notice_id uuid NOT NULL,
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_legal_hold_assessment_id uuid NOT NULL CONSTRAINT uq_copyright_notice_legal_hold_resolutions__assessment_id UNIQUE,
  resolved_at timestamptz NOT NULL,
  resolved_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  resolution_kind copyright_notice_legal_hold_resolution_kinds NOT NULL CHECK (resolution_kind IN ('dismissed', 'proceeding_ended', 'superseded')),
  rationale_ciphertext text NOT NULL CONSTRAINT chk_copyright_notice_legal_hold_resolutio__rationale_ciphertext CHECK (char_length(rationale_ciphertext) BETWEEN 1 AND 65536),
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,

  CONSTRAINT fk_copyright_hold_resolutions__parent_notice
    FOREIGN KEY (copyright_notice_id, copyright_notice_legal_hold_assessment_id)
    REFERENCES copyright_notice_legal_hold_assessments(copyright_notice_id, id) ON DELETE RESTRICT,
  CONSTRAINT uq_copyright_notice_legal_hold_resolutions__notice_id__id UNIQUE (copyright_notice_id, id)
);
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_update_copyright_hold_resolutions_scope
  BEFORE INSERT ON copyright_notice_legal_hold_resolutions FOR EACH ROW
  EXECUTE FUNCTION fn_update_parent_notice_scope('copyright_notice_legal_hold_assessments', 'copyright_notice_legal_hold_assessment_id');
COMMENT ON COLUMN copyright_notice_legal_hold_resolutions.copyright_notice_id IS 'Parent notice scope used by concrete composite foreign keys; populated from the owning parent on insertion.';

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE copyright_notice_deadlines (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_id uuid NOT NULL REFERENCES copyright_notices(id) ON DELETE RESTRICT,
  qualifying_counter_notice_assessment_id uuid NOT NULL CONSTRAINT uq_copyr_notice_deadli__qualifying_counter_notice_assessment_id UNIQUE CONSTRAINT fk_copyrig_notice_deadlin__qualifying_counter_notice_assessment REFERENCES copyright_notice_submission_assessments(id) ON DELETE RESTRICT,
  earliest_restoration_at timestamptz NOT NULL,
  escalation_at timestamptz NOT NULL,
  restoration_deadline_at timestamptz NOT NULL,
  resolved_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (earliest_restoration_at < escalation_at),
  CHECK (escalation_at < restoration_deadline_at),
  CHECK (num_nonnulls(resolved_at, cancelled_at) <= 1),
  UNIQUE (copyright_notice_id, id)
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE copyright_notice_correspondence_messages (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_email_intake_id uuid,
  copyright_notice_id uuid NOT NULL CONSTRAINT fk_copyright_notice_correspondence_messages__notice REFERENCES copyright_notices(id) ON DELETE RESTRICT,
  copyright_notice_submission_id uuid CONSTRAINT fk_copyright_notice_correspondence_messages__submission REFERENCES copyright_notice_submissions(id) ON DELETE RESTRICT,
  direction copyright_notice_correspondence_message_directions NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  composition_kind copyright_notice_correspondence_message_composition_kinds NOT NULL CHECK (composition_kind IN ('inbound', 'deterministic_template', 'staff', 'agent')),
  correspondence_kind copyright_notice_correspondence_kinds NOT NULL CONSTRAINT copyright_correspondence_kind_check CHECK (correspondence_kind IN (
    'receipt',
    'request_information',
    'restriction_notice', 'decision_notice',
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
  ),
  CONSTRAINT copyright_notice_correspondence_id_notice_unique UNIQUE (id, copyright_notice_id)
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE copyright_notice_lifecycle_changes (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_id uuid REFERENCES copyright_notices(id) ON DELETE CASCADE,
  change_type copyright_notice_lifecycle_change_types NOT NULL,
  changed_by_id uuid REFERENCES retained_user_identities (id) ON DELETE RESTRICT,
  copyright_notice_submission_id uuid,
  copyright_notice_submission_assessment_id uuid,
  copyright_notice_evidence_artifact_id uuid,
  copyright_notice_correspondence_id uuid,
  copyright_notice_legal_hold_assessment_id uuid,
  copyright_notice_legal_hold_resolution_id uuid,
  copyright_notice_deadline_id uuid,
  copyright_restriction_id uuid,
  copyright_notice_action_intent_id uuid,
  copyright_notice_email_intake_id uuid,
  copyright_notice_delivery_work_item_id uuid,
  media_delivery_registry_record_delivery_key text,
  copyright_notice_guest_capability_id uuid,
  review_action copyright_review_actions CHECK (review_action IN ('confirm', 'reverse')),
  review_rationale_id uuid CHECK (review_rationale_id IS NULL OR review_rationale_id = id),
  is_counter_notice_accepted boolean,
  recovery_source copyright_notice_lifecycle_change_recovery_sources CHECK (recovery_source IN ('durable_review', 'durable_decision')),
  replay_reason copyright_notice_lifecycle_change_replay_reasons CHECK (replay_reason = 'operator_replay'),
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  CHECK ((review_action IS NULL AND review_rationale_id IS NULL)
    OR (change_type = 'mandatory_human_review_completed' AND review_action IS NOT NULL AND review_rationale_id IS NOT NULL)),
  CHECK (is_counter_notice_accepted IS NULL OR change_type = 'counter_notice_reviewed'),
  CHECK (recovery_source IS NULL OR change_type = 'submission_assessed'),
  CHECK (replay_reason IS NULL OR change_type IN ('copyright_action_replayed', 'media_delivery_registry_replayed')),
  CHECK ((change_type = 'counter_notice_reviewed') = (is_counter_notice_accepted IS NOT NULL)),
  CHECK ((change_type = 'mandatory_human_review_completed') = (review_action IS NOT NULL)),
  CHECK (change_type <> 'media_delivery_registry_replayed' OR replay_reason IS NOT NULL),
  -- A replayed reply to a declined email intake belongs to no case; every other event names one.
  CONSTRAINT copyright_lifecycle_event_notice_scope CHECK (
    copyright_notice_id IS NOT NULL OR change_type = 'delivery_intent_replayed'
  ),
  CONSTRAINT copyright_lifecycle_event_source_shape CHECK (
    num_nonnulls(
      copyright_notice_submission_id, copyright_notice_submission_assessment_id,
      copyright_notice_evidence_artifact_id, copyright_notice_correspondence_id,
      copyright_notice_legal_hold_assessment_id, copyright_notice_legal_hold_resolution_id,
      copyright_notice_deadline_id, copyright_restriction_id, copyright_notice_action_intent_id,
      copyright_notice_email_intake_id, copyright_notice_delivery_work_item_id, media_delivery_registry_record_delivery_key,
      copyright_notice_guest_capability_id
    ) = CASE WHEN change_type = 'notice_received' THEN 0 ELSE 1 END
    AND CASE
      WHEN change_type = 'notice_received' THEN true
      WHEN change_type IN ('supplement_received', 'appeal_received', 'counter_notice_received',
        'withdrawal_received', 'court_or_ccb_hold_received', 'appeal_reviewed', 'counter_notice_reviewed')
        THEN copyright_notice_submission_id IS NOT NULL
      WHEN change_type = 'submission_assessed' THEN copyright_notice_submission_assessment_id IS NOT NULL
      WHEN change_type = 'evidence_artifact_recorded' THEN copyright_notice_evidence_artifact_id IS NOT NULL
      WHEN change_type IN ('outbound_correspondence_created', 'agent_correspondence_approved',
        'email_correspondence_admitted') THEN copyright_notice_correspondence_id IS NOT NULL
      WHEN change_type = 'legal_hold_assessed' THEN copyright_notice_legal_hold_assessment_id IS NOT NULL
      WHEN change_type = 'legal_hold_resolved' THEN copyright_notice_legal_hold_resolution_id IS NOT NULL
      WHEN change_type = 'counter_notice_deadline_started' THEN copyright_notice_deadline_id IS NOT NULL
      WHEN change_type IN ('provisional_restriction_imposed', 'mandatory_human_review_completed',
        'restriction_lifted_by_administrator')
        THEN copyright_restriction_id IS NOT NULL
      WHEN change_type IN ('restoration_intent_created', 'reversal_restoration_intent_created',
        'copyright_action_replayed', 'restoration_unavailable',
        'restriction_lifted_placement_retained', 'restoration_authorized_pending_delivery',
        'placement_withheld', 'placement_restored') THEN copyright_notice_action_intent_id IS NOT NULL
      WHEN change_type = 'email_correspondence_rejected' THEN copyright_notice_email_intake_id IS NOT NULL
      WHEN change_type = 'delivery_intent_replayed' THEN copyright_notice_delivery_work_item_id IS NOT NULL
      WHEN change_type = 'media_delivery_registry_replayed' THEN media_delivery_registry_record_delivery_key IS NOT NULL
      WHEN change_type IN ('guest_capability_issued', 'guest_capability_revoked',
        'guest_capability_revoked_by_withdrawal') THEN copyright_notice_guest_capability_id IS NOT NULL
      ELSE false
    END
  ),
  CONSTRAINT fk_copyright_lifecycle_events__submission_notice
    FOREIGN KEY (copyright_notice_id, copyright_notice_submission_id)
    REFERENCES copyright_notice_submissions(copyright_notice_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_copyright_lifecycle_events__correspondence_notice
    FOREIGN KEY (copyright_notice_id, copyright_notice_correspondence_id)
    REFERENCES copyright_notice_correspondence_messages(copyright_notice_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_copyright_lifecycle_events__deadline_notice
    FOREIGN KEY (copyright_notice_id, copyright_notice_deadline_id)
    REFERENCES copyright_notice_deadlines(copyright_notice_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_copyright_lifecycle_events__assessment_notice
    FOREIGN KEY (copyright_notice_id, copyright_notice_submission_assessment_id)
    REFERENCES copyright_notice_submission_assessments(copyright_notice_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_copyright_lifecycle_events__artifact_notice
    FOREIGN KEY (copyright_notice_id, copyright_notice_evidence_artifact_id)
    REFERENCES copyright_notice_evidence_artifacts(copyright_notice_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_copyright_lifecycle_events__hold_assessment_notice
    FOREIGN KEY (copyright_notice_id, copyright_notice_legal_hold_assessment_id)
    REFERENCES copyright_notice_legal_hold_assessments(copyright_notice_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_copyright_lifecycle_events__hold_resolution_notice
    FOREIGN KEY (copyright_notice_id, copyright_notice_legal_hold_resolution_id)
    REFERENCES copyright_notice_legal_hold_resolutions(copyright_notice_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_copyright_lifecycle_events__restriction_notice
    FOREIGN KEY (copyright_notice_id, copyright_restriction_id)
    REFERENCES copyright_restrictions(copyright_notice_id, id) ON DELETE RESTRICT,
  UNIQUE (copyright_notice_id, id)
);


-- Private ciphertext is erasable; the legal change row and its actor remain immutable.
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE copyright_notice_lifecycle_change_rationales (
  id uuid PRIMARY KEY REFERENCES copyright_notice_lifecycle_changes(id) ON DELETE CASCADE,
  copyright_notice_id uuid NOT NULL,
  review_rationale_ciphertext text NOT NULL CONSTRAINT chk_copyr_notic_lifec_chang_ration__review_rationale_ciphertext CHECK (char_length(review_rationale_ciphertext) BETWEEN 1 AND 65536),
  CONSTRAINT fk_copyright_notice_lifecycle_change_rationales__notice__ FOREIGN KEY (copyright_notice_id, id)
    REFERENCES copyright_notice_lifecycle_changes(copyright_notice_id, id) ON DELETE CASCADE
    DEFERRABLE INITIALLY DEFERRED
);
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_lifecycle_change_rationales__notice ON copyright_notice_lifecycle_change_rationales(copyright_notice_id);
ALTER TABLE copyright_notice_lifecycle_changes
  ADD CONSTRAINT fk_copyright_lifecycle_changes__review_rationale
  FOREIGN KEY (review_rationale_id) REFERENCES copyright_notice_lifecycle_change_rationales(id)
  ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;
ALTER TABLE copyright_notice_lifecycle_changes VALIDATE CONSTRAINT fk_copyright_lifecycle_changes__review_rationale;
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_lifecycle_changes__review_rationale ON copyright_notice_lifecycle_changes(review_rationale_id) WHERE review_rationale_id IS NOT NULL;
COMMENT ON TABLE copyright_notice_lifecycle_change_rationales IS 'Erasable encrypted review rationale beside an immutable legal lifecycle change.';
COMMENT ON COLUMN copyright_notice_lifecycle_change_rationales.id IS 'Owning lifecycle change id; the rationale is a parent-identified companion.';
COMMENT ON COLUMN copyright_notice_lifecycle_change_rationales.copyright_notice_id IS 'Notice scope enforced together with the owning change by a composite foreign key.';
COMMENT ON COLUMN copyright_notice_lifecycle_change_rationales.review_rationale_ciphertext IS 'Private review rationale; only the controlled retention workflow can erase it.';

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE copyright_notice_action_work_items (
  copyright_notice_id uuid NOT NULL,
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  state copyright_notice_action_intent_states GENERATED ALWAYS AS (CASE WHEN completed_at IS NOT NULL THEN completed_at_reason WHEN leased_at IS NOT NULL THEN 'claimed'::copyright_notice_action_intent_states ELSE 'pending'::copyright_notice_action_intent_states END) STORED NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 5),
  generation bigint NOT NULL DEFAULT 1 CHECK (generation >= 1),
  lease_token uuid,
  lease_expires_at timestamptz,
  leased_at timestamptz,
  completed_at_reason copyright_notice_action_intent_states CHECK (completed_at_reason IS NULL OR completed_at_reason IN ('completed', 'stale', 'blocked', 'failed')),
  failure_message text CHECK (failure_message IS NULL OR char_length(failure_message) BETWEEN 1 AND 4096),
  available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  copyright_restriction_id uuid NOT NULL,
  copyright_notice_deadline_id uuid CONSTRAINT fk_copyright_notice_action_work_items__deadline REFERENCES copyright_notice_deadlines(id) ON DELETE RESTRICT,
  expected_placement_revision integer NOT NULL CONSTRAINT chk_copyrigh_notice_action_intents__expected_placement_revision CHECK (expected_placement_revision >= 0),
  action copyright_notice_action_intent_actions NOT NULL CHECK (action IN ('withhold', 'restore')),
  completed_at timestamptz,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((lease_token IS NULL AND leased_at IS NULL AND lease_expires_at IS NULL)
    OR (lease_token IS NOT NULL AND leased_at IS NOT NULL AND lease_expires_at > leased_at)),
  CONSTRAINT uq_copyright_action_work__restriction_revision_action UNIQUE (copyright_restriction_id, expected_placement_revision, action),
  CHECK (copyright_notice_deadline_id IS NULL OR action = 'restore'),
  CHECK ((completed_at IS NULL) = (completed_at_reason IS NULL)),
  CONSTRAINT copyright_action_intents_delivery_state CHECK (
    (state = 'pending' AND completed_at IS NULL AND completed_at_reason IS NULL AND leased_at IS NULL)
    OR (state = 'claimed' AND completed_at IS NULL AND completed_at_reason IS NULL AND leased_at IS NOT NULL)
    OR (state IN ('completed', 'stale', 'blocked', 'failed')
      AND completed_at IS NOT NULL AND completed_at_reason = state )
  ),
  CONSTRAINT fk_copyright_action_intents__parent_notice
    FOREIGN KEY (copyright_notice_id, copyright_restriction_id)
    REFERENCES copyright_restrictions(copyright_notice_id, id) ON DELETE CASCADE,
  UNIQUE (copyright_notice_id, id)
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE copyright_notice_action_attempts (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  work_item_id uuid NOT NULL REFERENCES copyright_notice_action_work_items(id) ON DELETE CASCADE,
  generation bigint NOT NULL CHECK (generation >= 1),
  attempt_number integer NOT NULL CHECK (attempt_number >= 1),
  lease_token uuid NOT NULL,
  started_at timestamptz NOT NULL,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  UNIQUE(work_item_id, attempt_number), UNIQUE(work_item_id, lease_token)
);
CREATE TABLE copyright_notice_action_attempt_results (
  attempt_id uuid PRIMARY KEY REFERENCES copyright_notice_action_attempts(id) ON DELETE CASCADE,
  completed_at timestamptz,
  stale_at timestamptz,
  blocked_at timestamptz, -- moderation-history-guard-allow: immutable action-attempt outcome; restriction state stays in copyright_restrictions.
  failed_at timestamptz,
  abandoned_at timestamptz,
  CHECK (num_nonnulls(completed_at, stale_at, blocked_at, failed_at, abandoned_at) = 1)
);
CREATE TRIGGER trigger_copyright_action_attempts_immutable BEFORE UPDATE OR DELETE ON copyright_notice_action_attempts
FOR EACH ROW EXECUTE FUNCTION fn_reject_mutation();
CREATE TRIGGER trigger_copyright_action_attempt_results_immutable BEFORE UPDATE OR DELETE ON copyright_notice_action_attempt_results
FOR EACH ROW EXECUTE FUNCTION fn_reject_mutation();
COMMENT ON TABLE copyright_notice_action_attempts IS 'Immutable numbered executions across all explicit replay generations; legal work retention owns this history.';
COMMENT ON COLUMN copyright_notice_action_attempts.work_item_id IS 'Concrete copyright delivery work whose execution this records.';
COMMENT ON COLUMN copyright_notice_action_attempts.generation IS 'Replay generation captured before external execution.';
COMMENT ON COLUMN copyright_notice_action_attempts.attempt_number IS 'Monotonically increasing ordinal across retries and replay generations.';
COMMENT ON COLUMN copyright_notice_action_attempts.lease_token IS 'Opaque execution ownership token, not an entity reference.';
COMMENT ON COLUMN copyright_notice_action_attempts.started_at IS 'Database time this execution acquired its lease.';
COMMENT ON TABLE copyright_notice_action_attempt_results IS 'Exactly one immutable terminal result for each claimed execution, including abandonment on takeover.';
COMMENT ON COLUMN copyright_notice_action_attempt_results.attempt_id IS 'Execution finalized by this immutable result.';
COMMENT ON COLUMN copyright_notice_action_attempt_results.completed_at IS 'Database time this execution ended as completed.';
COMMENT ON COLUMN copyright_notice_action_attempt_results.stale_at IS 'Database time this execution ended as stale.';
COMMENT ON COLUMN copyright_notice_action_attempt_results.blocked_at IS 'Database time this execution ended as blocked.';
COMMENT ON COLUMN copyright_notice_action_attempt_results.failed_at IS 'Database time this execution ended as failed.';
COMMENT ON COLUMN copyright_notice_action_attempt_results.abandoned_at IS 'Database time this execution ended as abandoned.';
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE FUNCTION fn_update_copyright_action_work() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.available_at := COALESCE(NEW.available_at, clock_timestamp());
  IF TG_OP = 'UPDATE' AND (OLD.completed_at_reason IN ('blocked', 'failed') AND NEW.completed_at IS NULL) THEN NEW.generation := OLD.generation + 1; END IF;
  IF NEW.completed_at IS NOT NULL OR NEW.leased_at IS NULL THEN
    NEW.lease_token := NULL; NEW.leased_at := NULL; NEW.lease_expires_at := NULL;
  ELSE
    NEW.lease_token := COALESCE(NEW.lease_token, uuidv7());
    NEW.lease_expires_at := COALESCE(NEW.lease_expires_at, NEW.leased_at + interval '5 minutes');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trigger_00_copyright_action_work_lease BEFORE INSERT OR UPDATE ON copyright_notice_action_work_items
FOR EACH ROW EXECUTE FUNCTION fn_update_copyright_action_work();
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE FUNCTION fn_create_copyright_action_attempt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.lease_token IS NOT NULL
    AND OLD.lease_token IS DISTINCT FROM NEW.lease_token THEN
    INSERT INTO copyright_notice_action_attempt_results(attempt_id, completed_at, stale_at, blocked_at, failed_at, abandoned_at)
    SELECT id, CASE WHEN NEW.completed_at_reason = 'completed' THEN clock_timestamp() ELSE NULL END, CASE WHEN NEW.completed_at_reason = 'stale' THEN clock_timestamp() ELSE NULL END, CASE WHEN NEW.completed_at_reason = 'blocked' THEN clock_timestamp() ELSE NULL END, CASE WHEN NEW.completed_at_reason = 'failed' OR (NEW.lease_token IS NULL AND NEW.failure_message IS NOT NULL AND NOT (NEW.completed_at IS NOT NULL)) THEN clock_timestamp() ELSE NULL END, CASE WHEN (NEW.completed_at_reason = 'completed' OR NEW.completed_at_reason = 'stale' OR NEW.completed_at_reason = 'blocked' OR NEW.completed_at_reason = 'failed' OR NEW.lease_token IS NULL AND NEW.failure_message IS NOT NULL) IS NOT TRUE THEN clock_timestamp() ELSE NULL END
    FROM copyright_notice_action_attempts WHERE work_item_id = OLD.id AND lease_token = OLD.lease_token
    ON CONFLICT (attempt_id) DO NOTHING;
  END IF;
  IF NEW.lease_token IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.lease_token IS DISTINCT FROM OLD.lease_token) THEN
    INSERT INTO copyright_notice_action_attempts(work_item_id, generation, attempt_number, lease_token, started_at)
      SELECT NEW.id, NEW.generation, COALESCE(MAX(attempt_number), 0) + 1, NEW.lease_token, NEW.leased_at
      FROM copyright_notice_action_attempts WHERE work_item_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trigger_copyright_action_work_attempt AFTER INSERT OR UPDATE ON copyright_notice_action_work_items
FOR EACH ROW EXECUTE FUNCTION fn_create_copyright_action_attempt();
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_action_work_items__available ON copyright_notice_action_work_items(available_at, id) WHERE lease_token IS NULL AND state = 'pending';
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_action_work_items__expired ON copyright_notice_action_work_items(lease_expires_at, id) WHERE lease_token IS NOT NULL;
COMMENT ON COLUMN copyright_notice_action_work_items.generation IS 'Explicit replay cycle; clearing failed or blocked current-cycle outcomes increments it while execution history remains immutable.';
COMMENT ON COLUMN copyright_notice_action_work_items.lease_expires_at IS 'Current worker ownership deadline; every owner mutation checks it.';

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_update_copyright_action_intents_scope
  BEFORE INSERT ON copyright_notice_action_work_items FOR EACH ROW
  EXECUTE FUNCTION fn_update_parent_notice_scope('copyright_restrictions', 'copyright_restriction_id');
COMMENT ON COLUMN copyright_notice_action_work_items.copyright_notice_id IS 'Parent notice scope used by concrete composite foreign keys; populated from the owning parent on insertion.';

ALTER TABLE copyright_notice_lifecycle_changes
  ADD CONSTRAINT copyright_lifecycle_event_action_intent_fk
  FOREIGN KEY (copyright_notice_id, copyright_notice_action_intent_id)
  REFERENCES copyright_notice_action_work_items(copyright_notice_id, id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE copyright_notice_lifecycle_changes
  VALIDATE CONSTRAINT copyright_lifecycle_event_action_intent_fk;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE FUNCTION fn_reject_copyright_lifecycle_event_source_notice()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN

  -- A NULL notice pairs only with an email-intake reply, which is the one intent with no notice.
  IF NEW.copyright_notice_delivery_work_item_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM copyright_notice_delivery_work_items source
    WHERE source.id = NEW.copyright_notice_delivery_work_item_id
      AND source.copyright_notice_id IS NOT DISTINCT FROM NEW.copyright_notice_id
  ) THEN RAISE EXCEPTION 'lifecycle delivery intent belongs to another notice' USING ERRCODE = 'check_violation'; END IF;

  IF NEW.media_delivery_registry_record_delivery_key IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM media_delivery_registry_records source
    JOIN copyright_notice_targets target ON target.placement_id = source.placement_id
    WHERE source.delivery_key = NEW.media_delivery_registry_record_delivery_key
      AND target.copyright_notice_id = NEW.copyright_notice_id
  ) THEN RAISE EXCEPTION 'lifecycle media delivery record belongs to another notice' USING ERRCODE = 'check_violation'; END IF;
  RETURN NEW;
END;
$$;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_guard_copyright_lifecycle_event_source_notice
BEFORE INSERT ON copyright_notice_lifecycle_changes
FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_lifecycle_event_source_notice();

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_targets__placement ON copyright_notice_targets(placement_id, placement_revision);
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_targets__surface_owner_user ON copyright_notice_targets(surface_owner_user_id)
  WHERE surface_owner_user_id IS NOT NULL;
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_target_images__image ON copyright_notice_target_images(image_id);
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_target_images__binding ON copyright_notice_target_images(placement_id, image_id, binding_family);
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_restrictions__target ON copyright_restrictions(copyright_notice_target_id);
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_restrictions__human_reviewer ON copyright_restrictions(human_reviewed_by_id) WHERE human_reviewed_by_id IS NOT NULL;
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_submissions__notice_received ON copyright_notice_submissions(copyright_notice_id, received_at, id);
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_submissions__submitted_by ON copyright_notice_submissions(submitted_by_id) WHERE submitted_by_id IS NOT NULL;
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_submissions__guest_capability ON copyright_notice_submissions(copyright_notice_guest_capability_id, copyright_notice_id) WHERE copyright_notice_guest_capability_id IS NOT NULL;
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE UNIQUE INDEX idx_copyright_notice_submissions__one_guest_court_hold ON copyright_notice_submissions(copyright_notice_guest_capability_id) WHERE kind = 'court_or_ccb_hold' AND copyright_notice_guest_capability_id IS NOT NULL;
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_submission_assessments__submission ON copyright_notice_submission_assessments(copyright_notice_submission_id, id DESC);
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_submission_assessments__assessed_by ON copyright_notice_submission_assessments(assessed_by_id) WHERE assessed_by_id IS NOT NULL;
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_counter_notice_assessment_targets__target ON copyright_notice_counter_notice_assessment_targets(copyright_notice_target_id, copyright_notice_submission_assessment_id);
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_counter_notice_assessment_targets__notice ON copyright_notice_counter_notice_assessment_targets(copyright_notice_id);
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_legal_hold_assessments__submission ON copyright_notice_legal_hold_assessments(copyright_notice_submission_id, id DESC);
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_legal_hold_assessments__assessed_by ON copyright_notice_legal_hold_assessments(assessed_by_id, id DESC);
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_legal_hold_assessment_targets__target ON copyright_notice_legal_hold_assessment_targets(copyright_notice_target_id, copyright_notice_legal_hold_assessment_id);
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_legal_hold_assessment_targets__notice ON copyright_notice_legal_hold_assessment_targets(copyright_notice_id);
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_legal_hold_resolutions__resolved_by ON copyright_notice_legal_hold_resolutions(resolved_by_id, id DESC);
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_deadlines__notice ON copyright_notice_deadlines(copyright_notice_id, id DESC);
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_deadlines__pending ON copyright_notice_deadlines(escalation_at, id) WHERE resolved_at IS NULL AND cancelled_at IS NULL;
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_correspondence_messages__notice ON copyright_notice_correspondence_messages(copyright_notice_id, id);
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_correspondence_messages__submission ON copyright_notice_correspondence_messages(copyright_notice_submission_id) WHERE copyright_notice_submission_id IS NOT NULL;
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_correspondence_messages__drafted_by ON copyright_notice_correspondence_messages(drafted_by_id) WHERE drafted_by_id IS NOT NULL;
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_correspondence_messages__approved_by ON copyright_notice_correspondence_messages(approved_by_id) WHERE approved_by_id IS NOT NULL;
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_lifecycle_changes__notice ON copyright_notice_lifecycle_changes(copyright_notice_id, id DESC);
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_lifecycle_changes__submission ON copyright_notice_lifecycle_changes(copyright_notice_submission_id) WHERE copyright_notice_submission_id IS NOT NULL;
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_lifecycle_changes__assessment ON copyright_notice_lifecycle_changes(copyright_notice_submission_assessment_id) WHERE copyright_notice_submission_assessment_id IS NOT NULL;
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_lifecycle_changes__artifact ON copyright_notice_lifecycle_changes(copyright_notice_evidence_artifact_id) WHERE copyright_notice_evidence_artifact_id IS NOT NULL;
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_lifecycle_changes__correspondence ON copyright_notice_lifecycle_changes(copyright_notice_correspondence_id) WHERE copyright_notice_correspondence_id IS NOT NULL;
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_lifecycle_changes__hold_assessment ON copyright_notice_lifecycle_changes(copyright_notice_legal_hold_assessment_id) WHERE copyright_notice_legal_hold_assessment_id IS NOT NULL;
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_lifecycle_changes__hold_resolution ON copyright_notice_lifecycle_changes(copyright_notice_legal_hold_resolution_id) WHERE copyright_notice_legal_hold_resolution_id IS NOT NULL;
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_lifecycle_changes__deadline ON copyright_notice_lifecycle_changes(copyright_notice_deadline_id) WHERE copyright_notice_deadline_id IS NOT NULL;
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_lifecycle_changes__restriction ON copyright_notice_lifecycle_changes(copyright_restriction_id) WHERE copyright_restriction_id IS NOT NULL;
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_lifecycle_changes__action_intent ON copyright_notice_lifecycle_changes(copyright_notice_action_intent_id) WHERE copyright_notice_action_intent_id IS NOT NULL;
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_lifecycle_changes__email_intake ON copyright_notice_lifecycle_changes(copyright_notice_email_intake_id) WHERE copyright_notice_email_intake_id IS NOT NULL;
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_lifecycle_changes__delivery_intent ON copyright_notice_lifecycle_changes(copyright_notice_delivery_work_item_id) WHERE copyright_notice_delivery_work_item_id IS NOT NULL;
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_lifecycle_changes__media_registry ON copyright_notice_lifecycle_changes(media_delivery_registry_record_delivery_key) WHERE media_delivery_registry_record_delivery_key IS NOT NULL;
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_lifecycle_changes__guest_capability ON copyright_notice_lifecycle_changes(copyright_notice_guest_capability_id, copyright_notice_id) WHERE copyright_notice_guest_capability_id IS NOT NULL;
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_action_work_items__pending ON copyright_notice_action_work_items(id) WHERE completed_at IS NULL;
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_action_work_items__deadline ON copyright_notice_action_work_items(copyright_notice_deadline_id) WHERE copyright_notice_deadline_id IS NOT NULL;
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notices__claimant_user ON copyright_notices(claimant_user_id) WHERE claimant_user_id IS NOT NULL;
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_restrictions__imposed_by ON copyright_restrictions(imposed_by_id) WHERE imposed_by_id IS NOT NULL;
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_restrictions__lifted_by ON copyright_restrictions(lifted_by_id) WHERE lifted_by_id IS NOT NULL;
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_lifecycle_changes__actor ON copyright_notice_lifecycle_changes(changed_by_id) WHERE changed_by_id IS NOT NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE FUNCTION fn_reject_copyright_notice_immutable_evidence()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND current_setting('app.copyright_retention_erasure', true) = 'on' THEN
    IF fn_copyright_retention_erasure_permitted(TG_TABLE_NAME, to_jsonb(OLD), to_jsonb(NEW)) THEN RETURN NEW; END IF;
  END IF;
  RAISE EXCEPTION 'copyright legal receipt and evidence records are immutable' USING ERRCODE = 'check_violation';
END;
$$;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE FUNCTION fn_reject_copyright_immutable_with_actor_erasure()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  actor_column text;
  old_actor jsonb;
  new_actor jsonb;
BEGIN
  IF TG_OP = 'UPDATE' AND current_setting('app.copyright_retention_erasure', true) = 'on' THEN
    IF fn_copyright_retention_erasure_permitted(TG_TABLE_NAME, to_jsonb(OLD), to_jsonb(NEW)) THEN RETURN NEW; END IF;
  END IF;
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

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE FUNCTION fn_reject_copyright_human_actor()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF to_jsonb(NEW) ->> TG_ARGV[0] IS NULL THEN
    RAISE EXCEPTION 'copyright human decisions require an identified actor' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE FUNCTION fn_reject_copyright_assessment_source()
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

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE FUNCTION fn_reject_copyright_counter_notice_assessment_target_scope()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM copyright_notice_submission_assessments assessment
    JOIN copyright_notice_submissions submission
      ON submission.id = assessment.copyright_notice_submission_id
    WHERE assessment.id = NEW.copyright_notice_submission_assessment_id
      AND submission.kind = 'counter_notice'
  ) THEN
    RAISE EXCEPTION 'counter-notice assessments may cover only targets in the same case' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE FUNCTION fn_reject_copyright_notice_submission()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND current_setting('app.copyright_retention_erasure', true) = 'on' THEN
    IF fn_copyright_retention_erasure_permitted(TG_TABLE_NAME, to_jsonb(OLD), to_jsonb(NEW)) THEN RETURN NEW; END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'copyright legal receipt records are retained' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.submitted_by_id IS NOT NULL
    AND NEW.submitted_by_id IS NULL
    AND ROW(
      OLD.id,
      OLD.copyright_notice_id,
      OLD.kind,
      OLD.received_at,
      OLD.source_kind,
      OLD.body_ciphertext,
      OLD.copyright_notice_guest_capability_id,
      OLD.created_at
    ) IS NOT DISTINCT FROM ROW(
      NEW.id,
      NEW.copyright_notice_id,
      NEW.kind,
      NEW.received_at,
      NEW.source_kind,
      NEW.body_ciphertext,
      NEW.copyright_notice_guest_capability_id,
      NEW.created_at
    ) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'copyright legal receipt records are immutable' USING ERRCODE = 'check_violation';
END;
$$;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_copyright_notice_submissions_immutable BEFORE UPDATE OR DELETE ON copyright_notice_submissions FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_notice_submission();
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_copyright_notice_evidence_immutable BEFORE UPDATE OR DELETE ON copyright_notice_evidence_artifacts FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_notice_immutable_evidence();
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_copyright_notice_assessments_immutable BEFORE UPDATE OR DELETE ON copyright_notice_submission_assessments FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_immutable_with_actor_erasure('assessed_by_id');

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_copyright_notice_assessments_source BEFORE INSERT ON copyright_notice_submission_assessments FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_assessment_source();
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_copyright_notice_counter_assessment_targets_immutable BEFORE UPDATE OR DELETE ON copyright_notice_counter_notice_assessment_targets FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_notice_immutable_evidence();
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_copyright_notice_counter_assessment_targets_scope BEFORE INSERT ON copyright_notice_counter_notice_assessment_targets FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_counter_notice_assessment_target_scope();
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_copyright_notice_hold_assessments_immutable BEFORE UPDATE OR DELETE ON copyright_notice_legal_hold_assessments FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_immutable_with_actor_erasure('assessed_by_id');
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_copyright_notice_hold_assessments_require_actor BEFORE INSERT ON copyright_notice_legal_hold_assessments FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_human_actor('assessed_by_id');
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_copyright_notice_hold_targets_immutable BEFORE UPDATE OR DELETE ON copyright_notice_legal_hold_assessment_targets FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_notice_immutable_evidence();

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_copyright_notice_hold_resolutions_immutable BEFORE UPDATE OR DELETE ON copyright_notice_legal_hold_resolutions FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_immutable_with_actor_erasure('resolved_by_id');
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_copyright_notice_hold_resolutions_require_actor BEFORE INSERT ON copyright_notice_legal_hold_resolutions FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_human_actor('resolved_by_id');
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_copyright_notice_events_immutable BEFORE UPDATE OR DELETE ON copyright_notice_lifecycle_changes FOR EACH ROW EXECUTE FUNCTION fn_reject_mutation();

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE FUNCTION fn_reject_copyright_notice_identity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND current_setting('app.copyright_retention_erasure', true) = 'on' THEN
    IF fn_copyright_retention_erasure_permitted(TG_TABLE_NAME, to_jsonb(OLD), to_jsonb(NEW)) THEN RETURN NEW; END IF;
  END IF;
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

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_copyright_notices_identity_immutable BEFORE UPDATE OR DELETE ON copyright_notices FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_notice_identity();
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_copyright_notice_targets_immutable BEFORE UPDATE OR DELETE ON copyright_notice_targets FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_notice_immutable_evidence();
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_copyright_notice_target_images_immutable BEFORE UPDATE OR DELETE ON copyright_notice_target_images FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_notice_immutable_evidence();

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE FUNCTION fn_reject_copyright_notice_lifecycle()
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

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_copyright_notices_lifecycle_guard BEFORE UPDATE ON copyright_notices FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_notice_lifecycle();
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_copyright_notices_updated_at BEFORE UPDATE ON copyright_notices FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE FUNCTION fn_reject_copyright_restriction_lifecycle()
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

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_copyright_restrictions_lifecycle_guard BEFORE UPDATE OR DELETE ON copyright_restrictions FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_restriction_lifecycle();
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_copyright_restrictions_updated_at BEFORE UPDATE ON copyright_restrictions FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE FUNCTION fn_reject_copyright_action_intent()
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

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_copyright_action_intents_guard BEFORE UPDATE OR DELETE ON copyright_notice_action_work_items FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_action_intent();
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_copyright_action_intents_updated_at BEFORE UPDATE ON copyright_notice_action_work_items FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE FUNCTION fn_reject_copyright_deadline()
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

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_copyright_deadlines_guard BEFORE UPDATE OR DELETE ON copyright_notice_deadlines FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_deadline();
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_copyright_deadlines_updated_at BEFORE UPDATE ON copyright_notice_deadlines FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE FUNCTION fn_reject_copyright_correspondence()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND current_setting('app.copyright_retention_erasure', true) = 'on' THEN
    IF fn_copyright_retention_erasure_permitted(TG_TABLE_NAME, to_jsonb(OLD), to_jsonb(NEW)) THEN RETURN NEW; END IF;
  END IF;
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

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_copyright_correspondence_guard BEFORE UPDATE OR DELETE ON copyright_notice_correspondence_messages FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_correspondence();
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
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
COMMENT ON COLUMN copyright_notice_targets.placement_id IS 'Concrete retained image placement identity for the exact hosted use; retention never grants live delivery authority.';
COMMENT ON COLUMN copyright_notice_targets.placement_revision IS 'Placement revision observed when the allegation target was captured.';
COMMENT ON COLUMN copyright_notice_targets.surface_activation_revision IS 'Captured activation epoch of a surface placement. An application activation row exists only when the binder was known; trigger-only reactivation leaves it unknown.';
COMMENT ON COLUMN copyright_notice_targets.surface_owner_user_id IS 'Retained profile account identity captured at filing for legal holds after account or link erasure; never grants live response authority.';
COMMENT ON COLUMN copyright_notice_targets.hosted_use_url IS 'Immutable URL snapshot supplied or resolved for the identified hosted use.';

COMMENT ON TABLE copyright_notice_target_images IS 'Typed image subtype for a copyright target; future video support adds a sibling typed relation without a polymorphic foreign key.';
COMMENT ON COLUMN copyright_notice_target_images.copyright_notice_target_id IS 'Copyright target whose hosted media is the referenced image.';
COMMENT ON COLUMN copyright_notice_target_images.placement_id IS 'Retained placement identity shared with the parent target so the image binding matches that exact hosted use.';
COMMENT ON COLUMN copyright_notice_target_images.image_id IS 'Image asset captured for the exact hosted placement revision.';
COMMENT ON COLUMN copyright_notice_target_images.binding_family IS 'Retained post or surface placement binding family for this image.';

COMMENT ON TABLE copyright_restrictions IS 'Independent, reversible legal restrictions; lifting one restriction never lifts another active restriction.';
COMMENT ON COLUMN copyright_restrictions.copyright_notice_target_id IS 'Exact allegation target governed by this independent restriction.';
COMMENT ON COLUMN copyright_restrictions.imposed_at IS 'When the independent restriction became active.';
COMMENT ON COLUMN copyright_restrictions.lifted_at IS 'One-way timestamp recording when this restriction was lifted.';
COMMENT ON COLUMN copyright_restrictions.imposed_by_id IS 'Staff actor that imposed the restriction, or NULL for an authorized automatic provisional action.';
COMMENT ON COLUMN copyright_restrictions.lifted_by_id IS 'Staff actor that lifted the restriction; NULL denotes an authorized system restoration.';
COMMENT ON COLUMN copyright_restrictions.human_reviewed_at IS 'When staff completed the mandatory review of this exact provisional restriction.';
COMMENT ON COLUMN copyright_restrictions.human_review_action IS 'Human outcome for this restriction: confirm, modify or reverse.';
COMMENT ON COLUMN copyright_restrictions.human_reviewed_by_id IS 'Staff reviewer; may become NULL only when the reviewer account is erased.';

COMMENT ON TABLE copyright_notice_submissions IS 'Immutable receipt provenance. Statutory timing always starts from the assessed submission received_at, never parser or approval time.';
COMMENT ON COLUMN copyright_notice_submissions.copyright_notice_id IS 'Legal case to which this immutable inbound submission belongs.';
COMMENT ON COLUMN copyright_notice_submissions.submitted_by_id IS 'Authenticated submitting account for a form, appeal, or counter-notice; NULL for email/guest sources or after account deletion.';
COMMENT ON COLUMN copyright_notice_submissions.kind IS 'Submission role: allegation, supplement, ordinary appeal, statutory counter-notice, withdrawal, or proceeding notice.';
COMMENT ON COLUMN copyright_notice_submissions.received_at IS 'Immutable provider or form receipt timestamp for this exact submission.';
COMMENT ON COLUMN copyright_notice_submissions.source_kind IS 'Authenticated form, guest form, email, or staff-recorded source channel.';
COMMENT ON COLUMN copyright_notice_submissions.body_ciphertext IS 'Authenticated ciphertext of the private structured submission or preserved message body.';
COMMENT ON COLUMN copyright_notice_submissions.copyright_notice_guest_capability_id IS 'Guest capability that filed this in-case guest submission; NULL for every other source. One court or CCB hold per capability.';

COMMENT ON TABLE copyright_notice_submission_assessments IS 'Append-only compliance assessment. A compliant counter-notice uses its referenced immutable submission received_at as the statutory clock origin.';
COMMENT ON COLUMN copyright_notice_submission_assessments.copyright_notice_submission_id IS 'Immutable submission evaluated by this assessment.';
COMMENT ON COLUMN copyright_notice_submission_assessments.supersedes_assessment_id IS 'Prior assessment corrected by this append-only assessment; NULL for the first assessment.';
COMMENT ON COLUMN copyright_notice_submission_assessments.assessed_at IS 'When deterministic validation or a moderator recorded this assessment.';
COMMENT ON COLUMN copyright_notice_submission_assessments.assessed_by_id IS 'Staff assessor; NULL denotes deterministic validation.';
COMMENT ON COLUMN copyright_notice_submission_assessments.is_substantially_compliant IS 'Whether this exact submission contains the required elements for its legal procedure.';

COMMENT ON TABLE copyright_notice_counter_notice_assessment_targets IS 'Exact hosted targets covered by a substantially compliant statutory counter-notice assessment.';
COMMENT ON COLUMN copyright_notice_counter_notice_assessment_targets.copyright_notice_submission_assessment_id IS 'Counter-notice compliance assessment whose scope is recorded.';
COMMENT ON COLUMN copyright_notice_counter_notice_assessment_targets.copyright_notice_target_id IS 'Exact hosted target the counter-notice asks to restore.';

COMMENT ON TABLE copyright_notice_legal_hold_assessments IS 'Append-only staff assessment of whether a received court or CCB filing qualifies to block restoration under 17 USC 512(g) or 1507(d).';
COMMENT ON COLUMN copyright_notice_legal_hold_assessments.copyright_notice_submission_id IS 'Immutable court or CCB submission evaluated by this assessment.';
COMMENT ON COLUMN copyright_notice_legal_hold_assessments.assessed_at IS 'When staff completed the legal-hold qualification assessment.';
COMMENT ON COLUMN copyright_notice_legal_hold_assessments.assessed_by_id IS 'Staff user responsible for the legal-hold assessment.';
COMMENT ON COLUMN copyright_notice_legal_hold_assessments.is_from_original_claimant IS 'Whether the filing came from the claimant that sent the original allegation.';
COMMENT ON COLUMN copyright_notice_legal_hold_assessments.proceeding_kind IS 'Commenced federal-court action or qualifying CCB 17 USC 1507(d) proceeding; NULL for a threat or unsupported filing.';
COMMENT ON COLUMN copyright_notice_legal_hold_assessments.ccb_claim_kind IS 'CCB claim or counterclaim category required by 17 USC 1507(d); NULL for non-CCB submissions.';
COMMENT ON COLUMN copyright_notice_legal_hold_assessments.commenced_at IS 'When the qualifying proceeding was commenced, not when it was merely threatened.';
COMMENT ON COLUMN copyright_notice_legal_hold_assessments.received_by_designated_agent_at IS 'When the designated agent received proof of the commenced proceeding; NULL when delivered elsewhere or not proven.';
COMMENT ON COLUMN copyright_notice_legal_hold_assessments.is_same_material IS 'Whether the proceeding identifies the same hosted material governed by the proposed restoration.';

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
COMMENT ON COLUMN copyright_notice_evidence_artifacts.media_type_id IS 'Untrusted declared or detected media type used only for quarantined processing.';
COMMENT ON COLUMN copyright_notice_evidence_artifacts.byte_size IS 'Preserved artifact byte length for bounds and integrity checks.';

COMMENT ON TABLE copyright_notice_lifecycle_changes IS 'Append-only legal workflow audit trail.';
COMMENT ON COLUMN copyright_notice_lifecycle_changes.copyright_notice_id IS 'Legal case whose transition or correspondence event was recorded; NULL only for a replayed email-intake reply, which belongs to no case.';
COMMENT ON COLUMN copyright_notice_lifecycle_changes.change_type IS 'Versioned legal workflow event name.';
COMMENT ON COLUMN copyright_notice_lifecycle_changes.changed_by_id IS 'User or staff actor for the event; NULL for system activity or after account deletion.';
COMMENT ON COLUMN copyright_notice_lifecycle_changes.copyright_notice_action_intent_id IS 'Concrete action intent source; its restriction is derived through the required restriction FK.';
COMMENT ON COLUMN copyright_notice_lifecycle_changes.copyright_notice_submission_id IS 'Submission whose receipt or review this event records.';
COMMENT ON COLUMN copyright_notice_lifecycle_changes.copyright_notice_submission_assessment_id IS 'Assessment that this event records.';
COMMENT ON COLUMN copyright_notice_lifecycle_changes.copyright_notice_evidence_artifact_id IS 'Evidence artifact recorded by this event.';
COMMENT ON COLUMN copyright_notice_lifecycle_changes.copyright_notice_correspondence_id IS 'Correspondence message this event records.';
COMMENT ON COLUMN copyright_notice_lifecycle_changes.copyright_notice_legal_hold_assessment_id IS 'Legal-hold assessment recorded by this event.';
COMMENT ON COLUMN copyright_notice_lifecycle_changes.copyright_notice_legal_hold_resolution_id IS 'Legal-hold resolution recorded by this event.';
COMMENT ON COLUMN copyright_notice_lifecycle_changes.copyright_notice_deadline_id IS 'Counter-notice deadline started by this event.';
COMMENT ON COLUMN copyright_notice_lifecycle_changes.copyright_restriction_id IS 'Restriction imposed or reviewed by this event.';
COMMENT ON COLUMN copyright_notice_lifecycle_changes.copyright_notice_email_intake_id IS 'Email intake cited by this event.';
COMMENT ON COLUMN copyright_notice_lifecycle_changes.copyright_notice_delivery_work_item_id IS 'Delivery intent replayed by this event; a reply to a declined email intake is replayed with no case, and its intake is the intent''s own.';
COMMENT ON COLUMN copyright_notice_lifecycle_changes.media_delivery_registry_record_delivery_key IS 'Media delivery registry record replayed by this event.';
COMMENT ON COLUMN copyright_notice_lifecycle_changes.copyright_notice_guest_capability_id IS 'Guest capability issued or revoked by this event; the actor is NULL when a withdrawal revoked it.';
COMMENT ON COLUMN copyright_notice_lifecycle_changes.review_action IS 'Human review outcome stored on a mandatory-review event.';
COMMENT ON COLUMN copyright_notice_lifecycle_changes.review_rationale_id IS 'Required parent-identified encrypted rationale companion for mandatory human review; member timelines expose no ciphertext.';
COMMENT ON COLUMN copyright_notice_lifecycle_changes.is_counter_notice_accepted IS 'Whether the counter-notice review accepted the counter-notice.';
COMMENT ON COLUMN copyright_notice_lifecycle_changes.recovery_source IS 'Durable record used to recover an assessed submission.';
COMMENT ON COLUMN copyright_notice_lifecycle_changes.replay_reason IS 'Why an operator replayed a failed action or registry record.';

COMMENT ON TABLE copyright_notice_action_work_items IS 'Revision-fenced delivery action intent; workers must not apply a stale placement revision.';
COMMENT ON COLUMN copyright_notice_action_work_items.copyright_restriction_id IS 'Independent legal restriction this delivery action implements.';
COMMENT ON COLUMN copyright_notice_action_work_items.copyright_notice_deadline_id IS 'Counter-notice deadline authorizing a statutory restoration; NULL for withholds and non-statutory restores.';
COMMENT ON COLUMN copyright_notice_action_work_items.expected_placement_revision IS 'Revision fence that must still match before delivery state changes.';
COMMENT ON COLUMN copyright_notice_action_work_items.action IS 'Requested reversible delivery transition: withhold or restore.';
COMMENT ON COLUMN copyright_notice_action_work_items.completed_at IS 'One-way timestamp set only after the fenced delivery transition is durably confirmed.';

-- Current indexes for fresh schema bootstrap.
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_copyright_notices__received_id
  ON copyright_notices (received_at, id);

COMMENT ON COLUMN copyright_notice_action_work_items.lease_token IS 'Opaque worker ownership token rotated on each claim or reclaim; completion and failure compare it for equality. It identifies no durable row.';

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_ensure_copyright_notice_lifecycle_changes_actor BEFORE INSERT ON copyright_notice_lifecycle_changes FOR EACH ROW EXECUTE FUNCTION fn_ensure_retained_actor_identity('changed_by_id');

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_copyright_lifecycle_change_rationales_immutable BEFORE UPDATE OR DELETE ON copyright_notice_lifecycle_change_rationales FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_notice_immutable_evidence();

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_evidence_artifacts__media_type_id ON copyright_notice_evidence_artifacts (media_type_id);
