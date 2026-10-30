-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
-- EU and UK copyright contracts. EU (DSA) and UK share one set of territorial tables keyed by a
-- jurisdiction column, and a composite foreign key keeps every child row on a notice of its own
-- jurisdiction. Only the EU supervised complaint and transparency report tables stay EU-only. These
-- tables store receipt, routing, decision, redress, escalation, and reporting facts. They do not
-- store US restoration clocks, placement keys, or lifecycle metadata. No policy row is seeded: the
-- contracts stay unavailable until a separate approval exists.

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS copyright_jurisdiction_policy_approvals (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  jurisdiction copyright_jurisdictions NOT NULL,
  policy_version text NOT NULL,
  approved_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_by_id uuid,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,

  CONSTRAINT uq_copyright_jurisdiction_policy_approvals__version UNIQUE (jurisdiction, policy_version),
  CONSTRAINT uq_copyright_jurisdiction_policy_approvals__id_jurisdiction UNIQUE (id, jurisdiction),
  CONSTRAINT chk_copyright_jurisdiction_policy_approvals__jurisdiction CHECK (jurisdiction IN ('eu_dsa', 'uk')),
  CONSTRAINT chk_copyright_jurisdiction_policy_approvals__version CHECK (
    policy_version ~ '^[a-z0-9][a-z0-9._-]{0,63}$'
  )
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS copyright_jurisdiction_policy_withdrawals (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_jurisdiction_policy_approval_id uuid NOT NULL CONSTRAINT uq_copyright_jurisdiction_policy_withdrawals__approval_id UNIQUE
    CONSTRAINT fk_copyright_jurisdiction_policy_withdrawals__approval REFERENCES copyright_jurisdiction_policy_approvals (id) ON DELETE RESTRICT,
  withdrawn_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  withdrawn_by_id uuid,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS copyright_territorial_notice_receipts (
  transparency_generation bigint NOT NULL DEFAULT 0 CHECK (transparency_generation >= 0),
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_id uuid NOT NULL,
  jurisdiction copyright_jurisdictions NOT NULL,
  copyright_jurisdiction_policy_approval_id uuid NOT NULL,
  requester_user_id uuid,
  requester_identity_hmac bytea NOT NULL,
  idempotency_key text NOT NULL,
  request_sha256 bytea NOT NULL,
  hosted_use_url text NOT NULL,
  grounds_ciphertext text NOT NULL,
  notifier_email_ciphertext text,
  has_good_faith_statement boolean,
  received_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,

  CONSTRAINT uq_copyright_territorial_notice_receipts__notice UNIQUE (copyright_notice_id, jurisdiction),
  CONSTRAINT uq_copyright_territorial_notice_receipts__idempotency UNIQUE (
    requester_identity_hmac, jurisdiction, idempotency_key
  ),
  CONSTRAINT fk_copyright_territorial_notice_receipts__approval
    FOREIGN KEY (copyright_jurisdiction_policy_approval_id, jurisdiction)
    REFERENCES copyright_jurisdiction_policy_approvals (id, jurisdiction) ON DELETE RESTRICT,
  CONSTRAINT chk_copyright_territorial_notice_receipts__jurisdiction CHECK (jurisdiction IN ('eu_dsa', 'uk')),
  CONSTRAINT chk_copyright_territorial_notice_receipts__idempotency CHECK (char_length(idempotency_key) = 36),
  CONSTRAINT chk_copyright_territorial_notice_receipts__sha CHECK (octet_length(request_sha256) = 32),
  CONSTRAINT chk_copyright_territorial_notice_receipts__identity_sha CHECK (octet_length(requester_identity_hmac) = 32),
  CONSTRAINT chk_copyright_territorial_notice_receipts__eu_fields CHECK (
    (jurisdiction = 'eu_dsa' AND notifier_email_ciphertext IS NOT NULL AND has_good_faith_statement IS TRUE)
    OR (jurisdiction = 'uk' AND notifier_email_ciphertext IS NULL AND has_good_faith_statement IS NULL)
  ),
  CONSTRAINT chk_copyright_territorial_notice_receipts__url CHECK (char_length(hosted_use_url) BETWEEN 1 AND 2048),
  CONSTRAINT chk_copyright_territorial_notice_receipts__grounds CHECK (
    char_length(grounds_ciphertext) BETWEEN 1 AND 1048576
  )
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS copyright_territorial_notice_routings (
  copyright_territorial_notice_receipt_id uuid PRIMARY KEY
    CONSTRAINT fk_copyright_territorial_notice_routings__receipt REFERENCES copyright_territorial_notice_receipts (id) ON DELETE CASCADE,
  destination copyright_territorial_notice_routing_destinations NOT NULL,
  routed_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT chk_copyright_territorial_notice_routings__destination CHECK (destination = 'staff_queue')
);

CREATE TABLE IF NOT EXISTS copyright_territorial_notice_acknowledgments (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_territorial_notice_receipt_id uuid NOT NULL CONSTRAINT uq_copyright_territorial_notice_acknowledgments__receipt_id UNIQUE
    CONSTRAINT fk_copyright_territorial_notice_acknowledgments__receipt REFERENCES copyright_territorial_notice_receipts (id) ON DELETE CASCADE,
  attempt_count integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  acknowledged_at timestamptz,
  exhausted_at timestamptz,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_copyright_territorial_notice_acknowledgments__attempts CHECK (attempt_count BETWEEN 0 AND 5),
  CONSTRAINT chk_copyright_territorial_notice_acknowledgments__attempt_time CHECK (
    (attempt_count = 0) = (last_attempt_at IS NULL)
  ),
  CONSTRAINT chk_copyright_territorial_notice_acknowledgments__terminal CHECK (
    acknowledged_at IS NULL OR exhausted_at IS NULL
  ),
  CONSTRAINT chk_copyright_territorial_notice_acknowledgments__exhaustion CHECK (
    exhausted_at IS NULL OR attempt_count = 5
  )
);

-- A published decision id survives its detailed history without carrying a merits result.
CREATE TABLE copyright_territorial_decision_identities (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_id uuid NOT NULL,
  jurisdiction copyright_jurisdictions NOT NULL CHECK (jurisdiction IN ('eu_dsa', 'uk')),
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  CONSTRAINT uq_copyright_territorial_decision_identities__notice_id UNIQUE (copyright_notice_id, id),
  CONSTRAINT uq_copyright_territorial_identities__notice_jurisdiction_id UNIQUE (copyright_notice_id, jurisdiction, id),
  CONSTRAINT fk_copyright_territorial_decision_identities__notice
    FOREIGN KEY (copyright_notice_id, jurisdiction) REFERENCES copyright_notices(id, jurisdiction) ON DELETE CASCADE
);
ALTER TABLE copyright_notices
  ADD CONSTRAINT fk_copyright_notices__current_territorial_decision_identity
  FOREIGN KEY (id, current_territorial_decision_identity_id)
  REFERENCES copyright_territorial_decision_identities(copyright_notice_id, id)
  ON DELETE RESTRICT NOT VALID;
ALTER TABLE copyright_notices VALIDATE CONSTRAINT fk_copyright_notices__current_territorial_decision_identity;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS copyright_territorial_decisions (
  transparency_generation bigint NOT NULL DEFAULT 0 CHECK (transparency_generation >= 0),
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_id uuid NOT NULL,
  jurisdiction copyright_jurisdictions NOT NULL,
  decided_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_by_id uuid,
  outcome copyright_territorial_decision_outcomes NOT NULL,
  copyright_notice_submission_assessment_identity_id uuid,
  supersedes_decision_id uuid,
  automation_disclosure copyright_territorial_decision_automation_disclosures NOT NULL,
  rationale_ciphertext text NOT NULL,
  public_explanation_ciphertext text NOT NULL,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,

  CONSTRAINT fk_copyright_territorial_decisions__identity
    FOREIGN KEY (copyright_notice_id, jurisdiction, id)
    REFERENCES copyright_territorial_decision_identities(copyright_notice_id, jurisdiction, id) ON DELETE RESTRICT,
  CONSTRAINT uq_copyright_territorial_decisions__notice_id UNIQUE (copyright_notice_id, id),
  CONSTRAINT chk_copyright_territorial_decisions__jurisdiction CHECK (jurisdiction IN ('eu_dsa', 'uk')),
  CONSTRAINT chk_copyright_territorial_decisions__outcome CHECK (outcome IN ('restrict', 'no_action')),
  CONSTRAINT chk_copyright_territorial_decisions__assessment CHECK ((outcome = 'restrict') = (copyright_notice_submission_assessment_identity_id IS NOT NULL)),
  CONSTRAINT chk_copyright_territorial_decisions__successor CHECK (supersedes_decision_id IS NULL OR outcome = 'restrict'),
  CONSTRAINT chk_copyright_territorial_decisions__human CHECK (automation_disclosure = 'human'),
  CONSTRAINT chk_copyright_territorial_decisions__rationale CHECK (
    char_length(rationale_ciphertext) BETWEEN 1 AND 1048576
  ),
  CONSTRAINT chk_copyright_territorial_decisions__public_explanation CHECK (
    char_length(public_explanation_ciphertext) BETWEEN 1 AND 1048576
  )
) PARTITION BY RANGE (id);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TYPE copyright_notice_legal_retention_phases AS ENUM
  ('claimant', 'submissions', 'incidents', 'targets', 'done');
CREATE TABLE copyright_notice_operational_retention_cursors (
  kind copyright_notice_operational_retention_kinds PRIMARY KEY,
  cursor_record_id uuid,
  sweep_upper_bound_record_id uuid,
  cursor_child_id uuid,
  cursor_edge_id uuid,
  cursor_phase copyright_notice_thread_retention_phases,
  cursor_legal_phase copyright_notice_legal_retention_phases,
  cursor_legal_child_id uuid,
  cursor_legal_hold_generation bigint,
  cursor_case_party_generation bigint,
  cursor_legal_latest_release_at timestamptz,
  cursor_blocker_phase text,
  cursor_blocker_child_id uuid,
  cursor_blocker_assessment_identity_id uuid REFERENCES copyright_notice_submission_assessment_identities(id) ON DELETE SET NULL,
  cursor_blocker_generation bigint,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER trigger_copyright_operational_cursors_updated_at
  BEFORE UPDATE ON copyright_notice_operational_retention_cursors
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
COMMENT ON TABLE copyright_notice_operational_retention_cursors IS 'One bounded keyset position per copyright operational history sweep.';
COMMENT ON COLUMN copyright_notice_operational_retention_cursors.kind IS 'Finite copyright operational sweep whose position this row stores.';
COMMENT ON COLUMN copyright_notice_operational_retention_cursors.cursor_record_id IS 'Last scanned UUIDv7 record; scanned ineligible rows advance this position and a completed pass resets it.';
COMMENT ON COLUMN copyright_notice_operational_retention_cursors.sweep_upper_bound_record_id IS 'Fixed exclusive UUIDv7 upper bound for the current pass; null between passes.';
COMMENT ON COLUMN copyright_notice_operational_retention_cursors.cursor_child_id IS 'Last case-link position examined within the current thread-retention case; a traversal value, not an authorization reference.';
COMMENT ON COLUMN copyright_notice_operational_retention_cursors.cursor_edge_id IS 'Last raw neighboring intake position examined within the current thread or unlinked-intake edge phase; a traversal value, not an authorization reference.';
COMMENT ON COLUMN copyright_notice_operational_retention_cursors.cursor_phase IS 'Thread-retention or unlinked-intake child phase resumed for the current record.';
COMMENT ON COLUMN copyright_notice_operational_retention_cursors.cursor_legal_phase IS 'Current bounded case-party source for legal preservation proof.';
COMMENT ON COLUMN copyright_notice_operational_retention_cursors.cursor_legal_child_id IS 'Last raw party-source row inspected in the current legal phase; a traversal value, not a relation.';
COMMENT ON COLUMN copyright_notice_operational_retention_cursors.cursor_legal_hold_generation IS 'Observed global preservation-hold generation for this paged proof.';
COMMENT ON COLUMN copyright_notice_operational_retention_cursors.cursor_case_party_generation IS 'Observed case-party generation for this paged proof.';
COMMENT ON COLUMN copyright_notice_operational_retention_cursors.cursor_legal_latest_release_at IS 'Latest release timestamp found across completed bounded party pages.';
COMMENT ON COLUMN copyright_notice_operational_retention_cursors.cursor_blocker_phase IS 'Current bounded staff and business blocker proof phase.';
COMMENT ON COLUMN copyright_notice_operational_retention_cursors.cursor_blocker_child_id IS 'Last raw blocker-source row inspected; an opaque traversal value, not a relationship.';
COMMENT ON COLUMN copyright_notice_operational_retention_cursors.cursor_blocker_assessment_identity_id IS 'Concrete submission assessment whose nested blocker children are being paged.';
COMMENT ON COLUMN copyright_notice_operational_retention_cursors.cursor_blocker_generation IS 'Observed case blocker generation for the current paged proof.';
COMMENT ON COLUMN copyright_notice_operational_retention_cursors.updated_at IS 'Last time this sweep position changed.';

CREATE INDEX idx_cpyrght_ntc_oprtnl_rtntn_crsrs__assessment
  ON copyright_notice_operational_retention_cursors (cursor_blocker_assessment_identity_id)
  WHERE cursor_blocker_assessment_identity_id IS NOT NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS copyright_territorial_redress_requests (
  transparency_generation bigint NOT NULL DEFAULT 0 CHECK (transparency_generation >= 0),
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_id uuid NOT NULL,
  jurisdiction copyright_jurisdictions NOT NULL,
  copyright_territorial_decision_id uuid NOT NULL,
  challenged_decision_outcome copyright_territorial_decision_outcomes NOT NULL,
  authorizing_assessment_identity_id uuid,
  submitted_by_id uuid,
  filed_by copyright_territorial_party_roles NOT NULL,
  idempotency_key text NOT NULL,
  explanation_ciphertext text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  staff_disposition copyright_territorial_redress_decision_staff_dispositions,
  current_staff_decision_identity_id uuid,
  decided_at timestamptz,
  decided_by_id uuid REFERENCES retained_user_identities(id) ON DELETE RESTRICT,
  rationale_ciphertext text,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,

  CONSTRAINT uq_copyright_redress_requests__case_id UNIQUE(copyright_notice_id, id),
  CONSTRAINT uq_copyright_redress_requests__case_jurisdiction_id UNIQUE(copyright_notice_id, jurisdiction, id),
  CONSTRAINT uq_copyright_territorial_redress_requests__party UNIQUE (
    copyright_territorial_decision_id, submitted_by_id
  ),
  CONSTRAINT uq_copyright_territorial_redress_requests__idempotency UNIQUE (
    submitted_by_id, jurisdiction, idempotency_key
  ),
  CONSTRAINT fk_copyright_territorial_redress_requests__decision
    FOREIGN KEY (copyright_notice_id, copyright_territorial_decision_id)
    REFERENCES copyright_territorial_decision_identities (copyright_notice_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_copyright_territorial_redress_requests__assessment
    FOREIGN KEY (copyright_notice_id, authorizing_assessment_identity_id)
    REFERENCES copyright_notice_submission_assessment_identities(copyright_notice_id, id) ON DELETE RESTRICT,
  CONSTRAINT chk_copyright_territorial_redress_requests__authority CHECK (
    (challenged_decision_outcome = 'restrict') = (authorizing_assessment_identity_id IS NOT NULL)
  ),
  CONSTRAINT chk_copyright_territorial_redress_requests__result CHECK (
    (staff_disposition IS NULL AND current_staff_decision_identity_id IS NULL
      AND decided_at IS NULL AND decided_by_id IS NULL AND rationale_ciphertext IS NULL)
    OR (staff_disposition IS NOT NULL AND current_staff_decision_identity_id IS NOT NULL
      AND decided_at IS NOT NULL AND decided_by_id IS NOT NULL
      AND rationale_ciphertext IS NOT NULL)),
  CONSTRAINT chk_copyright_territorial_redress_requests__jurisdiction CHECK (jurisdiction IN ('eu_dsa', 'uk')),
  CONSTRAINT chk_copyright_territorial_redress_requests__filed_by CHECK (
    filed_by IN ('notifier', 'poster', 'reviewer')
  ),
  CONSTRAINT chk_copyright_territorial_redress_requests__idempotency CHECK (char_length(idempotency_key) = 36),
  CONSTRAINT chk_copyright_territorial_redress_requests__explanation CHECK (
    char_length(explanation_ciphertext) BETWEEN 1 AND 1048576
  )
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE UNIQUE INDEX uq_copyright_territorial_redress_requests__guest
  ON copyright_territorial_redress_requests (copyright_territorial_decision_id)
  WHERE submitted_by_id IS NULL;

-- Actor presence is an admission invariant. Qualified evidence erasure later clears the FK
-- while the immutable territorial-update guard preserves the original party role.
CREATE FUNCTION fn_ensure_copyright_redress_request_actor()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.submitted_by_id IS NULL AND NEW.filed_by <> 'notifier' THEN
    RAISE EXCEPTION 'Non-notifier copyright redress requires an actor' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trigger_copyright_redress_request_actor BEFORE INSERT ON copyright_territorial_redress_requests
FOR EACH ROW EXECUTE FUNCTION fn_ensure_copyright_redress_request_actor();

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE copyright_territorial_redress_decision_identities (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_id uuid NOT NULL,
  copyright_territorial_redress_request_id uuid NOT NULL UNIQUE,
  CONSTRAINT fk_copyright_redress_decision_identities__request_scope
    FOREIGN KEY(copyright_notice_id, copyright_territorial_redress_request_id)
    REFERENCES copyright_territorial_redress_requests(copyright_notice_id, id) ON DELETE CASCADE,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  CONSTRAINT uq_copyright_redress_decision_identities__request_id
    UNIQUE (copyright_territorial_redress_request_id, id)
);
CREATE TRIGGER trigger_update_copyright_redress_identity_scope
  BEFORE INSERT ON copyright_territorial_redress_decision_identities FOR EACH ROW
  EXECUTE FUNCTION fn_update_parent_notice_scope('copyright_territorial_redress_requests', 'copyright_territorial_redress_request_id');
COMMENT ON COLUMN copyright_territorial_redress_decision_identities.copyright_notice_id IS 'Minimal case owner scope, retained with the request and used by the bounded purge guard after request deletion.';
ALTER TABLE copyright_territorial_redress_requests
  ADD CONSTRAINT fk_copyright_redress_requests__current_decision_identity
  FOREIGN KEY (id, current_staff_decision_identity_id)
  REFERENCES copyright_territorial_redress_decision_identities(copyright_territorial_redress_request_id, id)
  ON DELETE RESTRICT NOT VALID;
ALTER TABLE copyright_territorial_redress_requests
  VALIDATE CONSTRAINT fk_copyright_redress_requests__current_decision_identity;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS copyright_territorial_redress_decisions (
  copyright_notice_id uuid NOT NULL,
  jurisdiction copyright_jurisdictions NOT NULL,
  transparency_generation bigint NOT NULL DEFAULT 0 CHECK (transparency_generation >= 0),
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_territorial_redress_request_id uuid NOT NULL,
  CONSTRAINT fk_copyright_territorial_redress_decisions__request
    FOREIGN KEY(copyright_notice_id, jurisdiction, copyright_territorial_redress_request_id)
    REFERENCES copyright_territorial_redress_requests(copyright_notice_id, jurisdiction, id) ON DELETE RESTRICT,
  decided_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_by_id uuid,
  staff_disposition copyright_territorial_redress_decision_staff_dispositions NOT NULL,
  rationale_ciphertext text NOT NULL,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,

  CONSTRAINT fk_copyright_territorial_redress_decisions__identity
    FOREIGN KEY (copyright_territorial_redress_request_id, id)
    REFERENCES copyright_territorial_redress_decision_identities(copyright_territorial_redress_request_id, id) ON DELETE RESTRICT,

  CONSTRAINT chk_copyright_territorial_redress_decisions__disposition CHECK (
    staff_disposition IN ('maintain', 'revoke')
  ),
  CONSTRAINT chk_copyright_territorial_redress_decisions__rationale CHECK (
    char_length(rationale_ciphertext) BETWEEN 1 AND 1048576
  )
) PARTITION BY RANGE (id);
CREATE FUNCTION fn_update_copyright_redress_decision_scope()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_notice_id uuid; owner_jurisdiction copyright_jurisdictions;
BEGIN
  SELECT copyright_notice_id, jurisdiction INTO STRICT owner_notice_id, owner_jurisdiction
    FROM copyright_territorial_redress_requests WHERE id = NEW.copyright_territorial_redress_request_id;
  IF (NEW.copyright_notice_id IS NOT NULL AND NEW.copyright_notice_id <> owner_notice_id)
    OR (NEW.jurisdiction IS NOT NULL AND NEW.jurisdiction <> owner_jurisdiction) THEN
    RAISE EXCEPTION 'copyright redress decision scope does not match its request' USING ERRCODE = 'check_violation';
  END IF;
  NEW.copyright_notice_id := owner_notice_id;
  NEW.jurisdiction := owner_jurisdiction;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trigger_update_copyright_redress_decision_scope
  BEFORE INSERT ON copyright_territorial_redress_decisions FOR EACH ROW
  EXECUTE FUNCTION fn_update_copyright_redress_decision_scope();
COMMENT ON FUNCTION fn_update_copyright_redress_decision_scope() IS 'Derives concrete case and jurisdiction scope from the immutable request for partition-safe retirement and purge proofs.';
COMMENT ON COLUMN copyright_territorial_redress_decisions.copyright_notice_id IS 'Case scope of the owning request, protected by its composite foreign key.';
COMMENT ON COLUMN copyright_territorial_redress_decisions.jurisdiction IS 'Jurisdiction of the owning request, used by indexed report coverage checks when retiring history.';


-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS copyright_eu_supervised_complaints (
  transparency_generation bigint NOT NULL DEFAULT 0 CHECK (transparency_generation >= 0),
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_id uuid NOT NULL,
  jurisdiction copyright_jurisdictions NOT NULL,
  recorded_by_id uuid,
  idempotency_key text NOT NULL,
  authority_reference text NOT NULL,
  explanation_ciphertext text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,

  CONSTRAINT uq_copyright_eu_supervised_complaints__reference UNIQUE (
    copyright_notice_id, jurisdiction, authority_reference
  ),
  CONSTRAINT uq_copyright_eu_supervised_complaints__idempotency UNIQUE (
    recorded_by_id, jurisdiction, idempotency_key
  ),
  CONSTRAINT chk_copyright_eu_supervised_complaints__jurisdiction CHECK (jurisdiction = 'eu_dsa'),
  CONSTRAINT chk_copyright_eu_supervised_complaints__idempotency CHECK (char_length(idempotency_key) = 36),
  CONSTRAINT chk_copyright_eu_supervised_complaints__reference CHECK (
    char_length(authority_reference) BETWEEN 1 AND 200
  ),
  CONSTRAINT chk_copyright_eu_supervised_complaints__explanation CHECK (
    char_length(explanation_ciphertext) BETWEEN 1 AND 1048576
  )
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS copyright_eu_dispute_settlement_referrals (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_id uuid NOT NULL,
  jurisdiction copyright_jurisdictions NOT NULL DEFAULT 'eu_dsa',
  copyright_territorial_decision_id uuid NOT NULL,
  body_name text NOT NULL,
  referred_at timestamptz NOT NULL,
  referred_by_party copyright_territorial_party_roles NOT NULL,
  referred_by_id uuid,
  recorded_by_id uuid,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,

  CONSTRAINT fk_copyright_eu_dispute_settlement_referrals__decision
    FOREIGN KEY (copyright_notice_id, copyright_territorial_decision_id)
    REFERENCES copyright_territorial_decision_identities (copyright_notice_id, id) ON DELETE RESTRICT,
  CONSTRAINT chk_copyright_eu_dispute_settlement_referrals__jurisdiction CHECK (jurisdiction = 'eu_dsa'),
  CONSTRAINT chk_copyright_eu_dispute_settlement_referrals__body_name CHECK (char_length(body_name) BETWEEN 1 AND 200),
  CONSTRAINT chk_copyright_eu_dispute_settlement_referrals__party CHECK (
    referred_by_party IN ('poster', 'notifier')
  )
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS copyright_eu_dispute_settlement_outcomes (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_eu_dispute_settlement_referral_id uuid NOT NULL CONSTRAINT uq_copyright_eu_dispute_settlement_outcomes__referral_id UNIQUE
    CONSTRAINT fk_copyright_eu_dispute_settlement_outcomes__referral REFERENCES copyright_eu_dispute_settlement_referrals (id) ON DELETE CASCADE,
  decided_at timestamptz NOT NULL,
  result copyright_eu_dispute_settlement_results NOT NULL,
  implemented_at timestamptz,
  recorded_by_id uuid,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_copyright_eu_dispute_settlement_outcomes__result CHECK (
    result IN ('decided_for_recipient', 'decided_for_platform', 'withdrawn', 'no_decision')
  ),
  CONSTRAINT chk_copyright_eu_dispute_settlement_outcomes__implementation CHECK (
    implemented_at IS NULL OR result = 'decided_for_recipient'
  )
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE TRIGGER trigger_copyright_eu_dispute_settlement_outcomes_updated_at
BEFORE UPDATE ON copyright_eu_dispute_settlement_outcomes
FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS copyright_territorial_escalations (
  transparency_generation bigint NOT NULL DEFAULT 0 CHECK (transparency_generation >= 0),
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_id uuid NOT NULL,
  jurisdiction copyright_jurisdictions NOT NULL,
  copyright_territorial_notice_acknowledgment_id uuid CONSTRAINT uq_copyright_territorial_escalations__notice_acknowledgment_id UNIQUE
    CONSTRAINT fk_copyright_territorial_escalations__notice_acknowledgment REFERENCES copyright_territorial_notice_acknowledgments (id) ON DELETE CASCADE,
  copyright_eu_supervised_complaint_id uuid CONSTRAINT uq_copyright_territoria_escalations__eu_supervised_complaint_id UNIQUE
    CONSTRAINT fk_copyright_territorial_escalations__eu_supervised_complaint REFERENCES copyright_eu_supervised_complaints (id) ON DELETE CASCADE,
  escalated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,

  CONSTRAINT chk_copyright_territorial_escalations__jurisdiction CHECK (jurisdiction IN ('eu_dsa', 'uk')),
  CONSTRAINT chk_copyright_territorial_escalations__source CHECK (
    num_nonnulls(
      copyright_territorial_notice_acknowledgment_id,
      copyright_eu_supervised_complaint_id
    ) = 1
  )
);

-- Explicit terminal facts preserve the immutable legal record and give retention a real clock.
CREATE TABLE copyright_territorial_escalation_closures (
  copyright_territorial_escalation_id uuid PRIMARY KEY
    CONSTRAINT fk_copyright_escalation_closures__escalation REFERENCES copyright_territorial_escalations(id) ON DELETE CASCADE,
  closed_by_id uuid NOT NULL
    CONSTRAINT fk_copyright_escalation_closures__closed_by REFERENCES retained_user_identities(id) ON DELETE RESTRICT,
  closed_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
COMMENT ON TABLE copyright_territorial_escalation_closures IS 'One explicit staff closure for each territorial escalation; an absent row means the escalation remains open.';
COMMENT ON COLUMN copyright_territorial_escalation_closures.copyright_territorial_escalation_id IS 'Escalation whose immutable closure this row records.';
COMMENT ON COLUMN copyright_territorial_escalation_closures.closed_by_id IS 'Authenticated reviewer who closed the escalation; historical identity grants no authority.';
COMMENT ON COLUMN copyright_territorial_escalation_closures.closed_at IS 'Substantive closure time that restarts the case retention clock.';
CREATE INDEX idx_cpyrght_trrtrl_escltn_clsrs__closed_by ON copyright_territorial_escalation_closures(closed_by_id);
CREATE TRIGGER trigger_copyright_escalation_closures_immutable
BEFORE UPDATE OR DELETE ON copyright_territorial_escalation_closures FOR EACH ROW
EXECUTE FUNCTION fn_reject_copyright_purge_only_mutation();

CREATE TABLE copyright_eu_supervised_complaint_resolutions (
  copyright_eu_supervised_complaint_id uuid PRIMARY KEY
    CONSTRAINT fk_copyright_supervised_resolutions__complaint REFERENCES copyright_eu_supervised_complaints(id) ON DELETE CASCADE,
  resolved_by_id uuid NOT NULL
    CONSTRAINT fk_copyright_supervised_resolutions__resolved_by REFERENCES retained_user_identities(id) ON DELETE RESTRICT,
  resolved_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
COMMENT ON TABLE copyright_eu_supervised_complaint_resolutions IS 'One explicit reviewer resolution for each supervised complaint; an absent row blocks case expiry.';
COMMENT ON COLUMN copyright_eu_supervised_complaint_resolutions.copyright_eu_supervised_complaint_id IS 'Supervised complaint resolved by this immutable fact.';
COMMENT ON COLUMN copyright_eu_supervised_complaint_resolutions.resolved_by_id IS 'Authenticated reviewer who resolved the complaint; historical identity grants no authority.';
COMMENT ON COLUMN copyright_eu_supervised_complaint_resolutions.resolved_at IS 'Substantive resolution time that restarts case retention.';
CREATE INDEX idx_cpyrght_eu_sprvsd_cmplnt_rsltns__resolved_by ON copyright_eu_supervised_complaint_resolutions(resolved_by_id);
CREATE TRIGGER trigger_copyright_supervised_resolutions_immutable
BEFORE UPDATE OR DELETE ON copyright_eu_supervised_complaint_resolutions FOR EACH ROW
EXECUTE FUNCTION fn_reject_copyright_purge_only_mutation();

COMMENT ON TYPE copyright_case_preservation_kinds IS 'Written threats and authority requests that preserve a case independently of any live account.';
CREATE TABLE copyright_case_preservation_holds (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_id uuid NOT NULL
    CONSTRAINT fk_copyright_case_preservation_holds__notice REFERENCES copyright_notices(id) ON DELETE CASCADE,
  kind copyright_case_preservation_kinds NOT NULL,
  placed_by_id uuid NOT NULL
    CONSTRAINT fk_copyright_case_preservation_holds__placed_by REFERENCES retained_user_identities(id) ON DELETE RESTRICT,
  released_at timestamptz,
  released_by_id uuid
    CONSTRAINT fk_copyright_case_preservation_holds__released_by REFERENCES retained_user_identities(id) ON DELETE RESTRICT,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  CHECK ((released_at IS NULL) = (released_by_id IS NULL))
);
COMMENT ON TABLE copyright_case_preservation_holds IS 'Explicit case preservation for any written claim threat or regulator/court request, including guest cases; release is a one-way terminal fact.';
COMMENT ON COLUMN copyright_case_preservation_holds.id IS 'UUIDv7 preservation hold identity.';
COMMENT ON COLUMN copyright_case_preservation_holds.copyright_notice_id IS 'Case preserved until this hold is released.';
COMMENT ON COLUMN copyright_case_preservation_holds.kind IS 'Reason the case must remain available.';
COMMENT ON COLUMN copyright_case_preservation_holds.placed_by_id IS 'Reviewer recording the written threat or authority request.';
COMMENT ON COLUMN copyright_case_preservation_holds.released_at IS 'One-time release timestamp; NULL blocks both evidence and legal-record expiry.';
COMMENT ON COLUMN copyright_case_preservation_holds.released_by_id IS 'Reviewer recording release; set with released_at.';
COMMENT ON COLUMN copyright_case_preservation_holds.created_at IS 'Time the hold was placed, derived from its UUIDv7 identity.';
CREATE INDEX idx_copyright_case_preservation_holds__notice ON copyright_case_preservation_holds(copyright_notice_id, id);
CREATE INDEX idx_copyright_case_preservation_holds__open ON copyright_case_preservation_holds(copyright_notice_id) WHERE released_at IS NULL;
CREATE INDEX idx_copyright_case_preservation_holds__placed_by ON copyright_case_preservation_holds(placed_by_id);
CREATE INDEX idx_copyright_case_preservation_holds__released_by ON copyright_case_preservation_holds(released_by_id) WHERE released_by_id IS NOT NULL;
CREATE FUNCTION fn_reject_copyright_case_preservation_hold_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF fn_project_copyright_minimal_purge_child_allowed(TG_TABLE_NAME, to_jsonb(OLD)) THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'case preservation holds are retained until case expiry' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.released_at IS NOT NULL OR NEW.released_at IS NULL
    OR (to_jsonb(NEW) - ARRAY['released_at', 'released_by_id'])
      IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['released_at', 'released_by_id']) THEN
    RAISE EXCEPTION 'case preservation holds may only be released once' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trigger_copyright_case_preservation_holds_guard
BEFORE UPDATE OR DELETE ON copyright_case_preservation_holds FOR EACH ROW
EXECUTE FUNCTION fn_reject_copyright_case_preservation_hold_mutation();

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS copyright_eu_transparency_reports (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  jurisdiction copyright_jurisdictions NOT NULL,
  period_started_at timestamptz NOT NULL,
  period_ended_at timestamptz NOT NULL,
  receipt_count integer NOT NULL,
  statement_of_reasons_count integer NOT NULL,
  redress_request_count integer NOT NULL,
  redress_decision_count integer NOT NULL,
  supervised_complaint_count integer NOT NULL,
  escalation_count integer NOT NULL,
  previous_report_id uuid REFERENCES copyright_eu_transparency_reports(id) ON DELETE RESTRICT,
  source_generation bigint NOT NULL CHECK (source_generation >= 0),
  method_snapshot jsonb NOT NULL CHECK (jsonb_typeof(method_snapshot) = 'object'),
  reported_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,

  CONSTRAINT chk_copyright_eu_transparency_reports__jurisdiction CHECK (jurisdiction = 'eu_dsa'),
  CONSTRAINT chk_copyright_eu_transparency_reports__period CHECK (period_started_at < period_ended_at),
  CONSTRAINT chk_copyright_eu_transparency_reports__counts CHECK (
    receipt_count >= 0
    AND statement_of_reasons_count >= 0
    AND redress_request_count >= 0
    AND redress_decision_count >= 0
    AND supervised_complaint_count >= 0
    AND escalation_count >= 0
  )
);

COMMENT ON TABLE copyright_jurisdiction_policy_approvals IS
  'Operator approval that makes one EU or UK copyright contract applicable. Absence or withdrawal fails closed.';
COMMENT ON COLUMN copyright_jurisdiction_policy_approvals.jurisdiction IS
  'Contract family this approval activates: eu_dsa or uk.';
COMMENT ON COLUMN copyright_jurisdiction_policy_approvals.policy_version IS
  'Identifier of the approved contract text. Unique per jurisdiction.';
COMMENT ON COLUMN copyright_jurisdiction_policy_approvals.approved_at IS
  'When an operator approved this policy version.';
COMMENT ON COLUMN copyright_jurisdiction_policy_approvals.approved_by_id IS
  'Operator who approved this policy version. Null after that account is deleted.';

COMMENT ON TABLE copyright_jurisdiction_policy_withdrawals IS
  'Withdrawal of one jurisdiction policy approval. A withdrawn approval fails closed.';
COMMENT ON COLUMN copyright_jurisdiction_policy_withdrawals.copyright_jurisdiction_policy_approval_id IS
  'Approval this withdrawal retires. One withdrawal per approval.';
COMMENT ON COLUMN copyright_jurisdiction_policy_withdrawals.withdrawn_at IS
  'When an operator withdrew the approval.';
COMMENT ON COLUMN copyright_jurisdiction_policy_withdrawals.withdrawn_by_id IS
  'Operator who withdrew the approval. Null after that account is deleted.';

COMMENT ON TABLE copyright_territorial_notice_receipts IS
  'EU or UK notice receipt. Administrative facts only; no US restoration clock and no merits decision.';
COMMENT ON COLUMN copyright_territorial_notice_receipts.copyright_notice_id IS
  'Copyright notice this receipt records. One receipt per notice.';
COMMENT ON COLUMN copyright_territorial_notice_receipts.jurisdiction IS
  'Jurisdiction of the notice and of the policy approval: eu_dsa or uk. Both foreign keys must agree.';
COMMENT ON COLUMN copyright_territorial_notice_receipts.copyright_jurisdiction_policy_approval_id IS
  'Unwithdrawn policy approval of the same jurisdiction that made this receipt acceptable.';
COMMENT ON COLUMN copyright_territorial_notice_receipts.requester_user_id IS
  'Signed-in requester identity retained after account deletion; null means a genuine guest only. This historical identity never grants authorization.';
COMMENT ON COLUMN copyright_territorial_notice_receipts.requester_identity_hmac IS
  'Dedicated keyed requester fingerprint scoped to this live case.';
COMMENT ON COLUMN copyright_territorial_notice_receipts.idempotency_key IS
  'Caller idempotency key, unique together with requester identity digest and jurisdiction.';
COMMENT ON COLUMN copyright_territorial_notice_receipts.request_sha256 IS
  'SHA-256 digest of the received request.';
COMMENT ON COLUMN copyright_territorial_notice_receipts.hosted_use_url IS
  'URL of the hosted use identified in the notice.';
COMMENT ON COLUMN copyright_territorial_notice_receipts.grounds_ciphertext IS
  'Encrypted grounds supplied with the notice. The system does not decide merits.';
COMMENT ON COLUMN copyright_territorial_notice_receipts.notifier_email_ciphertext IS
  'Encrypted EU notifier address of record for receipt and later decision notices; absent for UK.';
COMMENT ON COLUMN copyright_territorial_notice_receipts.has_good_faith_statement IS
  'EU notifier good-faith declaration, required true; absent for UK.';
COMMENT ON COLUMN copyright_territorial_notice_receipts.received_at IS
  'When Voucha stored this notice receipt.';

COMMENT ON TABLE copyright_territorial_notice_routings IS
  'Staff-queue routing for one EU or UK notice receipt. Routing is administrative, not a merits decision.';
COMMENT ON COLUMN copyright_territorial_notice_routings.copyright_territorial_notice_receipt_id IS
  'Receipt this routing belongs to. One routing per receipt.';
COMMENT ON COLUMN copyright_territorial_notice_routings.destination IS
  'Queue that received the notice. Constrained to staff_queue.';
COMMENT ON COLUMN copyright_territorial_notice_routings.routed_at IS
  'When the receipt was routed to the staff queue.';

COMMENT ON TABLE copyright_territorial_notice_acknowledgments IS
  'Acknowledgment attempts for one EU or UK notice receipt. There is no statutory due time.';
COMMENT ON COLUMN copyright_territorial_notice_acknowledgments.copyright_territorial_notice_receipt_id IS
  'Receipt this acknowledgment obligation belongs to. One row per receipt.';
COMMENT ON COLUMN copyright_territorial_notice_acknowledgments.attempt_count IS
  'How many acknowledgment attempts have been recorded, from 0 through 5.';
COMMENT ON COLUMN copyright_territorial_notice_acknowledgments.last_attempt_at IS
  'When the latest acknowledgment attempt was recorded. Null when attempt_count is 0.';
COMMENT ON COLUMN copyright_territorial_notice_acknowledgments.acknowledged_at IS
  'When acknowledgment succeeded. Mutually exclusive with exhausted_at.';
COMMENT ON COLUMN copyright_territorial_notice_acknowledgments.exhausted_at IS
  'When the fifth attempt failed and the obligation was exhausted.';

COMMENT ON TABLE copyright_territorial_decisions IS
  'Human decision on an EU or UK notice. A revoked no_action can be superseded once by a restrict decision; the live decision is the row without a successor.';
COMMENT ON COLUMN copyright_territorial_decisions.copyright_notice_id IS
  'Notice this decision explains. At most one original and one permitted successor per notice.';
COMMENT ON COLUMN copyright_territorial_decisions.jurisdiction IS
  'Jurisdiction of the notice: eu_dsa or uk. Must equal the notice jurisdiction.';
COMMENT ON COLUMN copyright_territorial_decisions.decided_at IS
  'When staff recorded the decision (the statement of reasons for eu_dsa).';
COMMENT ON COLUMN copyright_territorial_decisions.decided_by_id IS
  'Staff user who recorded the decision. Null after that account is deleted.';
COMMENT ON COLUMN copyright_territorial_decisions.automation_disclosure IS
  'How the decision was produced. Constrained to human.';
COMMENT ON COLUMN copyright_territorial_decisions.outcome IS
  'Human decision: restrict the named targets or take no action.';
COMMENT ON COLUMN copyright_territorial_decisions.copyright_notice_submission_assessment_identity_id IS
  'Required compliant human assessment for a restrict decision; absent for no_action.';
COMMENT ON COLUMN copyright_territorial_decisions.supersedes_decision_id IS
  'Prior no_action decision reopened by a complaint revoke on the same notice.';
COMMENT ON COLUMN copyright_territorial_decisions.rationale_ciphertext IS
  'Encrypted staff-only rationale; never included in participant notices.';
COMMENT ON COLUMN copyright_territorial_decisions.public_explanation_ciphertext IS
  'Encrypted staff-written public explanation for poster and notifier statements; must contain no personal data.';

COMMENT ON TABLE copyright_territorial_redress_requests IS
  'Participant redress against one live EU or UK decision. One request per submitter per decision, including one guest request.';
COMMENT ON COLUMN copyright_territorial_redress_requests.filed_by IS
  'Role at filing: notifier, target poster, or reviewer. Guest filing can only be notifier.';
COMMENT ON COLUMN copyright_territorial_redress_requests.copyright_notice_id IS
  'Notice this redress request challenges. The composite foreign key requires the cited decision to be on this notice.';
COMMENT ON COLUMN copyright_territorial_redress_requests.jurisdiction IS
  'Jurisdiction of the notice: eu_dsa or uk. Must equal the notice jurisdiction.';
COMMENT ON COLUMN copyright_territorial_redress_requests.copyright_territorial_decision_id IS
  'Decision this redress request cites, on the same notice.';
COMMENT ON COLUMN copyright_territorial_redress_requests.submitted_by_id IS
  'Retained identity of the submitting account; null only for a guest notifier. Never authorizes a deleted account.';
COMMENT ON COLUMN copyright_territorial_redress_requests.idempotency_key IS
  'Caller idempotency key, unique together with submitted_by_id and jurisdiction.';
COMMENT ON COLUMN copyright_territorial_redress_requests.explanation_ciphertext IS
  'Encrypted explanation supplied by the participant.';
COMMENT ON COLUMN copyright_territorial_redress_requests.received_at IS
  'When Voucha stored this redress request.';

COMMENT ON TABLE copyright_territorial_redress_decisions IS
  'Staff disposition of one EU or UK redress request. The system does not choose the rationale.';
COMMENT ON COLUMN copyright_territorial_redress_decisions.copyright_territorial_redress_request_id IS
  'Redress request this decision closes. One decision per request.';
COMMENT ON COLUMN copyright_territorial_redress_decisions.decided_at IS
  'When staff recorded the redress decision.';
COMMENT ON COLUMN copyright_territorial_redress_decisions.decided_by_id IS
  'Staff user who recorded the decision. Null after that account is deleted.';
COMMENT ON COLUMN copyright_territorial_redress_decisions.staff_disposition IS
  'Staff outcome: maintain or revoke. The system does not choose it.';
COMMENT ON COLUMN copyright_territorial_redress_decisions.rationale_ciphertext IS
  'Encrypted staff-supplied rationale for the disposition.';

COMMENT ON TABLE copyright_eu_supervised_complaints IS
  'Supervised complaint recorded against an EU notice. EU only. Recording it can escalate the notice.';
COMMENT ON COLUMN copyright_eu_supervised_complaints.copyright_notice_id IS
  'EU notice this supervised complaint concerns.';
COMMENT ON COLUMN copyright_eu_supervised_complaints.jurisdiction IS
  'Always eu_dsa. The composite foreign key requires the notice to be an eu_dsa notice.';
COMMENT ON COLUMN copyright_eu_supervised_complaints.recorded_by_id IS
  'User who recorded the complaint. Null after that account is deleted.';
COMMENT ON COLUMN copyright_eu_supervised_complaints.idempotency_key IS
  'Caller-supplied UUID replay key, scoped to the recording user and jurisdiction.';
COMMENT ON COLUMN copyright_eu_supervised_complaints.authority_reference IS
  'Authority reference for this complaint. Unique per notice.';
COMMENT ON COLUMN copyright_eu_supervised_complaints.explanation_ciphertext IS
  'Encrypted explanation of the supervised complaint.';
COMMENT ON COLUMN copyright_eu_supervised_complaints.received_at IS
  'When Voucha stored this supervised complaint.';

COMMENT ON TABLE copyright_eu_dispute_settlement_referrals IS
  'Staff record of an EU notice party referring a decision to an out-of-court dispute settlement body.';
COMMENT ON COLUMN copyright_eu_dispute_settlement_referrals.copyright_notice_id IS
  'EU notice involved in the referral; matches the cited decision.';
COMMENT ON COLUMN copyright_eu_dispute_settlement_referrals.jurisdiction IS
  'Always eu_dsa; composite notice FK enforces the jurisdiction.';
COMMENT ON COLUMN copyright_eu_dispute_settlement_referrals.copyright_territorial_decision_id IS
  'Decision the party referred to the body.';
COMMENT ON COLUMN copyright_eu_dispute_settlement_referrals.body_name IS
  'Name of the out-of-court dispute settlement body.';
COMMENT ON COLUMN copyright_eu_dispute_settlement_referrals.referred_at IS
  'When the party referred the decision to the body.';
COMMENT ON COLUMN copyright_eu_dispute_settlement_referrals.referred_by_party IS
  'Whether the referring party was a poster or notifier.';
COMMENT ON COLUMN copyright_eu_dispute_settlement_referrals.referred_by_id IS
  'Party account if one exists; null for a guest or after account deletion.';
COMMENT ON COLUMN copyright_eu_dispute_settlement_referrals.recorded_by_id IS
  'Staff account recording the referral; null after account deletion.';

COMMENT ON TABLE copyright_eu_dispute_settlement_outcomes IS
  'One recorded outcome per EU dispute settlement referral. The body does not bind the platform.';
COMMENT ON COLUMN copyright_eu_dispute_settlement_outcomes.copyright_eu_dispute_settlement_referral_id IS
  'Referral this outcome resolves; one outcome per referral.';
COMMENT ON COLUMN copyright_eu_dispute_settlement_outcomes.decided_at IS
  'When the body decided, no earlier than the referral.';
COMMENT ON COLUMN copyright_eu_dispute_settlement_outcomes.result IS
  'Body outcome, which does not automatically change platform restrictions.';
COMMENT ON COLUMN copyright_eu_dispute_settlement_outcomes.implemented_at IS
  'When staff implemented a decision for the recipient, after a separate staff action.';
COMMENT ON COLUMN copyright_eu_dispute_settlement_outcomes.recorded_by_id IS
  'Staff account recording the outcome; null after account deletion.';

COMMENT ON TABLE copyright_territorial_escalations IS
  'Escalation of one EU or UK notice from either an exhausted acknowledgment or, for EU only, a supervised complaint.';
COMMENT ON COLUMN copyright_territorial_escalations.copyright_notice_id IS
  'Notice this escalation belongs to. The source row must belong to the same notice.';
COMMENT ON COLUMN copyright_territorial_escalations.jurisdiction IS
  'Jurisdiction of the notice: eu_dsa or uk. Must equal the notice jurisdiction.';
COMMENT ON COLUMN copyright_territorial_escalations.copyright_territorial_notice_acknowledgment_id IS
  'Exhausted acknowledgment that caused this escalation. Exactly one source is set.';
COMMENT ON COLUMN copyright_territorial_escalations.copyright_eu_supervised_complaint_id IS
  'EU supervised complaint that caused this escalation. Exactly one source is set.';
COMMENT ON COLUMN copyright_territorial_escalations.escalated_at IS
  'When the escalation was recorded.';

COMMENT ON COLUMN copyright_eu_transparency_reports.method_snapshot IS 'Immutable aggregate methodology, definitions, and implementation version used for this report; contains no personal or case data.';
COMMENT ON TABLE copyright_eu_transparency_reports IS
  'Counts of stored EU copyright facts for a caller-supplied period. EU only. The period is not a statutory clock.';
COMMENT ON COLUMN copyright_eu_transparency_reports.jurisdiction IS
  'Always eu_dsa.';
COMMENT ON COLUMN copyright_eu_transparency_reports.period_started_at IS
  'Start of the caller-supplied reporting period. Not a statutory clock.';
COMMENT ON COLUMN copyright_eu_transparency_reports.period_ended_at IS
  'End of the caller-supplied reporting period. Must be after period_started_at.';
COMMENT ON COLUMN copyright_eu_transparency_reports.receipt_count IS
  'Count of stored EU notice receipts in the period.';
COMMENT ON COLUMN copyright_eu_transparency_reports.statement_of_reasons_count IS
  'Count of stored EU statements of reasons in the period.';
COMMENT ON COLUMN copyright_eu_transparency_reports.redress_request_count IS
  'Count of stored EU redress requests in the period.';
COMMENT ON COLUMN copyright_eu_transparency_reports.redress_decision_count IS
  'Count of stored EU redress decisions in the period.';
COMMENT ON COLUMN copyright_eu_transparency_reports.supervised_complaint_count IS
  'Count of stored EU supervised complaints in the period.';
COMMENT ON COLUMN copyright_eu_transparency_reports.escalation_count IS
  'Count of stored EU escalations in the period.';
COMMENT ON COLUMN copyright_eu_transparency_reports.reported_at IS
  'When this transparency report was recorded.';

ALTER TABLE copyright_jurisdiction_policy_approvals
  ADD CONSTRAINT fk_copyright_jurisdiction_policy_approvals__approved_by
  FOREIGN KEY (approved_by_id) REFERENCES users (id) ON DELETE SET NULL NOT VALID;
ALTER TABLE copyright_jurisdiction_policy_approvals
  VALIDATE CONSTRAINT fk_copyright_jurisdiction_policy_approvals__approved_by;

ALTER TABLE copyright_jurisdiction_policy_withdrawals
  ADD CONSTRAINT fk_copyright_jurisdiction_policy_withdrawals__withdrawn_by
  FOREIGN KEY (withdrawn_by_id) REFERENCES users (id) ON DELETE SET NULL NOT VALID;
ALTER TABLE copyright_jurisdiction_policy_withdrawals
  VALIDATE CONSTRAINT fk_copyright_jurisdiction_policy_withdrawals__withdrawn_by;

ALTER TABLE copyright_territorial_notice_receipts
  ADD CONSTRAINT fk_copyright_territorial_notice_receipts__notice
  FOREIGN KEY (copyright_notice_id, jurisdiction)
  REFERENCES copyright_notices (id, jurisdiction) ON DELETE CASCADE NOT VALID;
ALTER TABLE copyright_territorial_notice_receipts
  VALIDATE CONSTRAINT fk_copyright_territorial_notice_receipts__notice;
ALTER TABLE copyright_territorial_notice_receipts
  ADD CONSTRAINT fk_copyright_territorial_notice_receipts__requester
  FOREIGN KEY (requester_user_id) REFERENCES retained_user_identities (id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE copyright_territorial_notice_receipts
  VALIDATE CONSTRAINT fk_copyright_territorial_notice_receipts__requester;

ALTER TABLE copyright_territorial_decisions
  ADD CONSTRAINT fk_copyright_territorial_decisions__notice
  FOREIGN KEY (copyright_notice_id, jurisdiction)
  REFERENCES copyright_notices (id, jurisdiction) ON DELETE CASCADE NOT VALID;
ALTER TABLE copyright_territorial_decisions
  VALIDATE CONSTRAINT fk_copyright_territorial_decisions__notice;
ALTER TABLE copyright_territorial_decisions
  ADD CONSTRAINT fk_copyright_territorial_decisions__decided_by
  FOREIGN KEY (decided_by_id) REFERENCES retained_user_identities (id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE copyright_territorial_decisions
  VALIDATE CONSTRAINT fk_copyright_territorial_decisions__decided_by;
ALTER TABLE copyright_territorial_decisions
  ADD CONSTRAINT fk_copyright_territorial_decisions__assessment
  FOREIGN KEY (copyright_notice_submission_assessment_identity_id)
  REFERENCES copyright_notice_submission_assessment_identities (id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE copyright_territorial_decisions
  VALIDATE CONSTRAINT fk_copyright_territorial_decisions__assessment;
ALTER TABLE copyright_territorial_decisions
  ADD CONSTRAINT fk_copyright_territorial_decisions__predecessor
  FOREIGN KEY (copyright_notice_id, supersedes_decision_id)
  REFERENCES copyright_territorial_decision_identities (copyright_notice_id, id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE copyright_territorial_decisions
  VALIDATE CONSTRAINT fk_copyright_territorial_decisions__predecessor;

ALTER TABLE copyright_territorial_redress_requests
  ADD CONSTRAINT fk_copyright_territorial_redress_requests__notice
  FOREIGN KEY (copyright_notice_id, jurisdiction)
  REFERENCES copyright_notices (id, jurisdiction) ON DELETE CASCADE NOT VALID;
ALTER TABLE copyright_territorial_redress_requests
  VALIDATE CONSTRAINT fk_copyright_territorial_redress_requests__notice;
ALTER TABLE copyright_territorial_redress_requests
  ADD CONSTRAINT fk_copyright_territorial_redress_requests__submitter
  FOREIGN KEY (submitted_by_id) REFERENCES retained_user_identities (id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE copyright_territorial_redress_requests
  VALIDATE CONSTRAINT fk_copyright_territorial_redress_requests__submitter;

ALTER TABLE copyright_territorial_redress_decisions
  ADD CONSTRAINT fk_copyright_territorial_redress_decisions__decided_by
  FOREIGN KEY (decided_by_id) REFERENCES retained_user_identities (id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE copyright_territorial_redress_decisions
  VALIDATE CONSTRAINT fk_copyright_territorial_redress_decisions__decided_by;

ALTER TABLE copyright_eu_supervised_complaints
  ADD CONSTRAINT fk_copyright_eu_supervised_complaints__notice
  FOREIGN KEY (copyright_notice_id, jurisdiction)
  REFERENCES copyright_notices (id, jurisdiction) ON DELETE CASCADE NOT VALID;
ALTER TABLE copyright_eu_supervised_complaints
  VALIDATE CONSTRAINT fk_copyright_eu_supervised_complaints__notice;
ALTER TABLE copyright_eu_supervised_complaints
  ADD CONSTRAINT fk_copyright_eu_supervised_complaints__recorded_by
  FOREIGN KEY (recorded_by_id) REFERENCES users (id) ON DELETE SET NULL NOT VALID;
ALTER TABLE copyright_eu_supervised_complaints
  VALIDATE CONSTRAINT fk_copyright_eu_supervised_complaints__recorded_by;

ALTER TABLE copyright_eu_dispute_settlement_referrals
  ADD CONSTRAINT fk_copyright_eu_dispute_settlement_referrals__notice
  FOREIGN KEY (copyright_notice_id, jurisdiction)
  REFERENCES copyright_notices (id, jurisdiction) ON DELETE CASCADE NOT VALID;
ALTER TABLE copyright_eu_dispute_settlement_referrals
  VALIDATE CONSTRAINT fk_copyright_eu_dispute_settlement_referrals__notice;
ALTER TABLE copyright_eu_dispute_settlement_referrals
  ADD CONSTRAINT fk_copyright_eu_dispute_settlement_referrals__referred_by
  FOREIGN KEY (referred_by_id) REFERENCES users (id) ON DELETE SET NULL NOT VALID;
ALTER TABLE copyright_eu_dispute_settlement_referrals
  VALIDATE CONSTRAINT fk_copyright_eu_dispute_settlement_referrals__referred_by;
ALTER TABLE copyright_eu_dispute_settlement_referrals
  ADD CONSTRAINT fk_copyright_eu_dispute_settlement_referrals__recorded_by
  FOREIGN KEY (recorded_by_id) REFERENCES users (id) ON DELETE SET NULL NOT VALID;
ALTER TABLE copyright_eu_dispute_settlement_referrals
  VALIDATE CONSTRAINT fk_copyright_eu_dispute_settlement_referrals__recorded_by;
ALTER TABLE copyright_eu_dispute_settlement_outcomes
  ADD CONSTRAINT fk_copyright_eu_dispute_settlement_outcomes__recorded_by
  FOREIGN KEY (recorded_by_id) REFERENCES users (id) ON DELETE SET NULL NOT VALID;
ALTER TABLE copyright_eu_dispute_settlement_outcomes
  VALIDATE CONSTRAINT fk_copyright_eu_dispute_settlement_outcomes__recorded_by;

ALTER TABLE copyright_territorial_escalations
  ADD CONSTRAINT fk_copyright_territorial_escalations__notice
  FOREIGN KEY (copyright_notice_id, jurisdiction)
  REFERENCES copyright_notices (id, jurisdiction) ON DELETE CASCADE NOT VALID;
ALTER TABLE copyright_territorial_escalations
  VALIDATE CONSTRAINT fk_copyright_territorial_escalations__notice;


CREATE INDEX IF NOT EXISTS idx_copyright_jurisdiction_policy_approvals__approved_by
  ON copyright_jurisdiction_policy_approvals (approved_by_id) WHERE approved_by_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_copyright_jurisdiction_policy_withdrawals__withdrawn_by
  ON copyright_jurisdiction_policy_withdrawals (withdrawn_by_id) WHERE withdrawn_by_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_copyright_territorial_notice_receipts__policy
  ON copyright_territorial_notice_receipts (copyright_jurisdiction_policy_approval_id, jurisdiction);
CREATE INDEX IF NOT EXISTS idx_copyright_territorial_notice_receipts__requester
  ON copyright_territorial_notice_receipts (requester_user_id) WHERE requester_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_copyright_territorial_decisions__decided_by
  ON copyright_territorial_decisions (decided_by_id) WHERE decided_by_id IS NOT NULL;
CREATE INDEX idx_copyright_territorial_decisions__assessment
  ON copyright_territorial_decisions (copyright_notice_submission_assessment_identity_id, id)
  WHERE copyright_notice_submission_assessment_identity_id IS NOT NULL;
CREATE INDEX idx_cpyrght_trrtrl_rdrss_rqsts__assessment_identity_id
  ON copyright_territorial_redress_requests(authorizing_assessment_identity_id, id)
  WHERE authorizing_assessment_identity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_copyright_territorial_redress_requests__decision
  ON copyright_territorial_redress_requests (copyright_notice_id, copyright_territorial_decision_id);
CREATE INDEX idx_copyright_territorial_redress_requests__notice_id
  ON copyright_territorial_redress_requests (copyright_notice_id, id);
CREATE INDEX IF NOT EXISTS idx_copyright_territorial_redress_requests__decision_page
  ON copyright_territorial_redress_requests (copyright_territorial_decision_id, id);
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_copyright_territorial_redress_requests__submitter
  ON copyright_territorial_redress_requests (submitted_by_id) WHERE submitted_by_id IS NOT NULL;
CREATE INDEX idx_copyright_territorial_redress_decisions__request
  ON copyright_territorial_redress_decisions(copyright_territorial_redress_request_id, id);
CREATE INDEX IF NOT EXISTS idx_copyright_territorial_redress_decisions__decided_by
  ON copyright_territorial_redress_decisions (decided_by_id) WHERE decided_by_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_copyright_eu_supervised_complaints__recorded_by
  ON copyright_eu_supervised_complaints (recorded_by_id) WHERE recorded_by_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_copyright_eu_dispute_settlement_referrals__notice
  ON copyright_eu_dispute_settlement_referrals (copyright_notice_id, jurisdiction);
CREATE INDEX IF NOT EXISTS idx_copyright_eu_dispute_settlement_referrals__notice_page
  ON copyright_eu_dispute_settlement_referrals (copyright_notice_id, id);
CREATE INDEX IF NOT EXISTS idx_copyright_eu_dispute_settlement_referrals__decision
  ON copyright_eu_dispute_settlement_referrals (copyright_notice_id, copyright_territorial_decision_id);
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_copyright_eu_dispute_settlement_referrals__referred_by
  ON copyright_eu_dispute_settlement_referrals (referred_by_id) WHERE referred_by_id IS NOT NULL;
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_copyright_eu_dispute_settlement_referrals__participant_page
  ON copyright_eu_dispute_settlement_referrals (copyright_notice_id, referred_by_id, id)
  WHERE referred_by_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_copyright_eu_dispute_settlement_referrals__recorded_by
  ON copyright_eu_dispute_settlement_referrals (recorded_by_id) WHERE recorded_by_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_copyright_eu_dispute_settlement_outcomes__recorded_by
  ON copyright_eu_dispute_settlement_outcomes (recorded_by_id) WHERE recorded_by_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_copyright_territorial_escalations__notice
  ON copyright_territorial_escalations (copyright_notice_id, jurisdiction);

CREATE OR REPLACE FUNCTION fn_reject_copyright_territorial_escalation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (
    NEW.copyright_territorial_notice_acknowledgment_id IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM copyright_territorial_notice_acknowledgments acknowledgment
      JOIN copyright_territorial_notice_receipts receipt
        ON receipt.id = acknowledgment.copyright_territorial_notice_receipt_id
      WHERE acknowledgment.id = NEW.copyright_territorial_notice_acknowledgment_id
        AND receipt.copyright_notice_id = NEW.copyright_notice_id
    )
  ) OR (
    NEW.copyright_eu_supervised_complaint_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM copyright_eu_supervised_complaints complaint
      WHERE complaint.id = NEW.copyright_eu_supervised_complaint_id
        AND complaint.copyright_notice_id = NEW.copyright_notice_id
    )
  ) THEN
    RAISE EXCEPTION 'territorial escalation source belongs to another notice'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fn_reject_copyright_territorial_retention_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND fn_project_copyright_minimal_purge_child_allowed(TG_TABLE_NAME, to_jsonb(OLD)) THEN
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND fn_copyright_retention_erasure_permitted(
    TG_TABLE_NAME, to_jsonb(OLD), to_jsonb(NEW)
  ) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME USING ERRCODE = 'check_violation';
END;
$$;

CREATE OR REPLACE FUNCTION fn_reject_copyright_territorial_acknowledgment_attempt()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF fn_project_copyright_minimal_purge_child_allowed(TG_TABLE_NAME, to_jsonb(OLD)) THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'copyright acknowledgment obligations are retained' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.copyright_territorial_notice_receipt_id IS DISTINCT FROM OLD.copyright_territorial_notice_receipt_id
    OR NEW.id IS DISTINCT FROM OLD.id
    OR NEW.attempt_count < OLD.attempt_count
    OR (OLD.acknowledged_at IS NOT NULL AND NEW.acknowledged_at IS DISTINCT FROM OLD.acknowledged_at)
    OR OLD.exhausted_at IS NOT NULL THEN
    RAISE EXCEPTION 'copyright acknowledgment history cannot be rewritten' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE FUNCTION fn_reject_invalid_copyright_territorial_decision()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.outcome = 'restrict' AND NOT EXISTS (
    SELECT 1 FROM copyright_notice_submission_assessment_identities assessment
    JOIN copyright_notice_submissions submission
      ON submission.id = assessment.copyright_notice_submission_id
    WHERE assessment.id = NEW.copyright_notice_submission_assessment_identity_id
      AND submission.copyright_notice_id = NEW.copyright_notice_id
      AND submission.kind = 'notice'
      AND submission.current_assessment_identity_id = assessment.id
      AND submission.current_assessment_is_substantially_compliant
      AND submission.current_assessed_by_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'territorial restriction requires a current compliant human notice assessment in the same case'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.supersedes_decision_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM copyright_territorial_decision_identities predecessor
    JOIN copyright_notices notice
      ON notice.id = predecessor.copyright_notice_id
    JOIN copyright_territorial_redress_requests request
      ON request.copyright_territorial_decision_id = predecessor.id
    WHERE predecessor.id = NEW.supersedes_decision_id
      AND predecessor.copyright_notice_id = NEW.copyright_notice_id
      AND predecessor.jurisdiction = NEW.jurisdiction
      AND notice.current_territorial_decision_identity_id = predecessor.id
      AND notice.territorial_decision_outcome = 'no_action'
      AND request.staff_disposition = 'revoke'
  ) THEN
    RAISE EXCEPTION 'territorial successor requires a revoked no_action decision'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE FUNCTION fn_reject_invalid_copyright_eu_dispute_settlement_outcome()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  referral_time timestamptz;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF fn_project_copyright_minimal_purge_child_allowed(TG_TABLE_NAME, to_jsonb(OLD)) THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'EU dispute settlement outcomes are retained' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    SELECT referred_at INTO referral_time FROM copyright_eu_dispute_settlement_referrals
    WHERE id = NEW.copyright_eu_dispute_settlement_referral_id;
    IF referral_time IS NULL OR NEW.decided_at < referral_time THEN
      RAISE EXCEPTION 'EU dispute settlement outcome predates referral' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  -- Account erasure may clear an audit actor without rewriting the outcome.
  IF OLD.recorded_by_id IS NOT NULL AND NEW.recorded_by_id IS NULL
    AND (to_jsonb(NEW) - 'recorded_by_id') IS NOT DISTINCT FROM (to_jsonb(OLD) - 'recorded_by_id') THEN
    RETURN NEW;
  END IF;
  IF OLD.implemented_at IS NOT NULL OR NEW.implemented_at IS NULL
    OR NEW.implemented_at < OLD.decided_at
    OR (to_jsonb(NEW) - 'implemented_at') IS DISTINCT FROM (to_jsonb(OLD) - 'implemented_at') THEN
    RAISE EXCEPTION 'EU dispute settlement outcome history cannot be rewritten'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_copyright_jurisdiction_policy_approvals_immutable
  BEFORE UPDATE OR DELETE ON copyright_jurisdiction_policy_approvals
  FOR EACH ROW EXECUTE FUNCTION fn_reject_mutation();
CREATE TRIGGER trigger_copyright_jurisdiction_policy_withdrawals_immutable
  BEFORE UPDATE OR DELETE ON copyright_jurisdiction_policy_withdrawals
  FOR EACH ROW EXECUTE FUNCTION fn_reject_mutation();
CREATE TRIGGER trigger_copyright_territorial_notice_receipts_immutable
  BEFORE UPDATE OR DELETE ON copyright_territorial_notice_receipts
  FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_territorial_retention_mutation();
CREATE TRIGGER trigger_copyright_territorial_notice_routings_immutable
  BEFORE UPDATE OR DELETE ON copyright_territorial_notice_routings
  FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_purge_only_mutation();
CREATE TRIGGER trigger_copyright_territorial_notice_acknowledgments_attempt
  BEFORE UPDATE OR DELETE ON copyright_territorial_notice_acknowledgments
  FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_territorial_acknowledgment_attempt();
CREATE TRIGGER trigger_copyright_territorial_decisions_immutable
  BEFORE UPDATE OR DELETE ON copyright_territorial_decisions
  FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_territorial_retention_mutation();
CREATE TRIGGER trigger_copyright_territorial_decisions_scope
  BEFORE INSERT ON copyright_territorial_decisions
  FOR EACH ROW EXECUTE FUNCTION fn_reject_invalid_copyright_territorial_decision();
CREATE FUNCTION fn_reject_copyright_redress_request_result()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND fn_project_copyright_minimal_purge_child_allowed(TG_TABLE_NAME, to_jsonb(OLD)) THEN RETURN OLD; END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'copyright redress requests are retained' USING ERRCODE = 'check_violation';
  END IF;
  IF fn_copyright_retention_erasure_permitted(TG_TABLE_NAME, to_jsonb(OLD), to_jsonb(NEW)) THEN RETURN NEW; END IF;
  IF (to_jsonb(OLD) - ARRAY['staff_disposition', 'current_staff_decision_identity_id',
      'decided_at', 'decided_by_id', 'rationale_ciphertext'])
    IS DISTINCT FROM
     (to_jsonb(NEW) - ARRAY['staff_disposition', 'current_staff_decision_identity_id',
      'decided_at', 'decided_by_id', 'rationale_ciphertext'])
    OR (OLD.staff_disposition IS NOT NULL AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD)) THEN
    RAISE EXCEPTION 'copyright redress request identity and final result are immutable'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
COMMENT ON FUNCTION fn_reject_copyright_redress_request_result() IS 'Preserves immutable filing evidence while allowing its single final staff result to be recorded on the owning request.';
CREATE TRIGGER trigger_copyright_territorial_redress_requests_immutable
  BEFORE UPDATE OR DELETE ON copyright_territorial_redress_requests
  FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_redress_request_result();
CREATE TRIGGER trigger_copyright_territorial_redress_decisions_immutable
  BEFORE UPDATE OR DELETE ON copyright_territorial_redress_decisions
  FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_territorial_retention_mutation();
CREATE TRIGGER trigger_copyright_eu_supervised_complaints_immutable
  BEFORE UPDATE OR DELETE ON copyright_eu_supervised_complaints
  FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_territorial_retention_mutation();
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_copyright_eu_dispute_settlement_referrals_immutable
  BEFORE UPDATE ON copyright_eu_dispute_settlement_referrals
  FOR EACH ROW EXECUTE FUNCTION fn_reject_mutation('referred_by_id', 'recorded_by_id');
CREATE TRIGGER trigger_copyright_eu_dispute_settlement_referrals_purge
  BEFORE DELETE ON copyright_eu_dispute_settlement_referrals
  FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_purge_only_mutation();
CREATE TRIGGER trigger_copyright_eu_dispute_settlement_outcomes_guard
  BEFORE INSERT OR UPDATE OR DELETE ON copyright_eu_dispute_settlement_outcomes
  FOR EACH ROW EXECUTE FUNCTION fn_reject_invalid_copyright_eu_dispute_settlement_outcome();
CREATE TRIGGER trigger_copyright_territorial_escalations_source
  BEFORE INSERT ON copyright_territorial_escalations
  FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_territorial_escalation();
CREATE TRIGGER trigger_copyright_territorial_escalations_immutable
  BEFORE UPDATE OR DELETE ON copyright_territorial_escalations
  FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_purge_only_mutation();
CREATE TRIGGER trigger_copyright_eu_transparency_reports_immutable
  BEFORE UPDATE OR DELETE ON copyright_eu_transparency_reports
  FOR EACH ROW EXECUTE FUNCTION fn_reject_mutation();


CREATE TRIGGER trigger_copyright_territorial_notice_acknowledgments_updated_at
  BEFORE UPDATE ON copyright_territorial_notice_acknowledgments
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON COLUMN copyright_territorial_notice_receipts.transparency_generation IS 'Commit-serialized aggregate generation in which this immutable reportable fact was admitted.';
CREATE INDEX idx_copyright_territorial_notice_receipts__report_generation ON copyright_territorial_notice_receipts (transparency_generation, received_at);

COMMENT ON COLUMN copyright_territorial_decisions.transparency_generation IS 'Commit-serialized aggregate generation in which this immutable reportable fact was admitted.';
CREATE INDEX idx_copyright_territorial_decisions__report_generation ON copyright_territorial_decisions (transparency_generation, decided_at);

COMMENT ON COLUMN copyright_territorial_redress_requests.transparency_generation IS 'Commit-serialized aggregate generation in which this immutable reportable fact was admitted.';
CREATE INDEX idx_copyright_territorial_redress_requests__report_generation ON copyright_territorial_redress_requests (transparency_generation, received_at);

COMMENT ON COLUMN copyright_territorial_redress_decisions.transparency_generation IS 'Commit-serialized aggregate generation in which this immutable reportable fact was admitted.';
CREATE INDEX idx_copyright_territorial_redress_decisions__report_generation ON copyright_territorial_redress_decisions (transparency_generation, decided_at);

COMMENT ON COLUMN copyright_eu_supervised_complaints.transparency_generation IS 'Commit-serialized aggregate generation in which this immutable reportable fact was admitted.';
CREATE INDEX idx_copyright_eu_supervised_complaints__report_generation ON copyright_eu_supervised_complaints (transparency_generation, received_at);

COMMENT ON COLUMN copyright_territorial_escalations.transparency_generation IS 'Commit-serialized aggregate generation in which this immutable reportable fact was admitted.';
CREATE INDEX idx_copyright_territorial_escalations__report_generation ON copyright_territorial_escalations (transparency_generation, escalated_at);

CREATE INDEX idx_copyright_eu_transparency_reports__period_generation ON copyright_eu_transparency_reports
  (period_started_at, period_ended_at, source_generation DESC, id DESC);
CREATE INDEX idx_copyright_eu_transparency_reports__previous_report_id ON copyright_eu_transparency_reports (previous_report_id) WHERE previous_report_id IS NOT NULL;
COMMENT ON COLUMN copyright_eu_transparency_reports.previous_report_id IS 'Prior immutable snapshot for this exact period; its counts survive source case erasure.';
COMMENT ON COLUMN copyright_eu_transparency_reports.source_generation IS 'Last serialized fact generation included by this cumulative six-count snapshot.';
COMMENT ON TABLE copyright_territorial_decision_identities IS 'Minimal published decision identities scoped to a case; the case owns its current result and detailed decision history expires.';
COMMENT ON COLUMN copyright_territorial_decision_identities.id IS 'Published UUIDv7 territorial decision identity.';
COMMENT ON COLUMN copyright_territorial_decision_identities.copyright_notice_id IS 'Owning EU or UK case.';
COMMENT ON COLUMN copyright_territorial_decision_identities.jurisdiction IS 'Jurisdiction of the owning case.';
COMMENT ON COLUMN copyright_territorial_decision_identities.created_at IS 'Decision identity creation time derived from its UUIDv7 id.';
COMMENT ON TABLE copyright_territorial_redress_decision_identities IS 'At most one minimal published staff decision identity per retained redress request.';
COMMENT ON COLUMN copyright_territorial_redress_decision_identities.id IS 'Published UUIDv7 staff redress decision identity.';
COMMENT ON COLUMN copyright_territorial_redress_decision_identities.copyright_territorial_redress_request_id IS 'Owning request that stores the final redress result.';
COMMENT ON COLUMN copyright_territorial_redress_decision_identities.created_at IS 'Identity creation time derived from its UUIDv7 id.';
COMMENT ON COLUMN copyright_territorial_redress_requests.challenged_decision_outcome IS 'Outcome of the challenged decision at filing, retained after detailed decision history expires.';
COMMENT ON COLUMN copyright_territorial_redress_requests.authorizing_assessment_identity_id IS 'Exact retained assessment identity that authorized the challenged restriction, when applicable.';
COMMENT ON COLUMN copyright_territorial_redress_requests.staff_disposition IS 'Final staff redress result independent of detailed review history.';
COMMENT ON COLUMN copyright_territorial_redress_requests.current_staff_decision_identity_id IS 'Published identity of the final staff redress decision.';
COMMENT ON COLUMN copyright_territorial_redress_requests.decided_at IS 'Time of the final staff redress decision.';
COMMENT ON COLUMN copyright_territorial_redress_requests.decided_by_id IS 'Retained identity of the final staff redress decider.';
COMMENT ON COLUMN copyright_territorial_redress_requests.rationale_ciphertext IS 'Encrypted final redress rationale retained with the legal request.';

CREATE INDEX idx_copyright_territorial_redress_requests__decided_by
  ON copyright_territorial_redress_requests (decided_by_id)
  WHERE decided_by_id IS NOT NULL;

CREATE INDEX idx_copyright_territorial_redress_requests__revoked_assessment
  ON copyright_territorial_redress_requests (authorizing_assessment_identity_id)
  WHERE staff_disposition = 'revoke' AND authorizing_assessment_identity_id IS NOT NULL;
COMMENT ON INDEX idx_copyright_territorial_redress_requests__revoked_assessment IS 'Exact current assessment revocation proof, including an indexed absence without scanning upheld requests or expired decision history.';

CREATE INDEX idx_copyright_territorial_decisions__retirement_time
  ON copyright_territorial_decisions (jurisdiction, decided_at);
CREATE INDEX idx_copyright_territorial_decisions__retirement_generation
  ON copyright_territorial_decisions (jurisdiction, transparency_generation);
CREATE INDEX idx_cpyrght_trrtrl_rdrss_dcsns__retirement_time
  ON copyright_territorial_redress_decisions (jurisdiction, decided_at);
CREATE INDEX idx_cpyrght_trrtrl_rdrss_dcsns__retirement_generation
  ON copyright_territorial_redress_decisions (jurisdiction, transparency_generation);
CREATE INDEX idx_copyright_eu_transparency_reports__retirement_coverage
  ON copyright_eu_transparency_reports USING gist
    (tstzrange(period_started_at, period_ended_at, '[)'), int8range(NULL, source_generation, '[]'));
COMMENT ON INDEX idx_copyright_eu_transparency_reports__retirement_coverage IS 'Indexed covering-period and generation certificate for retiring a physical month without losing unreported EU facts.';

CREATE INDEX idx_cpyrght_trrtrl_rdrss_dcsn_idntts__notice_id
  ON copyright_territorial_redress_decision_identities(copyright_notice_id, id);
CREATE INDEX idx_copyright_territorial_redress_decisions__notice_id
  ON copyright_territorial_redress_decisions(copyright_notice_id, id);
