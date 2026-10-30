-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
-- One operative incident per account per confirmed copyright notice.
-- Restoration does not clear it. A second operative incident opens a staff review
-- and does not suspend or delete the account.

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE copyright_repeat_infringer_incidents (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  account_user_id uuid NOT NULL,
  copyright_notice_id uuid NOT NULL REFERENCES copyright_notices(id) ON DELETE CASCADE,
  is_operative boolean NOT NULL,
  current_disposition copyright_repeat_infringer_disposition_kinds,
  current_disposition_recorded_at timestamptz,
  current_disposition_recorded_by_id uuid REFERENCES retained_user_identities(id) ON DELETE RESTRICT,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_copyright_incidents__id__account UNIQUE (id, account_user_id),
  CONSTRAINT uq_copyright_repeat_infringer_incidents__id__notice UNIQUE (id, copyright_notice_id),
  CONSTRAINT uq_copyrig_repeat_infringe_incident__account_user_id__notice_id UNIQUE (account_user_id, copyright_notice_id),
  CONSTRAINT chk_copyright_repeat_infringer_incidents__disposition CHECK (
    (current_disposition IS NULL AND current_disposition_recorded_at IS NULL AND current_disposition_recorded_by_id IS NULL)
    OR (current_disposition IS NOT NULL AND current_disposition_recorded_at IS NOT NULL
      AND current_disposition_recorded_by_id IS NOT NULL AND is_operative IS FALSE)
  )
);

ALTER TABLE copyright_repeat_infringer_incidents
  ADD CONSTRAINT copyright_repeat_infringer_incidents_account_user_id_fkey
  FOREIGN KEY (account_user_id)
  REFERENCES retained_user_identities(id) ON DELETE RESTRICT NOT VALID;

ALTER TABLE copyright_repeat_infringer_incidents
  VALIDATE CONSTRAINT copyright_repeat_infringer_incidents_account_user_id_fkey;

CREATE FUNCTION fn_register_copyright_repeat_infringer_retained_party()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO copyright_notice_retained_parties AS party
    (copyright_notice_identity_id, account_user_id, is_repeat_infringer_account)
  VALUES (NEW.copyright_notice_id, NEW.account_user_id, true)
  ON CONFLICT (copyright_notice_identity_id, account_user_id) DO UPDATE
    SET is_repeat_infringer_account = true
    WHERE NOT party.is_repeat_infringer_account;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trigger_register_copyright_repeat_infringer_retained_party
AFTER INSERT ON copyright_repeat_infringer_incidents FOR EACH ROW
EXECUTE FUNCTION fn_register_copyright_repeat_infringer_retained_party();

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE TRIGGER trigger_copyright_repeat_infringer_incidents_updated_at
BEFORE UPDATE ON copyright_repeat_infringer_incidents
FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_repeat_infringer_incidents__operative_account
  ON copyright_repeat_infringer_incidents (account_user_id)
  WHERE is_operative;

CREATE INDEX idx_copyright_repeat_infringer_incidents__legal_clock
  ON copyright_repeat_infringer_incidents (copyright_notice_id, updated_at DESC);
CREATE INDEX idx_copyright_repeat_infringer_incidents__notice_updated
  ON copyright_repeat_infringer_incidents (copyright_notice_id, updated_at);
CREATE INDEX idx_copyright_repeat_infringer_incidents__notice_id
  ON copyright_repeat_infringer_incidents (copyright_notice_id, id);
CREATE TRIGGER trigger_copyright_thread_party_incident
  AFTER INSERT OR UPDATE OF account_user_id ON copyright_repeat_infringer_incidents
  FOR EACH ROW EXECUTE FUNCTION fn_update_copyright_thread_party_generation();

-- Durable target provenance is required after privacy erasure removes the live placement owner.
CREATE TABLE copyright_repeat_infringer_incident_targets (
  copyright_notice_id uuid NOT NULL,
  copyright_repeat_infringer_incident_id uuid NOT NULL,
  copyright_notice_target_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (copyright_repeat_infringer_incident_id, copyright_notice_target_id),
  CONSTRAINT fk_copyr_repeat_infringe_incident_targets__incident
    FOREIGN KEY (copyright_repeat_infringer_incident_id, copyright_notice_id)
    REFERENCES copyright_repeat_infringer_incidents(id, copyright_notice_id) ON DELETE CASCADE
);

ALTER TABLE copyright_repeat_infringer_incident_targets
  ADD CONSTRAINT fk_copyr_repeat_infringe_incident_targets__target
  FOREIGN KEY (copyright_notice_id, copyright_notice_target_id)
  REFERENCES copyright_notice_targets(copyright_notice_id, id) ON DELETE CASCADE NOT VALID;

ALTER TABLE copyright_repeat_infringer_incident_targets
  VALIDATE CONSTRAINT fk_copyr_repeat_infringe_incident_targets__target;

CREATE INDEX idx_copyright_repeat_infringer_incident_targets__target
  ON copyright_repeat_infringer_incident_targets (copyright_notice_target_id);

CREATE INDEX idx_copyright_repeat_infringer_incident_targets__notice
  ON copyright_repeat_infringer_incident_targets (copyright_notice_id);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE copyright_repeat_infringer_dispositions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_repeat_infringer_incident_id uuid NOT NULL CONSTRAINT fk_copyright_repeat_infringer_dispositions__incident REFERENCES copyright_repeat_infringer_incidents(id) ON DELETE RESTRICT,
  disposition copyright_repeat_infringer_disposition_kinds NOT NULL CHECK (disposition IN ('withdrawn', 'duplicate', 'abusive')),
  rationale_ciphertext text NOT NULL CONSTRAINT chk_copyright_repeat_infringer_dispositio__rationale_ciphertext CHECK (char_length(rationale_ciphertext) BETWEEN 1 AND 65536),
  recorded_at timestamptz NOT NULL,
  recorded_by_id uuid REFERENCES retained_user_identities(id) ON DELETE RESTRICT,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL) PARTITION BY RANGE (id);

CREATE INDEX idx_copyright_repeat_infringer_dispositions__incident
  ON copyright_repeat_infringer_dispositions(copyright_repeat_infringer_incident_id, id);

CREATE TABLE copyright_repeat_infringer_review_identities (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  account_user_id uuid NOT NULL REFERENCES retained_user_identities(id) ON DELETE RESTRICT,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  CONSTRAINT uq_copyright_repeat_infringer_review_identities__account_id UNIQUE (account_user_id, id)
);
CREATE TABLE copyright_repeat_infringer_account_states (
  account_user_id uuid PRIMARY KEY REFERENCES retained_user_identities(id) ON DELETE RESTRICT,
  is_termination_in_effect boolean NOT NULL DEFAULT false,
  effective_termination_review_identity_id uuid,
  effective_termination_decided_at timestamptz,
  effective_termination_decided_by_id uuid REFERENCES retained_user_identities(id) ON DELETE RESTRICT,
  effective_termination_rationale_ciphertext text
    CHECK (char_length(effective_termination_rationale_ciphertext) BETWEEN 1 AND 65536),
  current_open_review_identity_id uuid,
  current_decided_review_identity_id uuid,
  current_outcome copyright_repeat_infringer_review_outcomes,
  current_outcome_at timestamptz,
  current_outcome_by_id uuid REFERENCES retained_user_identities(id) ON DELETE RESTRICT,
  current_outcome_rationale_ciphertext text
    CHECK (char_length(current_outcome_rationale_ciphertext) BETWEEN 1 AND 65536),
  CONSTRAINT chk_copyright_repeat_infringer_account_states__outcome CHECK (
    (current_outcome IS NULL AND current_outcome_at IS NULL AND current_outcome_by_id IS NULL
      AND current_decided_review_identity_id IS NULL AND current_outcome_rationale_ciphertext IS NULL)
    OR (current_outcome IS NOT NULL AND current_outcome_at IS NOT NULL AND current_outcome_by_id IS NOT NULL
      AND current_decided_review_identity_id IS NOT NULL AND current_outcome_rationale_ciphertext IS NOT NULL)
  ),
  CONSTRAINT chk_copyright_repeat_infringer_account_states__termination CHECK (
    (is_termination_in_effect IS FALSE AND effective_termination_review_identity_id IS NULL
      AND effective_termination_decided_at IS NULL AND effective_termination_decided_by_id IS NULL
      AND effective_termination_rationale_ciphertext IS NULL)
    OR (is_termination_in_effect IS TRUE AND effective_termination_review_identity_id IS NOT NULL
      AND effective_termination_decided_at IS NOT NULL AND effective_termination_decided_by_id IS NOT NULL
      AND effective_termination_rationale_ciphertext IS NOT NULL)
  ),
  CONSTRAINT fk_copyright_repeat_infringer_account_states__open_review
    FOREIGN KEY (account_user_id, current_open_review_identity_id)
    REFERENCES copyright_repeat_infringer_review_identities(account_user_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_copyright_repeat_infringer_account_states__decided_review
    FOREIGN KEY (account_user_id, current_decided_review_identity_id)
    REFERENCES copyright_repeat_infringer_review_identities(account_user_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_copyright_repeat_infringer_account_states__termination
    FOREIGN KEY (account_user_id, effective_termination_review_identity_id)
    REFERENCES copyright_repeat_infringer_review_identities(account_user_id, id) ON DELETE RESTRICT
);

CREATE INDEX idx_copyright_repeat_infringer_dispositions__recorded_by
  ON copyright_repeat_infringer_dispositions (recorded_by_id);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE copyright_repeat_infringer_reviews (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  account_user_id uuid NOT NULL,
  copyright_repeat_infringer_review_identity_id uuid NOT NULL,
  opened_at timestamptz NOT NULL,
  outcome copyright_repeat_infringer_review_outcomes NOT NULL CHECK (outcome IN ('warning', 'no_action', 'restrict', 'terminate', 'reinstatement')),
  outcome_at timestamptz NOT NULL,
  outcome_by_id uuid REFERENCES retained_user_identities(id) ON DELETE RESTRICT,
  rationale_ciphertext text NOT NULL CHECK (char_length(rationale_ciphertext) BETWEEN 1 AND 65536),
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_copyright_repeat_infringer_reviews__identity
    FOREIGN KEY (account_user_id, copyright_repeat_infringer_review_identity_id)
    REFERENCES copyright_repeat_infringer_review_identities(account_user_id, id) ON DELETE RESTRICT
) PARTITION BY RANGE (id);

ALTER TABLE copyright_repeat_infringer_reviews
  ADD CONSTRAINT copyright_repeat_infringer_reviews_account_user_id_fkey
  FOREIGN KEY (account_user_id)
  REFERENCES retained_user_identities(id) ON DELETE RESTRICT NOT VALID;

ALTER TABLE copyright_repeat_infringer_reviews
  VALIDATE CONSTRAINT copyright_repeat_infringer_reviews_account_user_id_fkey;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE TRIGGER trigger_copyright_repeat_infringer_reviews_updated_at
BEFORE UPDATE ON copyright_repeat_infringer_reviews
FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();


CREATE INDEX idx_copyright_repeat_infringer_reviews__account
  ON copyright_repeat_infringer_reviews (account_user_id);

CREATE INDEX idx_copyright_repeat_infringer_reviews__outcome_by
  ON copyright_repeat_infringer_reviews (outcome_by_id);

CREATE FUNCTION fn_reject_copyright_repeat_infringer_incident()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF fn_project_copyright_minimal_purge_child_allowed(TG_TABLE_NAME, to_jsonb(OLD)) THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'copyright repeat-infringer incidents are retained' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.account_user_id IS DISTINCT FROM OLD.account_user_id
    OR NEW.copyright_notice_id IS DISTINCT FROM OLD.copyright_notice_id THEN
    RAISE EXCEPTION 'copyright repeat-infringer incident identity is immutable' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_copyright_repeat_infringer_incidents_guard
  BEFORE UPDATE OR DELETE ON copyright_repeat_infringer_incidents
  FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_repeat_infringer_incident();

CREATE TRIGGER trigger_copyright_repeat_infringer_incident_targets_immutable
  BEFORE UPDATE OR DELETE ON copyright_repeat_infringer_incident_targets
  FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_notice_immutable_evidence();

CREATE TRIGGER trigger_copyright_repeat_infringer_dispositions_immutable
  BEFORE UPDATE OR DELETE ON copyright_repeat_infringer_dispositions
  FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_immutable_with_actor_erasure('recorded_by_id');

CREATE TRIGGER trigger_copyright_repeat_infringer_dispositions_actor
  BEFORE INSERT ON copyright_repeat_infringer_dispositions
  FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_human_actor('recorded_by_id');

CREATE TRIGGER trigger_copyright_repeat_infringer_reviews_guard
  BEFORE UPDATE OR DELETE ON copyright_repeat_infringer_reviews
  FOR EACH ROW EXECUTE FUNCTION fn_reject_always('completed copyright repeat-infringer review history is immutable');

COMMENT ON TABLE copyright_repeat_infringer_incidents IS 'One account incident per copyright notice. Operative means a human confirm or modify still stands and no withdrawal, duplicate, or abusive disposition exists.';
COMMENT ON COLUMN copyright_repeat_infringer_incidents.account_user_id IS 'Retained identity of the post author who owned the confirmed placement. Guest placements do not create an incident.';
COMMENT ON COLUMN copyright_repeat_infringer_incidents.copyright_notice_id IS 'Copyright notice this incident belongs to. Several targets on one notice are still one incident.';
COMMENT ON COLUMN copyright_repeat_infringer_incidents.is_operative IS 'Whether this notice still counts toward the repeat-infringer review threshold.';
COMMENT ON TABLE copyright_repeat_infringer_incident_targets IS 'Immutable target provenance tying each account incident to strike-eligible placements that may keep it operative after account erasure.';
COMMENT ON COLUMN copyright_repeat_infringer_incident_targets.copyright_notice_id IS 'Parent notice scope shared by the incident and target foreign keys.';
COMMENT ON COLUMN copyright_repeat_infringer_incident_targets.copyright_repeat_infringer_incident_id IS 'Account incident potentially supported by the target.';
COMMENT ON COLUMN copyright_repeat_infringer_incident_targets.copyright_notice_target_id IS 'Strike-eligible target whose placement belonged to the incident account when the incident was synchronized.';
COMMENT ON TABLE copyright_repeat_infringer_dispositions IS 'Staff decision that a confirmed incident no longer counts: withdrawn, duplicate, or abusive.';
COMMENT ON COLUMN copyright_repeat_infringer_dispositions.copyright_repeat_infringer_incident_id IS 'Incident this disposition removes from the operative count.';
COMMENT ON COLUMN copyright_repeat_infringer_dispositions.disposition IS 'Why the incident stopped counting. Restoration is not a disposition.';
COMMENT ON COLUMN copyright_repeat_infringer_dispositions.rationale_ciphertext IS 'Encrypted staff rationale for removing the incident.';
COMMENT ON COLUMN copyright_repeat_infringer_dispositions.recorded_at IS 'Time the moderator recorded the disposition.';
COMMENT ON COLUMN copyright_repeat_infringer_dispositions.recorded_by_id IS 'Moderator who recorded the disposition. Null after that account is erased.';
COMMENT ON TABLE copyright_repeat_infringer_reviews IS 'Required staff review opened when an account reaches two operative incidents. Opening a review does not suspend the account. Each review, including its encrypted rationale and outcome, expires six calendar years after its own latest opened_at or outcome_at activity; actor erasure does not restart retention.';
COMMENT ON COLUMN copyright_repeat_infringer_reviews.account_user_id IS 'Retained account identity whose second operative incident opened this review.';
COMMENT ON COLUMN copyright_repeat_infringer_reviews.opened_at IS 'Time the second operative incident opened the review.';
COMMENT ON COLUMN copyright_repeat_infringer_reviews.outcome IS 'Staff outcome. Null while the review is open. Restrict and terminate are applied by a later administrator action.';
COMMENT ON COLUMN copyright_repeat_infringer_reviews.outcome_at IS 'Time the moderator recorded the outcome. Null while the review is open.';
COMMENT ON COLUMN copyright_repeat_infringer_reviews.outcome_by_id IS 'Moderator who recorded the outcome. Null while the review is open, or after that account is erased.';
COMMENT ON COLUMN copyright_repeat_infringer_reviews.rationale_ciphertext IS 'Encrypted staff rationale recorded with the outcome.';

-- Current suspension authority and its two proven incident sources, rather than all living accounts.
CREATE TABLE copyright_account_suspension_reliances (
  account_user_id uuid PRIMARY KEY REFERENCES retained_user_identities(id) ON DELETE CASCADE,
  outcome copyright_repeat_infringer_review_outcomes NOT NULL CHECK (outcome IN ('restrict', 'terminate')),
  reinstated_at timestamptz,
  released_at timestamptz
);
CREATE TABLE copyright_account_suspension_incidents (
  account_user_id uuid NOT NULL REFERENCES copyright_account_suspension_reliances(account_user_id) ON DELETE CASCADE,
  copyright_repeat_infringer_incident_id uuid NOT NULL,
  PRIMARY KEY (account_user_id, copyright_repeat_infringer_incident_id),
  CONSTRAINT fk_copyright_suspension_incidents__incident FOREIGN KEY (copyright_repeat_infringer_incident_id, account_user_id)
    REFERENCES copyright_repeat_infringer_incidents(id, account_user_id) ON DELETE RESTRICT
);
CREATE INDEX idx_cpyrght_accnt_sspnsn_incdnts__incident ON copyright_account_suspension_incidents (copyright_repeat_infringer_incident_id, account_user_id);
COMMENT ON TABLE copyright_account_suspension_reliances IS 'One current copyright suspension authority per account; reinstatement permits lifting but does not release evidence while the account remains suspended.';
COMMENT ON COLUMN copyright_account_suspension_reliances.account_user_id IS 'Retained account identity whose current suspension relies on copyright evidence.';
COMMENT ON COLUMN copyright_account_suspension_reliances.outcome IS 'Current restrict or terminate decision; terminate requires formal reinstatement before unsuspension.';
COMMENT ON COLUMN copyright_account_suspension_reliances.reinstated_at IS 'Formal reinstatement authorization; evidence stays required until actual unsuspension or final account purge.';
COMMENT ON COLUMN copyright_account_suspension_reliances.released_at IS 'Actual unsuspension or final purge time; only then may provenance be drained after the case window.';
COMMENT ON TABLE copyright_account_suspension_incidents IS 'The two canonical incident sources relied on by the current suspension; replaced atomically when a later review becomes the authority.';
COMMENT ON COLUMN copyright_account_suspension_incidents.account_user_id IS 'Current suspension owner, with a real FK to its compact authority row.';
COMMENT ON COLUMN copyright_account_suspension_incidents.copyright_repeat_infringer_incident_id IS 'Actual incident evidence, with a composite FK proving the same account.';
COMMENT ON TABLE copyright_repeat_infringer_review_identities IS 'Minimal published review ids that survive pending review and detailed history retirement without authorizing account action.';
COMMENT ON COLUMN copyright_repeat_infringer_review_identities.id IS 'Published UUIDv7 review identity.';
COMMENT ON COLUMN copyright_repeat_infringer_review_identities.account_user_id IS 'Durable owning account identity.';
COMMENT ON COLUMN copyright_repeat_infringer_review_identities.created_at IS 'Review identity creation time derived from its UUIDv7 id.';
COMMENT ON TABLE copyright_repeat_infringer_account_states IS 'One authoritative current repeat-infringer state per retained account identity, independent of review history.';
COMMENT ON COLUMN copyright_repeat_infringer_account_states.account_user_id IS 'Retained account identity owning the current review and termination state.';
COMMENT ON COLUMN copyright_repeat_infringer_account_states.is_termination_in_effect IS 'Current effective termination authority, surviving unrelated later review outcomes.';
COMMENT ON COLUMN copyright_repeat_infringer_account_states.effective_termination_review_identity_id IS 'Published identity of the review currently authorizing termination.';
COMMENT ON COLUMN copyright_repeat_infringer_account_states.effective_termination_decided_at IS 'Time the effective termination was decided.';
COMMENT ON COLUMN copyright_repeat_infringer_account_states.effective_termination_decided_by_id IS 'Retained staff identity that decided the effective termination.';
COMMENT ON COLUMN copyright_repeat_infringer_account_states.current_open_review_identity_id IS 'Published identity of the one unresolved review, if any.';
COMMENT ON COLUMN copyright_repeat_infringer_account_states.current_decided_review_identity_id IS 'Published identity of the latest completed review result.';
COMMENT ON COLUMN copyright_repeat_infringer_account_states.current_outcome IS 'Latest completed review result, retained after detailed history expires.';
COMMENT ON COLUMN copyright_repeat_infringer_account_states.current_outcome_at IS 'Time the latest completed review result was decided.';
COMMENT ON COLUMN copyright_repeat_infringer_account_states.current_outcome_by_id IS 'Retained staff identity that decided the latest result.';
COMMENT ON COLUMN copyright_repeat_infringer_incidents.current_disposition IS 'Current staff disposition making this incident inoperative.';
COMMENT ON COLUMN copyright_repeat_infringer_incidents.current_disposition_recorded_at IS 'Time the current incident disposition was recorded.';
COMMENT ON COLUMN copyright_repeat_infringer_incidents.current_disposition_recorded_by_id IS 'Retained staff identity that recorded the current incident disposition.';
COMMENT ON COLUMN copyright_repeat_infringer_reviews.copyright_repeat_infringer_review_identity_id IS 'Published review identity distinct from this completed history event id.';

COMMENT ON COLUMN copyright_repeat_infringer_account_states.current_outcome_rationale_ciphertext IS 'Encrypted explanation of the current staff result, retained independently of finite detailed review history.';
COMMENT ON COLUMN copyright_repeat_infringer_account_states.effective_termination_rationale_ciphertext IS 'Encrypted explanation of the effective termination; later warnings preserve it and only explicit reinstatement clears it.';

CREATE INDEX idx_cpyrght_rpt_infrngr_incdnts__disposition_recorded_by
  ON copyright_repeat_infringer_incidents (current_disposition_recorded_by_id)
  WHERE current_disposition_recorded_by_id IS NOT NULL;

CREATE INDEX idx_cpyrght_rpt_infrngr_accnt_stts__termination_decided_by
  ON copyright_repeat_infringer_account_states (effective_termination_decided_by_id)
  WHERE effective_termination_decided_by_id IS NOT NULL;

CREATE INDEX idx_cpyrght_rpt_infrngr_accnt_stts__current_outcome_by
  ON copyright_repeat_infringer_account_states (current_outcome_by_id)
  WHERE current_outcome_by_id IS NOT NULL;
