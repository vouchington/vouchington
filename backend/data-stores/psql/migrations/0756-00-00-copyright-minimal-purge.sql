CREATE FUNCTION fn_project_copyright_minimal_record_legal_clock(target_notice_id uuid, complaint_window_months integer)
RETURNS timestamptz LANGUAGE sql STABLE AS $$
  SELECT GREATEST(
    notice.created_at,
    (SELECT erased.legal_clock_at FROM copyright_notice_retention_erasures erased
      WHERE erased.copyright_notice_id = notice.id),
    notice.last_substantive_lifecycle_activity_at,
    (SELECT GREATEST(uuid_extract_timestamp(work.id), work.sent_at, work.bounced_at)
      FROM copyright_notice_delivery_work_items work
      WHERE work.copyright_notice_id = notice.id
      ORDER BY GREATEST(uuid_extract_timestamp(work.id), work.sent_at, work.bounced_at) DESC LIMIT 1),
    (SELECT incident.updated_at FROM copyright_repeat_infringer_incidents incident
      WHERE incident.copyright_notice_id = notice.id ORDER BY incident.updated_at DESC LIMIT 1),
    (SELECT capability.created_at FROM copyright_notice_guest_capabilities capability
      WHERE capability.copyright_notice_id = notice.id ORDER BY capability.id DESC LIMIT 1),
    (SELECT COALESCE(capability.revoked_at, capability.expires_at)
      FROM copyright_notice_guest_capabilities capability
      WHERE capability.copyright_notice_id = notice.id
      ORDER BY COALESCE(capability.revoked_at, capability.expires_at) DESC LIMIT 1),
    (notice.territorial_decided_at AT TIME ZONE 'UTC' + make_interval(months => complaint_window_months)) AT TIME ZONE 'UTC',
    (SELECT (work.sent_at AT TIME ZONE 'UTC' + make_interval(months => complaint_window_months)) AT TIME ZONE 'UTC'
      FROM copyright_notice_delivery_work_items work
      WHERE work.copyright_notice_id = notice.id AND work.state = 'sent'
        AND work.delivery_kind IN ('poster_restriction_notice', 'claimant_decision_notice')
      ORDER BY work.sent_at DESC LIMIT 1),
    (SELECT request.decided_at FROM copyright_territorial_redress_requests request
      WHERE request.copyright_notice_id = notice.id ORDER BY request.decided_at DESC NULLS LAST LIMIT 1),
    (SELECT GREATEST(outcome.decided_at, outcome.implemented_at) FROM copyright_eu_dispute_settlement_referrals referral
      JOIN copyright_eu_dispute_settlement_outcomes outcome ON outcome.copyright_eu_dispute_settlement_referral_id = referral.id
      WHERE referral.copyright_notice_id = notice.id ORDER BY GREATEST(outcome.decided_at, outcome.implemented_at) DESC LIMIT 1),
    (SELECT closure.closed_at FROM copyright_territorial_escalations escalation
      JOIN copyright_territorial_escalation_closures closure ON closure.copyright_territorial_escalation_id = escalation.id
      WHERE escalation.copyright_notice_id = notice.id ORDER BY closure.closed_at DESC LIMIT 1),
    (SELECT resolution.resolved_at FROM copyright_eu_supervised_complaints complaint
      JOIN copyright_eu_supervised_complaint_resolutions resolution ON resolution.copyright_eu_supervised_complaint_id = complaint.id
      WHERE complaint.copyright_notice_id = notice.id ORDER BY resolution.resolved_at DESC LIMIT 1),
    (SELECT hold.released_at FROM copyright_case_preservation_holds hold
      WHERE hold.copyright_notice_id = notice.id AND hold.released_at IS NOT NULL ORDER BY hold.released_at DESC LIMIT 1),
    (SELECT restriction.lifted_at FROM copyright_restrictions restriction
      WHERE restriction.copyright_notice_id = notice.id AND restriction.lifted_at IS NOT NULL ORDER BY restriction.lifted_at DESC LIMIT 1),
    identity.dsa_activity_at,
    identity.email_activity_at,
    (SELECT link.correspondence_reviewed_at FROM copyright_notice_email_intake_notice_links link
      WHERE link.copyright_notice_id = notice.id AND link.correspondence_reviewed_at IS NOT NULL
      ORDER BY link.correspondence_reviewed_at DESC LIMIT 1)
  ) FROM copyright_notices notice
  JOIN copyright_notice_retained_identities identity ON identity.id = notice.id
  WHERE notice.id = target_notice_id
$$;


-- Canonical pre-launch copyright minimal-record purge predicate and finite-case guard.
-- Defined after every legal and notification receipt table it references.

CREATE TABLE copyright_legal_mutation_sequence_states (
  is_singleton boolean PRIMARY KEY DEFAULT true CHECK (is_singleton),
  current_sequence bigint NOT NULL DEFAULT 0 CHECK (current_sequence >= 0),
  transparency_generation bigint NOT NULL DEFAULT 0 CHECK (transparency_generation >= 0),
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO copyright_legal_mutation_sequence_states (is_singleton) VALUES (true);
CREATE TRIGGER trigger_copyright_legal_mutation_sequence_states_updated_at
BEFORE UPDATE ON copyright_legal_mutation_sequence_states FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();
COMMENT ON TABLE copyright_legal_mutation_sequence_states IS 'Transactional commit-order fence for bounded copyright party proof; it contains no user or case payload.';
COMMENT ON COLUMN copyright_legal_mutation_sequence_states.is_singleton IS 'Identifies the one row that serializes legal-retention mutation sequence allocation.';
COMMENT ON COLUMN copyright_legal_mutation_sequence_states.current_sequence IS 'Commit-order sequence for preservation-hold changes and final account purges, used to invalidate stale party proofs.';
CREATE FUNCTION fn_register_copyright_legal_mutation_sequence()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  target_user_id uuid;
  assigned_sequence bigint;
BEGIN
  IF TG_TABLE_NAME = 'retained_user_identities' THEN
    IF OLD.purged_at IS NOT NULL OR NEW.purged_at IS NULL THEN RETURN NEW; END IF;
    target_user_id := NEW.id;
  ELSE
    target_user_id := NEW.account_user_id;
  END IF;
  UPDATE copyright_legal_mutation_sequence_states
    SET current_sequence = current_sequence + 1 WHERE is_singleton
    RETURNING current_sequence INTO assigned_sequence;
  UPDATE retained_user_identities
    SET legal_retention_mutation_sequence = assigned_sequence,
      last_copyright_suspension_released_at = GREATEST(last_copyright_suspension_released_at,
        CASE WHEN TG_TABLE_NAME = 'copyright_account_suspension_reliances'
          THEN (to_jsonb(NEW)->>'released_at')::timestamptz END),
      last_preservation_hold_released_at = GREATEST(last_preservation_hold_released_at,
        CASE WHEN TG_TABLE_NAME = 'user_legal_preservation_holds'
          THEN (to_jsonb(NEW)->>'released_at')::timestamptz END)
    WHERE id = target_user_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trigger_register_copyright_hold_mutation_sequence
AFTER INSERT OR UPDATE OF released_at ON user_legal_preservation_holds
FOR EACH ROW EXECUTE FUNCTION fn_register_copyright_legal_mutation_sequence();
CREATE TRIGGER trigger_register_copyright_account_purge_sequence
AFTER UPDATE OF purged_at ON retained_user_identities FOR EACH ROW
EXECUTE FUNCTION fn_register_copyright_legal_mutation_sequence();

-- Negative blocker proofs start at the case and probe only live work.
CREATE INDEX idx_copyright_repeat_infringer_incidents__purge_operative
  ON copyright_repeat_infringer_incidents(copyright_notice_id) WHERE is_operative;
CREATE INDEX idx_copyright_restrictions__purge_active
  ON copyright_restrictions(copyright_notice_id) WHERE lifted_at IS NULL;
CREATE INDEX idx_copyright_notice_deadlines__purge_open
  ON copyright_notice_deadlines(copyright_notice_id)
  WHERE resolved_at IS NULL AND cancelled_at IS NULL;
CREATE INDEX idx_copyright_notice_delivery_work_items__purge_pending
  ON copyright_notice_delivery_work_items(copyright_notice_id)
  WHERE state IN ('pending', 'claimed');
CREATE INDEX idx_copyright_notice_action_work_items__purge_failed
  ON copyright_notice_action_work_items(copyright_notice_id) WHERE state = 'failed';

CREATE FUNCTION fn_lock_copyright_dsa_statement_notice()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM notice.id FROM copyright_restrictions restriction
  JOIN copyright_notices notice ON notice.id = restriction.copyright_notice_id
  WHERE restriction.id = NEW.copyright_restriction_id FOR UPDATE OF notice;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trigger_lock_copyright_dsa_statement_notice
BEFORE INSERT ON copyright_dsa_statement_submissions FOR EACH ROW
EXECUTE FUNCTION fn_lock_copyright_dsa_statement_notice();
CREATE FUNCTION fn_register_copyright_dsa_statement_count()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_notice_id uuid;
BEGIN
  SELECT restriction.copyright_notice_id INTO target_notice_id
  FROM copyright_restrictions restriction
  WHERE restriction.id = CASE WHEN TG_OP = 'DELETE' THEN OLD.copyright_restriction_id
    ELSE NEW.copyright_restriction_id END;
  UPDATE copyright_notice_retained_identities identity
    SET dsa_statement_count = dsa_statement_count + CASE WHEN TG_OP = 'DELETE' THEN -1 ELSE 1 END,
      proof_generation = proof_generation + CASE WHEN TG_OP = 'INSERT' THEN 1 ELSE 0 END
    WHERE identity.id = target_notice_id;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trigger_register_copyright_dsa_statement_count
AFTER INSERT OR DELETE ON copyright_dsa_statement_submissions FOR EACH ROW
EXECUTE FUNCTION fn_register_copyright_dsa_statement_count();

-- Only externally admitted semantic writes invalidate the finite case blocker
-- proof. Staged legal-record DELETEs do not fire these INSERT/UPDATE triggers,
-- so a large case keeps making progress while its expired history is drained.
CREATE FUNCTION fn_register_copyright_minimal_blocker_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  source_row jsonb := to_jsonb(NEW);
  target_notice_id uuid;
BEGIN
  CASE TG_ARGV[0]
    WHEN 'direct' THEN
      target_notice_id := (source_row->>'copyright_notice_id')::uuid;
    WHEN 'intake' THEN
      SELECT intake.copyright_notice_id INTO target_notice_id
      FROM copyright_notice_form_intakes intake
      WHERE intake.id = (source_row->>'copyright_notice_form_intake_id')::uuid;
    WHEN 'submission' THEN
      SELECT submission.copyright_notice_id INTO target_notice_id
      FROM copyright_notice_submissions submission
      WHERE submission.id = (source_row->>'copyright_notice_submission_id')::uuid;
    WHEN 'redress_request' THEN
      SELECT request.copyright_notice_id INTO target_notice_id
      FROM copyright_territorial_redress_requests request
      WHERE request.id = (source_row->>'copyright_territorial_redress_request_id')::uuid;
    WHEN 'restriction' THEN
      SELECT restriction.copyright_notice_id INTO target_notice_id
      FROM copyright_restrictions restriction
      WHERE restriction.id = (source_row->>'copyright_restriction_id')::uuid;
    WHEN 'staydown_entry' THEN
      SELECT restriction.copyright_notice_id INTO target_notice_id
      FROM copyright_staydown_entries entry
      JOIN copyright_restrictions restriction ON restriction.id = entry.copyright_restriction_id
      WHERE entry.id = (source_row->>'copyright_staydown_entry_id')::uuid;
    WHEN 'territorial_acknowledgment' THEN
      SELECT receipt.copyright_notice_id INTO target_notice_id
      FROM copyright_territorial_notice_acknowledgments acknowledgment
      JOIN copyright_territorial_notice_receipts receipt ON receipt.id = acknowledgment.copyright_territorial_notice_receipt_id
      WHERE acknowledgment.id = (source_row->>'copyright_territorial_escalation_id')::uuid;
    WHEN 'escalation' THEN
      SELECT copyright_notice_id INTO target_notice_id FROM copyright_territorial_escalations
      WHERE id = (source_row->>'copyright_territorial_escalation_id')::uuid;
    WHEN 'supervised_complaint' THEN
      SELECT copyright_notice_id INTO target_notice_id FROM copyright_eu_supervised_complaints
      WHERE id = (source_row->>'copyright_eu_supervised_complaint_id')::uuid;
    WHEN 'dispute_referral' THEN
      SELECT copyright_notice_id INTO target_notice_id FROM copyright_eu_dispute_settlement_referrals
      WHERE id = (source_row->>'copyright_eu_dispute_settlement_referral_id')::uuid;
    WHEN 'territorial_receipt' THEN
      SELECT copyright_notice_id INTO target_notice_id FROM copyright_territorial_notice_receipts
      WHERE id = (source_row->>'copyright_territorial_notice_receipt_id')::uuid;
    WHEN 'dsa_submission' THEN
      SELECT restriction.copyright_notice_id INTO target_notice_id
      FROM copyright_dsa_statement_submissions submission
      JOIN copyright_restrictions restriction ON restriction.id = submission.copyright_restriction_id
      WHERE submission.id = (source_row->>'copyright_dsa_statement_submission_id')::uuid;
    WHEN 'delivery_work' THEN
      SELECT work.copyright_notice_id INTO target_notice_id
      FROM copyright_notice_delivery_work_items work
      WHERE work.id = (source_row->>'copyright_notice_delivery_work_item_id')::uuid;
    WHEN 'target' THEN
      SELECT target.copyright_notice_id INTO target_notice_id
      FROM copyright_notice_targets target
      WHERE target.id = (source_row->>'copyright_notice_target_id')::uuid;
    ELSE
      RAISE EXCEPTION 'Unknown copyright blocker mutation owner path' USING ERRCODE = 'check_violation';
  END CASE;
  IF target_notice_id IS NOT NULL THEN
    -- Writers may already hold the case FK's KEY SHARE lock. Keep that mode to
    -- avoid concurrent FK-to-UPDATE upgrades; purge's FOR UPDATE still fences
    -- admission, and the retained-identity update serializes proof generations.
    PERFORM id FROM copyright_notices WHERE id = target_notice_id FOR KEY SHARE;
    IF NOT FOUND OR EXISTS (SELECT 1 FROM copyright_notice_retention_erasures
      WHERE copyright_notice_id = target_notice_id)
      OR EXISTS (SELECT 1 FROM copyright_notice_minimal_purge_continuations
        WHERE copyright_notice_identity_id = target_notice_id AND erasure_started_at IS NOT NULL) THEN
      RAISE EXCEPTION 'copyright case has expired' USING ERRCODE = 'check_violation';
    END IF;
    UPDATE copyright_notice_retained_identities
      SET proof_generation = proof_generation + 1 WHERE id = target_notice_id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trigger_register_copy_blocker_submission
BEFORE INSERT ON copyright_notice_submissions FOR EACH ROW
EXECUTE FUNCTION fn_register_copyright_minimal_blocker_mutation('direct');
CREATE TRIGGER trigger_register_copy_blocker_target
BEFORE INSERT ON copyright_notice_targets FOR EACH ROW
EXECUTE FUNCTION fn_register_copyright_minimal_blocker_mutation('direct');
CREATE TRIGGER trigger_register_copy_blocker_target_image
BEFORE INSERT ON copyright_notice_target_images FOR EACH ROW
EXECUTE FUNCTION fn_register_copyright_minimal_blocker_mutation('target');
CREATE TRIGGER trigger_register_copy_blocker_form_intake
BEFORE INSERT ON copyright_notice_form_intakes FOR EACH ROW
EXECUTE FUNCTION fn_register_copyright_minimal_blocker_mutation('direct');
CREATE TRIGGER trigger_register_copy_blocker_form_review
BEFORE INSERT ON copyright_notice_form_intake_reviews FOR EACH ROW
EXECUTE FUNCTION fn_register_copyright_minimal_blocker_mutation('intake');
CREATE TRIGGER trigger_register_copy_blocker_form_attempt
BEFORE INSERT OR UPDATE OF completed_at, failed_at, copyright_notice_form_screening_id
ON copyright_notice_form_screening_attempts FOR EACH ROW
EXECUTE FUNCTION fn_register_copyright_minimal_blocker_mutation('intake');
CREATE TRIGGER trigger_register_copy_blocker_assessment
BEFORE INSERT ON copyright_notice_submission_assessments FOR EACH ROW
EXECUTE FUNCTION fn_register_copyright_minimal_blocker_mutation('direct');
CREATE TRIGGER trigger_register_copy_blocker_appeal_review
BEFORE INSERT ON copyright_notice_appeal_reviews FOR EACH ROW
EXECUTE FUNCTION fn_register_copyright_minimal_blocker_mutation('submission');
CREATE TRIGGER trigger_register_copy_blocker_counter_review
BEFORE INSERT ON copyright_notice_counter_notice_reviews FOR EACH ROW
EXECUTE FUNCTION fn_register_copyright_minimal_blocker_mutation('submission');
CREATE TRIGGER trigger_register_copy_blocker_hold_assessment
BEFORE INSERT ON copyright_notice_legal_hold_assessments FOR EACH ROW
EXECUTE FUNCTION fn_register_copyright_minimal_blocker_mutation('direct');
CREATE TRIGGER trigger_register_copy_blocker_hold_resolution
BEFORE INSERT ON copyright_notice_legal_hold_resolutions FOR EACH ROW
EXECUTE FUNCTION fn_register_copyright_minimal_blocker_mutation('direct');
CREATE TRIGGER trigger_register_copy_blocker_delivery_work
BEFORE INSERT OR UPDATE OF recipient_role, channel, delivery_kind
ON copyright_notice_delivery_work_items FOR EACH ROW
EXECUTE FUNCTION fn_register_copyright_minimal_blocker_mutation('direct');
CREATE TRIGGER trigger_register_copy_blocker_delivery_recipient
BEFORE INSERT ON copyright_notice_delivery_recipients FOR EACH ROW
EXECUTE FUNCTION fn_register_copyright_minimal_blocker_mutation('delivery_work');
CREATE TRIGGER trigger_register_copy_blocker_restriction
BEFORE INSERT OR UPDATE OF lifted_at ON copyright_restrictions FOR EACH ROW
EXECUTE FUNCTION fn_register_copyright_minimal_blocker_mutation('direct');
CREATE TRIGGER trigger_register_copy_blocker_staydown_entry
BEFORE INSERT ON copyright_staydown_entries FOR EACH ROW
EXECUTE FUNCTION fn_register_copyright_minimal_blocker_mutation('restriction');
CREATE TRIGGER trigger_register_copy_blocker_staydown_match
BEFORE INSERT OR UPDATE OF reviewed_at ON copyright_staydown_matches FOR EACH ROW
EXECUTE FUNCTION fn_register_copyright_minimal_blocker_mutation('staydown_entry');
CREATE TRIGGER trigger_register_copy_blocker_territorial_receipt
BEFORE INSERT ON copyright_territorial_notice_receipts FOR EACH ROW
EXECUTE FUNCTION fn_register_copyright_minimal_blocker_mutation('direct');
CREATE TRIGGER trigger_register_copy_blocker_territorial_decision
BEFORE INSERT ON copyright_territorial_decisions FOR EACH ROW
EXECUTE FUNCTION fn_register_copyright_minimal_blocker_mutation('direct');
CREATE TRIGGER trigger_register_copy_blocker_redress_request
BEFORE INSERT ON copyright_territorial_redress_requests FOR EACH ROW
EXECUTE FUNCTION fn_register_copyright_minimal_blocker_mutation('direct');
CREATE TRIGGER trigger_register_copy_blocker_redress_decision
BEFORE INSERT ON copyright_territorial_redress_decisions FOR EACH ROW
EXECUTE FUNCTION fn_register_copyright_minimal_blocker_mutation('redress_request');
CREATE TRIGGER trigger_register_copy_blocker_email_correspondence
BEFORE INSERT ON copyright_notice_email_correspondence_reviews FOR EACH ROW
EXECUTE FUNCTION fn_register_copyright_minimal_blocker_mutation('direct');

CREATE TRIGGER trigger_register_copy_blocker_lifecycle
BEFORE INSERT ON copyright_notice_lifecycle_changes FOR EACH ROW
EXECUTE FUNCTION fn_register_copyright_minimal_blocker_mutation('direct');
CREATE TRIGGER trigger_register_copy_blocker_artifact
BEFORE INSERT ON copyright_notice_evidence_artifacts FOR EACH ROW
EXECUTE FUNCTION fn_register_copyright_minimal_blocker_mutation('direct');
CREATE TRIGGER trigger_register_copy_blocker_escalation
BEFORE INSERT ON copyright_territorial_escalations FOR EACH ROW
EXECUTE FUNCTION fn_register_copyright_minimal_blocker_mutation('direct');
CREATE TRIGGER trigger_register_copy_blocker_escalation_closure
BEFORE INSERT ON copyright_territorial_escalation_closures FOR EACH ROW
EXECUTE FUNCTION fn_register_copyright_minimal_blocker_mutation('escalation');
CREATE TRIGGER trigger_register_copy_blocker_supervised
BEFORE INSERT ON copyright_eu_supervised_complaints FOR EACH ROW
EXECUTE FUNCTION fn_register_copyright_minimal_blocker_mutation('direct');
CREATE TRIGGER trigger_register_copy_blocker_supervised_resolution
BEFORE INSERT ON copyright_eu_supervised_complaint_resolutions FOR EACH ROW
EXECUTE FUNCTION fn_register_copyright_minimal_blocker_mutation('supervised_complaint');
CREATE TRIGGER trigger_register_copy_blocker_dispute_referral
BEFORE INSERT ON copyright_eu_dispute_settlement_referrals FOR EACH ROW
EXECUTE FUNCTION fn_register_copyright_minimal_blocker_mutation('direct');
CREATE TRIGGER trigger_register_copy_blocker_dispute_outcome
BEFORE INSERT OR UPDATE OF implemented_at ON copyright_eu_dispute_settlement_outcomes FOR EACH ROW
EXECUTE FUNCTION fn_register_copyright_minimal_blocker_mutation('dispute_referral');
CREATE TRIGGER trigger_register_copy_blocker_case_preservation
BEFORE INSERT OR UPDATE OF released_at ON copyright_case_preservation_holds FOR EACH ROW
EXECUTE FUNCTION fn_register_copyright_minimal_blocker_mutation('direct');
CREATE TRIGGER trigger_register_copy_blocker_territorial_acknowledgment
BEFORE INSERT OR UPDATE OF acknowledged_at, exhausted_at, last_attempt_at ON copyright_territorial_notice_acknowledgments FOR EACH ROW
EXECUTE FUNCTION fn_register_copyright_minimal_blocker_mutation('territorial_receipt');
CREATE TRIGGER trigger_register_copy_blocker_dsa_submission
BEFORE INSERT OR UPDATE OF submitted_at, failed_at, lease_token ON copyright_dsa_statement_submissions FOR EACH ROW
EXECUTE FUNCTION fn_register_copyright_minimal_blocker_mutation('restriction');
CREATE TRIGGER trigger_register_copy_blocker_dsa_attempt
BEFORE INSERT ON copyright_dsa_statement_submission_attempts FOR EACH ROW
EXECUTE FUNCTION fn_register_copyright_minimal_blocker_mutation('dsa_submission');

CREATE FUNCTION fn_project_copyright_case_retention_eligible(
  target_notice_id uuid, purge_now timestamptz, cutoff timestamptz, retention_months integer, complaint_window_months integer
) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM copyright_notices notice
    JOIN copyright_notice_minimal_purge_continuations work
      ON work.copyright_notice_identity_id = notice.id
    JOIN copyright_notice_retained_identities identity ON identity.id = notice.id
    JOIN copyright_legal_mutation_sequence_states mutation_state ON mutation_state.is_singleton
    WHERE notice.id = target_notice_id
      AND notice.jurisdiction IN ('us_dmca', 'eu_dsa', 'uk')
      AND purge_now IS NOT NULL AND cutoff IS NOT NULL
      AND retention_months BETWEEN 1 AND 1200 AND complaint_window_months BETWEEN 1 AND 120
      AND cutoff <= (purge_now AT TIME ZONE 'UTC' - make_interval(months => retention_months)) AT TIME ZONE 'UTC'
      AND work.is_party_scan_complete
      AND work.is_blocker_scan_complete AND NOT work.has_blocker
      AND work.proof_generation = identity.proof_generation
      AND work.blocker_transparency_generation = mutation_state.transparency_generation
      AND work.blocker_complaint_window_months = complaint_window_months
      AND work.mutation_cursor = mutation_state.current_sequence
      AND work.open_hold_count = 0
      AND work.suspension_reliance_count = 0
      AND NOT EXISTS (
        SELECT 1 FROM copyright_repeat_infringer_incidents incident
        WHERE incident.copyright_notice_id = notice.id AND incident.is_operative
      )
      AND NOT EXISTS (
        SELECT 1 FROM copyright_restrictions restriction
        WHERE restriction.copyright_notice_id = notice.id AND restriction.lifted_at IS NULL
      )
      AND NOT EXISTS (SELECT 1 FROM copyright_notice_deadlines deadline
        WHERE deadline.copyright_notice_id = notice.id
          AND deadline.resolved_at IS NULL AND deadline.cancelled_at IS NULL)
      AND NOT EXISTS (SELECT 1 FROM copyright_notice_delivery_work_items work
        WHERE work.copyright_notice_id = notice.id AND work.state IN ('pending', 'claimed'))
      AND NOT EXISTS (SELECT 1 FROM copyright_notice_guest_capabilities capability
        WHERE capability.copyright_notice_id = notice.id
          AND capability.revoked_at IS NULL AND capability.expires_at > purge_now)
      AND NOT EXISTS (
        SELECT 1 FROM copyright_notice_action_work_items work
        WHERE work.copyright_notice_id = notice.id AND work.state = 'failed'
      )
      AND ((GREATEST(
        fn_project_copyright_minimal_record_legal_clock(notice.id, complaint_window_months),
        work.legal_clock_at, work.party_legal_clock_at
      ) AT TIME ZONE 'UTC') + make_interval(months => retention_months)) AT TIME ZONE 'UTC'
        <= LEAST(purge_now, ((cutoff AT TIME ZONE 'UTC') + make_interval(months => retention_months)) AT TIME ZONE 'UTC')
  )
$$;

-- Every case-owned descendant except the two DSA blocker tables and two fixed
-- companions appears below. The authoritative eligibility predicate excludes
-- DSA cases; one rationale per lifecycle change and one erasure marker per
-- notice may cascade only with their already bounded parent deletion.
-- Exactly one submission can be held by the notice's current territorial authority.
CREATE FUNCTION fn_project_copyright_minimal_purge_current_submission(target_notice_id uuid)
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT authority.copyright_notice_submission_id FROM copyright_notices notice
  JOIN copyright_notice_submission_assessment_identities authority
    ON authority.id = notice.territorial_authorizing_assessment_identity_id
  WHERE notice.id = target_notice_id
$$;
COMMENT ON FUNCTION fn_project_copyright_minimal_purge_current_submission IS 'Identifies the single submission retained until the atomic current-owner tail; other submissions drain in capped pages.';

CREATE FUNCTION fn_project_copyright_minimal_purge_children_drained(target_notice_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT true
    AND NOT EXISTS (SELECT 1 FROM copyright_decision_rationales child WHERE child.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_notice_operational_retention_cursors cursor
      JOIN copyright_notice_submission_assessment_identities assessment
        ON assessment.id = cursor.cursor_blocker_assessment_identity_id
      WHERE assessment.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_notice_guest_capability_identities child WHERE child.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_notice_email_thread_retirements child WHERE child.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_notice_submission_assessment_identities child
      WHERE child.copyright_notice_id = target_notice_id AND NOT EXISTS (
        SELECT 1 FROM copyright_notices notice
        WHERE notice.id = target_notice_id AND (notice.territorial_authorizing_assessment_identity_id = child.id
          OR EXISTS (SELECT 1 FROM copyright_notice_submissions submission
            WHERE submission.id = fn_project_copyright_minimal_purge_current_submission(target_notice_id)
              AND submission.current_assessment_identity_id = child.id))))
    AND NOT EXISTS (SELECT 1 FROM copyright_territorial_decision_identities child
      WHERE child.copyright_notice_id = target_notice_id AND NOT EXISTS (
        SELECT 1 FROM copyright_notices notice WHERE notice.id = target_notice_id
          AND notice.current_territorial_decision_identity_id = child.id))
    AND NOT EXISTS (SELECT 1 FROM copyright_territorial_redress_decision_identities child WHERE child.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_notice_email_intake_reviews child
      WHERE child.promoted_copyright_notice_identity_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_notice_replay_receipts child WHERE child.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_account_suspension_incidents child JOIN copyright_repeat_infringer_incidents incident ON incident.id = child.copyright_repeat_infringer_incident_id WHERE incident.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_notice_encryption_keys child WHERE child.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_case_preservation_holds child WHERE child.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_territorial_escalation_closures child
      JOIN copyright_territorial_escalations parent ON parent.id = child.copyright_territorial_escalation_id
      WHERE parent.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_eu_supervised_complaint_resolutions child
      JOIN copyright_eu_supervised_complaints parent ON parent.id = child.copyright_eu_supervised_complaint_id
      WHERE parent.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_dsa_statement_submissions submission
      JOIN copyright_restrictions restriction ON restriction.id = submission.copyright_restriction_id
      WHERE restriction.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_automatic_withholding_refusals child
      JOIN copyright_notice_submissions p0 ON child.copyright_notice_submission_id = p0.id
      WHERE p0.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_claimant_misuse_events child

      WHERE child.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_claimant_suspension_reversals child
      JOIN copyright_restrictions p0 ON child.copyright_restriction_id = p0.id
      WHERE p0.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_eu_dispute_settlement_outcomes child
      JOIN copyright_eu_dispute_settlement_referrals p0 ON child.copyright_eu_dispute_settlement_referral_id = p0.id
      WHERE p0.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_eu_dispute_settlement_referrals child

      WHERE child.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_eu_supervised_complaints child

      WHERE child.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_legal_hold_restrictions child
      JOIN copyright_restrictions p0 ON child.copyright_restriction_id = p0.id
      WHERE p0.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_notice_action_attempt_results child
      JOIN copyright_notice_action_attempts p0 ON child.attempt_id = p0.id JOIN copyright_notice_action_work_items p1 ON p0.work_item_id = p1.id
      WHERE p1.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_notice_action_attempts child
      JOIN copyright_notice_action_work_items p0 ON child.work_item_id = p0.id
      WHERE p0.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_notice_action_work_items child

      WHERE child.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_notice_appeal_recommendations child
      JOIN copyright_notice_submissions p0 ON child.copyright_notice_submission_id = p0.id
      WHERE p0.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_notice_appeal_reviews child
      JOIN copyright_restrictions p0 ON child.copyright_restriction_id = p0.id
      WHERE p0.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_notice_correspondence_messages child

      WHERE child.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_notice_counter_notice_assessment_targets child

      WHERE child.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_notice_counter_notice_reviews child
      JOIN copyright_notice_submission_assessment_identities p0 ON child.copyright_notice_submission_assessment_identity_id = p0.id
      WHERE p0.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_notice_deadlines child

      WHERE child.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_notice_delivery_attempt_results child
      JOIN copyright_notice_delivery_attempts p0 ON child.attempt_id = p0.id JOIN copyright_notice_delivery_work_items p1 ON p0.work_item_id = p1.id
      WHERE p1.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_notice_delivery_attempts child
      JOIN copyright_notice_delivery_work_items p0 ON child.work_item_id = p0.id
      WHERE p0.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_notice_delivery_recipients child
      JOIN copyright_notice_delivery_work_items p0 ON child.copyright_notice_delivery_work_item_id = p0.id
      WHERE p0.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_notice_delivery_work_items child

      WHERE child.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_notice_email_correspondence_reviews child

      WHERE child.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_notice_email_intake_notice_links child

      WHERE child.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_notice_evidence_artifacts child

      WHERE child.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_notice_form_intake_reviews child
      JOIN copyright_notice_form_intakes p0 ON child.copyright_notice_form_intake_id = p0.id
      WHERE p0.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_notice_form_intakes child
      WHERE child.copyright_notice_id = target_notice_id
        AND child.copyright_notice_submission_id IS DISTINCT FROM fn_project_copyright_minimal_purge_current_submission(target_notice_id))
    AND NOT EXISTS (SELECT 1 FROM copyright_notice_form_screening_attempts child
      JOIN copyright_notice_form_intakes p0 ON child.copyright_notice_form_intake_id = p0.id
      WHERE p0.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_notice_form_screening_work_items child
      JOIN copyright_notice_form_intakes p0 ON child.copyright_notice_form_intake_id = p0.id
      WHERE p0.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_notice_form_screenings child
      WHERE child.copyright_notice_id = target_notice_id AND NOT EXISTS (
        SELECT 1 FROM copyright_notice_submissions submission
        WHERE submission.id = fn_project_copyright_minimal_purge_current_submission(target_notice_id)
          AND submission.current_assessment_form_screening_id = child.id))
    AND NOT EXISTS (SELECT 1 FROM copyright_notice_guest_capabilities child

      WHERE child.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_notice_legal_hold_assessment_targets child

      WHERE child.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_notice_legal_hold_assessments child

      WHERE child.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_notice_legal_hold_resolutions child

      WHERE child.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_notice_lifecycle_changes child

      WHERE child.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_notice_submission_assessments child

      WHERE child.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_notice_submission_guidance child
      JOIN copyright_notice_submissions p0 ON child.copyright_notice_submission_id = p0.id
      WHERE p0.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_notice_submission_requests child
      JOIN copyright_notice_submissions p0 ON child.copyright_notice_submission_id = p0.id
      WHERE p0.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_notice_submission_targets child

      WHERE child.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_notice_submissions child
      WHERE child.copyright_notice_id = target_notice_id
        AND child.id IS DISTINCT FROM fn_project_copyright_minimal_purge_current_submission(target_notice_id))
    AND NOT EXISTS (SELECT 1 FROM copyright_notice_target_images child
      JOIN copyright_notice_targets p0 ON child.copyright_notice_target_id = p0.id
      WHERE p0.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_notice_targets child

      WHERE child.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_notice_urgent_filings child
      JOIN copyright_notice_submissions p0 ON child.copyright_notice_submission_id = p0.id
      WHERE p0.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_repeat_infringer_dispositions child
      JOIN copyright_repeat_infringer_incidents p0 ON child.copyright_repeat_infringer_incident_id = p0.id
      WHERE p0.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_repeat_infringer_incident_targets child

      WHERE child.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_repeat_infringer_incidents child

      WHERE child.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_restriction_administrator_lifts child
      JOIN copyright_restrictions p0 ON child.copyright_restriction_id = p0.id
      WHERE p0.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_restrictions child

      WHERE child.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_staydown_entries child
      JOIN copyright_restrictions p0 ON child.copyright_restriction_id = p0.id
      WHERE p0.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_staydown_matches child
      JOIN copyright_staydown_entries p0 ON child.copyright_staydown_entry_id = p0.id JOIN copyright_restrictions p1 ON p0.copyright_restriction_id = p1.id
      WHERE p1.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_territorial_decisions child

      WHERE child.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_territorial_escalations child

      WHERE child.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_territorial_notice_acknowledgments child
      JOIN copyright_territorial_notice_receipts p0 ON child.copyright_territorial_notice_receipt_id = p0.id
      WHERE p0.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_territorial_notice_receipts child

      WHERE child.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_territorial_notice_routings child
      JOIN copyright_territorial_notice_receipts p0 ON child.copyright_territorial_notice_receipt_id = p0.id
      WHERE p0.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_territorial_redress_decisions child
      JOIN copyright_territorial_redress_requests p0 ON child.copyright_territorial_redress_request_id = p0.id
      WHERE p0.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_territorial_redress_requests child

      WHERE child.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_trusted_flagger_matches child

      WHERE child.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM notification_push_intent_subscription_receipts child
      JOIN notification_push_intents p0 ON child.user_id = p0.user_id AND child.notification_id = p0.notification_id JOIN notifications p1 ON p0.user_id = p1.user_id AND p0.notification_id = p1.id
      WHERE p1.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM notification_push_intents child
      JOIN notifications p0 ON child.user_id = p0.user_id AND child.notification_id = p0.id
      WHERE p0.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM notifications child

      WHERE child.copyright_notice_id = target_notice_id)
$$;

-- Fail closed on any new, removed, or changed case-owned FK edge. Partition-cloned
-- constraints inherit their parent's edge; independent edges on a partition remain visible.
CREATE FUNCTION fn_project_copyright_minimal_purge_catalog_complete()
RETURNS boolean LANGUAGE sql STABLE AS $$
  WITH RECURSIVE owned_relations(relid) AS (
    SELECT 'public.copyright_notices'::regclass::oid
    UNION
    SELECT fk.conrelid FROM pg_constraint fk
    JOIN owned_relations parent ON parent.relid = fk.confrelid
    WHERE fk.contype = 'f' AND fk.conparentid = 0
  ), physical_relations(relid) AS (
    SELECT relid FROM owned_relations
    UNION
    SELECT inherited.inhrelid FROM pg_inherits inherited
    JOIN physical_relations parent ON parent.relid = inherited.inhparent
  ), actual_edges(signature) AS (
    SELECT child_namespace.nspname || '.' || child.relname || '|' || fk.conname || '|' ||
      ARRAY(SELECT attribute.attname
        FROM unnest(fk.conkey) WITH ORDINALITY AS key(attnum, position)
        JOIN pg_attribute attribute ON attribute.attrelid = fk.conrelid
          AND attribute.attnum = key.attnum ORDER BY key.position)::text || '|' ||
      parent_namespace.nspname || '.' || parent.relname || '|' ||
      ARRAY(SELECT attribute.attname
        FROM unnest(fk.confkey) WITH ORDINALITY AS key(attnum, position)
        JOIN pg_attribute attribute ON attribute.attrelid = fk.confrelid
          AND attribute.attnum = key.attnum ORDER BY key.position)::text || '|' ||
      fk.confdeltype::text || '|' || fk.convalidated::text
    FROM pg_constraint fk
    JOIN physical_relations rooted_parent ON rooted_parent.relid = fk.confrelid
    JOIN pg_class child ON child.oid = fk.conrelid
    JOIN pg_namespace child_namespace ON child_namespace.oid = child.relnamespace
    JOIN pg_class parent ON parent.oid = fk.confrelid
    JOIN pg_namespace parent_namespace ON parent_namespace.oid = parent.relnamespace
    WHERE fk.contype = 'f' AND fk.conparentid = 0
  ), expected_edges(signature) AS (
    SELECT unnest(ARRAY[
      'public.copyright_account_suspension_incidents|fk_copyright_suspension_incidents__incident|{copyright_repeat_infringer_incident_id,account_user_id}|public.copyright_repeat_infringer_incidents|{id,account_user_id}|r|true',
      'public.copyright_automatic_withholding_refusals|fk_copyright_automatic_withholding_refusals__notice_submission|{copyright_notice_submission_id}|public.copyright_notice_submissions|{id}|c|true',
      'public.copyright_case_preservation_holds|fk_copyright_case_preservation_holds__notice|{copyright_notice_id}|public.copyright_notices|{id}|c|true',
      'public.copyright_claimant_misuse_events|copyright_claimant_misuse_events_copyright_notice_id_fkey|{copyright_notice_id}|public.copyright_notices|{id}|c|true',
      'public.copyright_claimant_misuse_events|copyright_claimant_misuse_events_copyright_restriction_id_fkey|{copyright_restriction_id}|public.copyright_restrictions|{id}|r|true',
      'public.copyright_claimant_misuse_events|fk_copyrig_claimant_misuse_events__notice_submission_assessment|{copyright_notice_submission_assessment_identity_id}|public.copyright_notice_submission_assessment_identities|{id}|r|true',
      'public.copyright_claimant_misuse_events|fk_copyright_claimant_misuse_events__notice_submission|{copyright_notice_submission_id}|public.copyright_notice_submissions|{id}|r|true',
      'public.copyright_claimant_suspension_reversals|fk_copyright_claimant_suspension_reversals__restriction|{copyright_restriction_id}|public.copyright_restrictions|{id}|c|true',
      'public.copyright_decision_rationales|copyright_decision_rationales_copyright_notice_id_fkey|{copyright_notice_id}|public.copyright_notices|{id}|c|true',
      'public.copyright_dsa_statement_submission_attempts|copyright_dsa_statement_submi_copyright_dsa_statement_subm_fkey|{copyright_dsa_statement_submission_id}|public.copyright_dsa_statement_submissions|{id}|c|true',
      'public.copyright_dsa_statement_submissions|copyright_dsa_statement_submissio_copyright_restriction_id_fkey|{copyright_restriction_id}|public.copyright_restrictions|{id}|r|true',
      'public.copyright_eu_dispute_settlement_outcomes|fk_copyright_eu_dispute_settlement_outcomes__referral|{copyright_eu_dispute_settlement_referral_id}|public.copyright_eu_dispute_settlement_referrals|{id}|c|true',
      'public.copyright_eu_dispute_settlement_referrals|fk_copyright_eu_dispute_settlement_referrals__decision|{copyright_notice_id,copyright_territorial_decision_id}|public.copyright_territorial_decision_identities|{copyright_notice_id,id}|r|true',
      'public.copyright_eu_dispute_settlement_referrals|fk_copyright_eu_dispute_settlement_referrals__notice|{copyright_notice_id,jurisdiction}|public.copyright_notices|{id,jurisdiction}|c|true',
      'public.copyright_eu_supervised_complaint_resolutions|fk_copyright_supervised_resolutions__complaint|{copyright_eu_supervised_complaint_id}|public.copyright_eu_supervised_complaints|{id}|c|true',
      'public.copyright_eu_supervised_complaints|fk_copyright_eu_supervised_complaints__notice|{copyright_notice_id,jurisdiction}|public.copyright_notices|{id,jurisdiction}|c|true',
      'public.copyright_legal_hold_restrictions|copyright_legal_hold_restrictions_copyright_restriction_id_fkey|{copyright_restriction_id}|public.copyright_restrictions|{id}|r|true',
      'public.copyright_legal_hold_restrictions|fk_copyright_legal_hold_restricti__notice_legal_hold_assessment|{copyright_notice_legal_hold_assessment_id}|public.copyright_notice_legal_hold_assessments|{id}|r|true',
      'public.copyright_notice_action_attempt_results|copyright_notice_action_attempt_results_attempt_id_fkey|{attempt_id}|public.copyright_notice_action_attempts|{id}|c|true',
      'public.copyright_notice_action_attempts|copyright_notice_action_attempts_work_item_id_fkey|{work_item_id}|public.copyright_notice_action_work_items|{id}|c|true',
      'public.copyright_notice_action_work_items|fk_copyright_action_intents__parent_notice|{copyright_notice_id,copyright_restriction_id}|public.copyright_restrictions|{copyright_notice_id,id}|c|true',
      'public.copyright_notice_action_work_items|fk_copyright_notice_action_work_items__deadline|{copyright_notice_deadline_id}|public.copyright_notice_deadlines|{id}|c|true',
      'public.copyright_notice_appeal_recommendations|fk_copyright_notice_appeal_recommendations__submission|{copyright_notice_submission_id}|public.copyright_notice_submissions|{id}|c|true',
      'public.copyright_notice_appeal_reviews|copyright_notice_appeal_reviews_copyright_restriction_id_fkey|{copyright_restriction_id}|public.copyright_restrictions|{id}|c|true',
      'public.copyright_notice_appeal_reviews|fk_copyright_notice_appeal_reviews__recommendation__submission|{copyright_notice_appeal_recommendation_id,copyright_notice_submission_id}|public.copyright_notice_appeal_recommendations|{id,copyright_notice_submission_id}|c|true',
      'public.copyright_notice_appeal_reviews|fk_copyright_notice_appeal_reviews__submission|{copyright_notice_submission_id}|public.copyright_notice_submissions|{id}|c|true',
      'public.copyright_notice_correspondence_messages|fk_copyright_notice_correspondence_messages__notice|{copyright_notice_id}|public.copyright_notices|{id}|c|true',
      'public.copyright_notice_correspondence_messages|fk_copyright_notice_correspondence_messages__submission|{copyright_notice_submission_id}|public.copyright_notice_submissions|{id}|c|true',
      'public.copyright_notice_counter_notice_assessment_targets|fk_copyright_counter_targets__parent_notice|{copyright_notice_id,copyright_notice_submission_assessment_identity_id}|public.copyright_notice_submission_assessment_identities|{copyright_notice_id,id}|r|true',
      'public.copyright_notice_counter_notice_assessment_targets|fk_copyright_counter_targets__target_notice|{copyright_notice_id,copyright_notice_target_id}|public.copyright_notice_targets|{copyright_notice_id,id}|c|true',
      'public.copyright_notice_counter_notice_reviews|fk_copyrig_notice_counter_notice_reviews__submission_assessment|{copyright_notice_submission_assessment_identity_id}|public.copyright_notice_submission_assessment_identities|{id}|r|true',
      'public.copyright_notice_counter_notice_reviews|fk_copyright_notice_counter_notice_reviews__deadline|{copyright_notice_deadline_id}|public.copyright_notice_deadlines|{id}|r|true',
      'public.copyright_notice_counter_notice_reviews|fk_copyright_notice_counter_notice_reviews__submission|{copyright_notice_submission_id}|public.copyright_notice_submissions|{id}|r|true',
      'public.copyright_notice_deadlines|copyright_notice_deadlines_copyright_notice_id_fkey|{copyright_notice_id}|public.copyright_notices|{id}|c|true',
      'public.copyright_notice_deadlines|fk_copyrig_notice_deadlin__qualifying_counter_notice_assessment|{qualifying_counter_notice_assessment_identity_id}|public.copyright_notice_submission_assessment_identities|{id}|r|true',
      'public.copyright_notice_delivery_attempt_results|copyright_notice_delivery_attempt_results_attempt_id_fkey|{attempt_id}|public.copyright_notice_delivery_attempts|{id}|c|true',
      'public.copyright_notice_delivery_attempts|copyright_notice_delivery_attempts_work_item_id_fkey|{work_item_id}|public.copyright_notice_delivery_work_items|{id}|c|true',
      'public.copyright_notice_delivery_recipients|fk_copyright_notice_delivery_recipients__intent|{copyright_notice_delivery_work_item_id}|public.copyright_notice_delivery_work_items|{id}|r|true',
      'public.copyright_notice_delivery_work_items|copyright_notice_delivery_work_items_copyright_notice_id_fkey|{copyright_notice_id}|public.copyright_notices|{id}|c|true',
      'public.copyright_notice_delivery_work_items|fk_copyri_notice_delive_intents__correspondence_message__notice|{copyright_notice_correspondence_message_id,copyright_notice_id}|public.copyright_notice_correspondence_messages|{id,copyright_notice_id}|c|true',
      'public.copyright_notice_delivery_work_items|fk_copyright_notice_delivery_work_items__submission__notice|{copyright_notice_submission_id,copyright_notice_id}|public.copyright_notice_submissions|{id,copyright_notice_id}|c|true',
      'public.copyright_notice_email_correspondence_reviews|fk_copyright_notice_email_correspondenc_reviews__correspondence|{copyright_notice_correspondence_message_id}|public.copyright_notice_correspondence_messages|{id}|r|true',
      'public.copyright_notice_email_correspondence_reviews|fk_copyright_notice_email_correspondence_reviews__notice|{copyright_notice_id}|public.copyright_notices|{id}|c|true',
      'public.copyright_notice_email_correspondence_reviews|fk_copyright_notice_email_correspondence_reviews__submission|{copyright_notice_submission_id}|public.copyright_notice_submissions|{id}|r|true',
      'public.copyright_notice_email_intake_notice_links|copyright_notice_email_intake_correspondence_submission_id_fkey|{correspondence_submission_id}|public.copyright_notice_submissions|{id}|r|true',
      'public.copyright_notice_email_intake_notice_links|copyright_notice_email_intake_no_correspondence_message_id_fkey|{correspondence_message_id}|public.copyright_notice_correspondence_messages|{id}|r|true',
      'public.copyright_notice_email_intake_notice_links|fk_copyright_notice_email_intake_notice_links__notice|{copyright_notice_id}|public.copyright_notices|{id}|c|true',
      'public.copyright_notice_email_thread_retirements|copyright_notice_email_thread_retireme_copyright_notice_id_fkey|{copyright_notice_id}|public.copyright_notices|{id}|r|true',
      'public.copyright_notice_encryption_keys|fk_copyright_notice_encryption_keys__notice|{copyright_notice_id}|public.copyright_notices|{id}|c|true',
      'public.copyright_notice_evidence_artifacts|fk_copyright_artifacts__parent_notice|{copyright_notice_id,copyright_notice_submission_id}|public.copyright_notice_submissions|{copyright_notice_id,id}|c|true',
      'public.copyright_notice_form_intake_reviews|fk_copyright_notice_form_intake_reviews__intake|{copyright_notice_form_intake_id}|public.copyright_notice_form_intakes|{id}|c|true',
      'public.copyright_notice_form_intakes|fk_copyright_notice_form_intakes__submission|{copyright_notice_submission_id,copyright_notice_id}|public.copyright_notice_submissions|{id,copyright_notice_id}|c|true',
      'public.copyright_notice_form_screening_attempts|fk_copyright_notice_form_screening_attempts__intake__screening|{copyright_notice_form_intake_id,copyright_notice_form_screening_id}|public.copyright_notice_form_screenings|{copyright_notice_form_intake_id,id}|c|true',
      'public.copyright_notice_form_screening_attempts|fk_copyright_notice_form_screening_attempts__intake|{copyright_notice_form_intake_id}|public.copyright_notice_form_intakes|{id}|c|true',
      'public.copyright_notice_form_screening_work_items|copyright_notice_form_screen_copyright_notice_form_intake_fkey1|{copyright_notice_form_intake_id,attempt_id}|public.copyright_notice_form_screening_attempts|{copyright_notice_form_intake_id,id}|c|true',
      'public.copyright_notice_form_screening_work_items|copyright_notice_form_screeni_copyright_notice_form_intake_fkey|{copyright_notice_form_intake_id}|public.copyright_notice_form_intakes|{id}|c|true',
      'public.copyright_notice_form_screenings|fk_copyright_notice_form_screenings__intake|{copyright_notice_form_intake_id,copyright_notice_submission_id,copyright_notice_id}|public.copyright_notice_form_intakes|{id,copyright_notice_submission_id,copyright_notice_id}|c|true',
      'public.copyright_notice_guest_capabilities|copyright_notice_guest_capabilities_copyright_notice_id_fkey|{copyright_notice_id}|public.copyright_notices|{id}|c|true',
      'public.copyright_notice_guest_capabilities|fk_copyright_guest_capabilities__identity|{id,copyright_notice_id}|public.copyright_notice_guest_capability_identities|{id,copyright_notice_id}|r|true',
      'public.copyright_notice_guest_capability_identities|copyright_notice_guest_capability_iden_copyright_notice_id_fkey|{copyright_notice_id}|public.copyright_notices|{id}|c|true',
      'public.copyright_notice_legal_hold_assessment_targets|fk_copyright_hold_targets__parent_notice|{copyright_notice_id,copyright_notice_legal_hold_assessment_id}|public.copyright_notice_legal_hold_assessments|{copyright_notice_id,id}|c|true',
      'public.copyright_notice_legal_hold_assessment_targets|fk_copyright_hold_targets__target_notice|{copyright_notice_id,copyright_notice_target_id}|public.copyright_notice_targets|{copyright_notice_id,id}|c|true',
      'public.copyright_notice_legal_hold_assessments|fk_copyright_hold_assessments__parent_notice|{copyright_notice_id,copyright_notice_submission_id}|public.copyright_notice_submissions|{copyright_notice_id,id}|c|true',
      'public.copyright_notice_legal_hold_resolutions|fk_copyright_hold_resolutions__parent_notice|{copyright_notice_id,copyright_notice_legal_hold_assessment_id}|public.copyright_notice_legal_hold_assessments|{copyright_notice_id,id}|c|true',
      'public.copyright_notice_lifecycle_changes|copyright_lifecycle_event_action_intent_fk|{copyright_notice_id,copyright_notice_action_intent_id}|public.copyright_notice_action_work_items|{copyright_notice_id,id}|c|true',
      'public.copyright_notice_lifecycle_changes|copyright_lifecycle_event_delivery_intent_fk|{copyright_notice_delivery_work_item_id}|public.copyright_notice_delivery_work_items|{id}|c|true',
      'public.copyright_notice_lifecycle_changes|copyright_lifecycle_event_guest_capability_fk|{copyright_notice_guest_capability_id,copyright_notice_id}|public.copyright_notice_guest_capability_identities|{id,copyright_notice_id}|r|true',
      'public.copyright_notice_lifecycle_changes|copyright_notice_lifecycle_changes_copyright_notice_id_fkey|{copyright_notice_id}|public.copyright_notices|{id}|c|true',
      'public.copyright_notice_lifecycle_changes|fk_copyright_lifecycle_events__artifact_notice|{copyright_notice_id,copyright_notice_evidence_artifact_id}|public.copyright_notice_evidence_artifacts|{copyright_notice_id,id}|c|true',
      'public.copyright_notice_lifecycle_changes|fk_copyright_lifecycle_events__assessment_notice|{copyright_notice_id,copyright_notice_submission_assessment_identity_id}|public.copyright_notice_submission_assessment_identities|{copyright_notice_id,id}|r|true',
      'public.copyright_notice_lifecycle_changes|fk_copyright_lifecycle_events__correspondence_notice|{copyright_notice_id,copyright_notice_correspondence_id}|public.copyright_notice_correspondence_messages|{copyright_notice_id,id}|c|true',
      'public.copyright_notice_lifecycle_changes|fk_copyright_lifecycle_events__deadline_notice|{copyright_notice_id,copyright_notice_deadline_id}|public.copyright_notice_deadlines|{copyright_notice_id,id}|c|true',
      'public.copyright_notice_lifecycle_changes|fk_copyright_lifecycle_events__email_intake_notice|{copyright_notice_id,copyright_notice_email_intake_id}|public.copyright_notice_email_intake_notice_links|{copyright_notice_id,copyright_notice_email_intake_receipt_id}|c|true',
      'public.copyright_notice_lifecycle_changes|fk_copyright_lifecycle_events__hold_assessment_notice|{copyright_notice_id,copyright_notice_legal_hold_assessment_id}|public.copyright_notice_legal_hold_assessments|{copyright_notice_id,id}|c|true',
      'public.copyright_notice_lifecycle_changes|fk_copyright_lifecycle_events__hold_resolution_notice|{copyright_notice_id,copyright_notice_legal_hold_resolution_id}|public.copyright_notice_legal_hold_resolutions|{copyright_notice_id,id}|c|true',
      'public.copyright_notice_lifecycle_changes|fk_copyright_lifecycle_events__restriction_notice|{copyright_notice_id,copyright_restriction_id}|public.copyright_restrictions|{copyright_notice_id,id}|c|true',
      'public.copyright_notice_lifecycle_changes|fk_copyright_lifecycle_events__submission_notice|{copyright_notice_id,copyright_notice_submission_id}|public.copyright_notice_submissions|{copyright_notice_id,id}|c|true',
      'public.copyright_notice_operational_retention_cursors|copyright_notice_operational__cursor_blocker_assessment_id_fkey|{cursor_blocker_assessment_identity_id}|public.copyright_notice_submission_assessment_identities|{id}|n|true',
      'public.copyright_notice_replay_receipts|fk_copyright_live_replay_receipts__notice|{copyright_notice_id,copyright_replay_retention_group_id}|public.copyright_notices|{id,copyright_replay_retention_group_id}|r|true',
      'public.copyright_notice_retention_erasures|copyright_notice_retention_erasures_copyright_notice_id_fkey|{copyright_notice_id}|public.copyright_notices|{id}|c|true',
      'public.copyright_notice_submission_assessment_identities|fk_copyright_assessment_identities__submission|{copyright_notice_submission_id,copyright_notice_id}|public.copyright_notice_submissions|{id,copyright_notice_id}|c|true',
      'public.copyright_notice_submission_assessments|fk_copyright_assessments__form_screening|{copyright_notice_form_screening_id}|public.copyright_notice_form_screenings|{id}|c|true',
      'public.copyright_notice_submission_assessments|fk_copyright_assessments__identity|{copyright_notice_submission_id,id}|public.copyright_notice_submission_assessment_identities|{copyright_notice_submission_id,id}|r|true',
      'public.copyright_notice_submission_assessments|fk_copyright_assessments__notice_identity|{copyright_notice_id,id}|public.copyright_notice_submission_assessment_identities|{copyright_notice_id,id}|r|true',
      'public.copyright_notice_submission_assessments|fk_copyright_assessments__supersedes_submission|{copyright_notice_submission_id,supersedes_assessment_id}|public.copyright_notice_submission_assessment_identities|{copyright_notice_submission_id,id}|r|true',
      'public.copyright_notice_submission_guidance|fk_copyright_notice_submission_guidance__submission|{copyright_notice_submission_id}|public.copyright_notice_submissions|{id}|c|true',
      'public.copyright_notice_submission_requests|fk_copyright_notice_submission_requests__submission|{copyright_notice_submission_id}|public.copyright_notice_submissions|{id}|c|true',
      'public.copyright_notice_submission_targets|fk_copyright_submission_targets__parent_notice|{copyright_notice_id,copyright_notice_submission_id}|public.copyright_notice_submissions|{copyright_notice_id,id}|c|true',
      'public.copyright_notice_submission_targets|fk_copyright_submission_targets__target_notice|{copyright_notice_id,copyright_notice_target_id}|public.copyright_notice_targets|{copyright_notice_id,id}|c|true',
      'public.copyright_notice_submissions|copyright_notice_submissions_copyright_notice_id_fkey|{copyright_notice_id}|public.copyright_notices|{id}|c|true',
      'public.copyright_notice_submissions|copyright_submission_guest_capability_fk|{copyright_notice_guest_capability_id,copyright_notice_id}|public.copyright_notice_guest_capabilities|{id,copyright_notice_id}|r|true',
      'public.copyright_notice_submissions|fk_copyright_notice_submissions__current_assessment_identity|{id,current_assessment_identity_id}|public.copyright_notice_submission_assessment_identities|{copyright_notice_submission_id,id}|r|true',
      'public.copyright_notice_submissions|fk_copyright_notice_submissions__current_form_screening|{id,current_assessment_form_screening_id}|public.copyright_notice_form_screenings|{copyright_notice_submission_id,id}|r|true',
      'public.copyright_notice_target_images|copyright_notice_target_images_copyright_notice_target_id_fkey|{copyright_notice_target_id}|public.copyright_notice_targets|{id}|c|true',
      'public.copyright_notice_target_images|fk_copyright_notice_target_images__target__placement|{copyright_notice_target_id,placement_id}|public.copyright_notice_targets|{id,placement_id}|c|true',
      'public.copyright_notice_targets|copyright_notice_targets_copyright_notice_id_fkey|{copyright_notice_id}|public.copyright_notices|{id}|c|true',
      'public.copyright_notice_thread_blocker_generations|copyright_notice_thread_blocker_genera_copyright_notice_id_fkey|{copyright_notice_id}|public.copyright_notices|{id}|c|true',
      'public.copyright_notice_thread_party_generations|copyright_notice_thread_party_generati_copyright_notice_id_fkey|{copyright_notice_id}|public.copyright_notices|{id}|c|true',
      'public.copyright_notice_thread_retention_activities|copyright_notice_thread_retention_acti_copyright_notice_id_fkey|{copyright_notice_id}|public.copyright_notices|{id}|c|true',
      'public.copyright_notice_urgent_filings|fk_copyright_notice_urgent_filings__submission|{copyright_notice_submission_id}|public.copyright_notice_submissions|{id}|c|true',
      'public.copyright_notices|fk_copyright_notices__current_territorial_decision_identity|{id,current_territorial_decision_identity_id}|public.copyright_territorial_decision_identities|{copyright_notice_id,id}|r|true',
      'public.copyright_notices|fk_copyright_notices__territorial_assessment_identity|{id,territorial_authorizing_assessment_identity_id}|public.copyright_notice_submission_assessment_identities|{copyright_notice_id,id}|r|true',
      'public.copyright_repeat_infringer_dispositions|fk_copyright_repeat_infringer_dispositions__incident|{copyright_repeat_infringer_incident_id}|public.copyright_repeat_infringer_incidents|{id}|r|true',
      'public.copyright_repeat_infringer_incident_targets|fk_copyr_repeat_infringe_incident_targets__incident|{copyright_repeat_infringer_incident_id,copyright_notice_id}|public.copyright_repeat_infringer_incidents|{id,copyright_notice_id}|c|true',
      'public.copyright_repeat_infringer_incident_targets|fk_copyr_repeat_infringe_incident_targets__target|{copyright_notice_id,copyright_notice_target_id}|public.copyright_notice_targets|{copyright_notice_id,id}|c|true',
      'public.copyright_repeat_infringer_incidents|copyright_repeat_infringer_incidents_copyright_notice_id_fkey|{copyright_notice_id}|public.copyright_notices|{id}|c|true',
      'public.copyright_restriction_administrator_lifts|fk_copyright_restriction_administrator_lifts__restriction|{copyright_restriction_id}|public.copyright_restrictions|{id}|r|true',
      'public.copyright_restrictions|fk_copyright_restrictions__authorizing_assessment|{copyright_notice_id,authorizing_assessment_id}|public.copyright_notice_submission_assessment_identities|{copyright_notice_id,id}|r|true',
      'public.copyright_restrictions|fk_copyright_restrictions__parent_notice|{copyright_notice_id,copyright_notice_target_id}|public.copyright_notice_targets|{copyright_notice_id,id}|c|true',
      'public.copyright_staydown_entries|copyright_staydown_entries_copyright_restriction_id_fkey|{copyright_restriction_id}|public.copyright_restrictions|{id}|c|true',
      'public.copyright_staydown_matches|copyright_staydown_matches_copyright_staydown_entry_id_fkey|{copyright_staydown_entry_id}|public.copyright_staydown_entries|{id}|c|true',
      'public.copyright_territorial_decision_identities|fk_copyright_territorial_decision_identities__notice|{copyright_notice_id,jurisdiction}|public.copyright_notices|{id,jurisdiction}|c|true',
      'public.copyright_territorial_decisions|fk_copyright_territorial_decisions__assessment|{copyright_notice_submission_assessment_identity_id}|public.copyright_notice_submission_assessment_identities|{id}|r|true',
      'public.copyright_territorial_decisions|fk_copyright_territorial_decisions__identity|{copyright_notice_id,jurisdiction,id}|public.copyright_territorial_decision_identities|{copyright_notice_id,jurisdiction,id}|r|true',
      'public.copyright_territorial_decisions|fk_copyright_territorial_decisions__notice|{copyright_notice_id,jurisdiction}|public.copyright_notices|{id,jurisdiction}|c|true',
      'public.copyright_territorial_decisions|fk_copyright_territorial_decisions__predecessor|{copyright_notice_id,supersedes_decision_id}|public.copyright_territorial_decision_identities|{copyright_notice_id,id}|r|true',
      'public.copyright_territorial_escalation_closures|fk_copyright_escalation_closures__escalation|{copyright_territorial_escalation_id}|public.copyright_territorial_escalations|{id}|c|true',
      'public.copyright_territorial_escalations|fk_copyright_territorial_escalations__eu_supervised_complaint|{copyright_eu_supervised_complaint_id}|public.copyright_eu_supervised_complaints|{id}|c|true',
      'public.copyright_territorial_escalations|fk_copyright_territorial_escalations__notice_acknowledgment|{copyright_territorial_notice_acknowledgment_id}|public.copyright_territorial_notice_acknowledgments|{id}|c|true',
      'public.copyright_territorial_escalations|fk_copyright_territorial_escalations__notice|{copyright_notice_id,jurisdiction}|public.copyright_notices|{id,jurisdiction}|c|true',
      'public.copyright_territorial_notice_acknowledgments|fk_copyright_territorial_notice_acknowledgments__receipt|{copyright_territorial_notice_receipt_id}|public.copyright_territorial_notice_receipts|{id}|c|true',
      'public.copyright_territorial_notice_receipts|fk_copyright_territorial_notice_receipts__notice|{copyright_notice_id,jurisdiction}|public.copyright_notices|{id,jurisdiction}|c|true',
      'public.copyright_territorial_notice_routings|fk_copyright_territorial_notice_routings__receipt|{copyright_territorial_notice_receipt_id}|public.copyright_territorial_notice_receipts|{id}|c|true',
      'public.copyright_territorial_redress_decision_identities|fk_copyright_redress_decision_identities__request_scope|{copyright_notice_id,copyright_territorial_redress_request_id}|public.copyright_territorial_redress_requests|{copyright_notice_id,id}|c|true',
      'public.copyright_territorial_redress_decisions|fk_copyright_territorial_redress_decisions__identity|{copyright_territorial_redress_request_id,id}|public.copyright_territorial_redress_decision_identities|{copyright_territorial_redress_request_id,id}|r|true',
      'public.copyright_territorial_redress_decisions|fk_copyright_territorial_redress_decisions__request|{copyright_notice_id,jurisdiction,copyright_territorial_redress_request_id}|public.copyright_territorial_redress_requests|{copyright_notice_id,jurisdiction,id}|r|true',
      'public.copyright_territorial_redress_requests|fk_copyright_redress_requests__current_decision_identity|{id,current_staff_decision_identity_id}|public.copyright_territorial_redress_decision_identities|{copyright_territorial_redress_request_id,id}|r|true',
      'public.copyright_territorial_redress_requests|fk_copyright_territorial_redress_requests__assessment|{copyright_notice_id,authorizing_assessment_identity_id}|public.copyright_notice_submission_assessment_identities|{copyright_notice_id,id}|r|true',
      'public.copyright_territorial_redress_requests|fk_copyright_territorial_redress_requests__decision|{copyright_notice_id,copyright_territorial_decision_id}|public.copyright_territorial_decision_identities|{copyright_notice_id,id}|r|true',
      'public.copyright_territorial_redress_requests|fk_copyright_territorial_redress_requests__notice|{copyright_notice_id,jurisdiction}|public.copyright_notices|{id,jurisdiction}|c|true',
      'public.copyright_trusted_flagger_matches|copyright_trusted_flagger_matches_copyright_notice_id_fkey|{copyright_notice_id}|public.copyright_notices|{id}|c|true',
      'public.notification_push_intent_subscription_receipts|notification_push_receipts_intent_fkey|{user_id,notification_id}|public.notification_push_intents|{user_id,notification_id}|c|true',
      'public.notification_push_intents|notification_push_intents_user_id_notification_id_fkey|{user_id,notification_id}|public.notifications|{user_id,id}|c|true',
      'public.notifications|fk_notifications__copyright_notice|{copyright_notice_id}|public.copyright_notices|{id}|c|true'
    ]::text[])
  )
  SELECT NOT EXISTS (SELECT signature FROM actual_edges
    EXCEPT SELECT signature FROM expected_edges)
    AND NOT EXISTS (SELECT signature FROM expected_edges
      EXCEPT SELECT signature FROM actual_edges)
    AND (SELECT count(*) FROM pg_enum
      WHERE enumtypid = 'copyright_notice_operational_retention_kinds'::regtype) <= 8
$$;

-- The staged DELETE already holds the parent row before this trigger runs. A
-- separate SPI statement then sees a child that committed while that row lock
-- was being acquired. Without this fence, a referential action could silently
-- delete or rewrite an unbounded late fanout after its leaf phase has passed.
CREATE FUNCTION fn_reject_copyright_minimal_purge_late_child()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  edge record;
  has_child boolean;
BEGIN
  IF current_setting('app.copyright_minimal_purge_phase_table', true) IS DISTINCT FROM TG_ARGV[0]
    OR current_setting('app.copyright_minimal_purge_notice_id', true) IS NULL THEN
    RETURN OLD;
  END IF;
  FOR edge IN
    SELECT child.oid::regclass AS child_relation,
      string_agg(format('child.%I = ($1 ->> %L)::%s', child_attribute.attname,
        parent_attribute.attname,
        format_type(child_attribute.atttypid, child_attribute.atttypmod)),
        ' AND ' ORDER BY key.position) AS join_predicate
    FROM pg_constraint fk
    JOIN pg_class child ON child.oid = fk.conrelid
    JOIN LATERAL unnest(fk.conkey, fk.confkey) WITH ORDINALITY
      AS key(child_attnum, parent_attnum, position) ON true
    JOIN pg_attribute child_attribute ON child_attribute.attrelid = fk.conrelid
      AND child_attribute.attnum = key.child_attnum
    JOIN pg_attribute parent_attribute ON parent_attribute.attrelid = fk.confrelid
      AND parent_attribute.attnum = key.parent_attnum
    WHERE fk.contype = 'f' AND fk.conparentid = 0
      AND fk.confrelid IN (TG_ARGV[1]::regclass, TG_RELID)
      -- These owned units have unique per-parent cardinalities and are charged by every
      -- cascading row's work trigger. Every other descendant must have drained already.
      AND NOT (fk.confdeltype = 'c' AND (
        (TG_ARGV[0] = 'copyright_notice_submissions' AND fk.conrelid IN (
          'copyright_notice_submission_assessment_identities'::regclass,
          'copyright_notice_form_intakes'::regclass))
        OR (TG_ARGV[0] = 'copyright_territorial_redress_requests'
          AND fk.conrelid = 'copyright_territorial_redress_decision_identities'::regclass)))
    GROUP BY fk.oid, child.oid
  LOOP
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %s child WHERE %s)',
      edge.child_relation, edge.join_predicate)
      USING to_jsonb(OLD) INTO has_child;
    IF has_child THEN
      RAISE EXCEPTION USING ERRCODE = 'PZ421',
        MESSAGE = 'Copyright minimal purge encountered a late child';
    END IF;
  END LOOP;
  RETURN OLD;
END;
$$;

DO $$
DECLARE owned record;
BEGIN
  FOR owned IN
    WITH RECURSIVE owned_relations(relid) AS (
      SELECT 'public.copyright_notices'::regclass::oid
      UNION
      SELECT fk.conrelid FROM pg_constraint fk
      JOIN owned_relations parent ON parent.relid = fk.confrelid
      WHERE fk.contype = 'f' AND fk.conparentid = 0
    )
    SELECT relation.oid AS relid, relation.relname AS table_name,
      namespace.nspname AS schema_name
    FROM owned_relations
    JOIN pg_class relation ON relation.oid = owned_relations.relid
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE relation.oid <> 'public.copyright_notices'::regclass::oid
      AND NOT EXISTS (SELECT 1 FROM pg_inherits inherited
        WHERE inherited.inhrelid = relation.oid)
  LOOP
    EXECUTE format(
      'CREATE TRIGGER trigger_reject_copyright_minimal_purge_late_child '
      || 'BEFORE DELETE ON %I.%I FOR EACH ROW '
      || 'EXECUTE FUNCTION fn_reject_copyright_minimal_purge_late_child(%L, %L)',
      owned.schema_name, owned.table_name, owned.table_name,
      format('%I.%I', owned.schema_name, owned.table_name));
    EXECUTE format('CREATE TRIGGER trigger_register_copyright_minimal_purge_delete_work '
      || 'BEFORE DELETE ON %I.%I FOR EACH ROW '
      || 'EXECUTE FUNCTION fn_register_copyright_minimal_purge_row_work()',
      owned.schema_name, owned.table_name);
  END LOOP;
END;
$$;

CREATE TRIGGER trigger_register_copyright_minimal_purge_delete_work
  BEFORE DELETE ON copyright_notices FOR EACH ROW
  EXECUTE FUNCTION fn_register_copyright_minimal_purge_row_work();
CREATE TRIGGER trigger_register_copyright_minimal_purge_delete_work
  BEFORE DELETE ON copyright_notice_retained_parties FOR EACH ROW
  EXECUTE FUNCTION fn_register_copyright_minimal_purge_row_work();
CREATE TRIGGER trigger_register_copyright_minimal_purge_delete_work
  BEFORE DELETE ON copyright_account_suspension_reliances FOR EACH ROW
  EXECUTE FUNCTION fn_register_copyright_minimal_purge_row_work();
CREATE TRIGGER trigger_register_copyright_minimal_purge_delete_work
  BEFORE DELETE ON copyright_notice_minimal_purge_continuations FOR EACH ROW
  EXECUTE FUNCTION fn_register_copyright_minimal_purge_row_work();

COMMENT ON COLUMN copyright_legal_mutation_sequence_states.transparency_generation IS 'Monotone aggregate report generation, invalidating finite missing-report proofs without touching every case.';
CREATE FUNCTION fn_register_copyright_transparency_generation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE copyright_legal_mutation_sequence_states SET transparency_generation = transparency_generation + 1 WHERE is_singleton;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trigger_register_copyright_transparency_generation
AFTER INSERT ON copyright_eu_transparency_reports FOR EACH ROW
EXECUTE FUNCTION fn_register_copyright_transparency_generation();

-- Compact nonpersonal coverage boundary. No per-event history survives case purge.
CREATE TABLE copyright_transparency_erased_source_ranges (
  is_singleton boolean PRIMARY KEY DEFAULT true CHECK (is_singleton),
  earliest_at timestamptz NOT NULL,
  latest_at timestamptz NOT NULL CHECK (latest_at >= earliest_at),
  retired_source_generation bigint NOT NULL CHECK (retired_source_generation >= 0)
);
COMMENT ON TABLE copyright_transparency_erased_source_ranges IS 'Conservative time envelope of erased EU report facts, preventing false reconstruction of previously unmaterialized periods.';
COMMENT ON COLUMN copyright_transparency_erased_source_ranges.is_singleton IS 'Identifies the single nonpersonal erased-source coverage envelope.';
COMMENT ON COLUMN copyright_transparency_erased_source_ranges.earliest_at IS 'Earliest event instant whose source row was erased.';
COMMENT ON COLUMN copyright_transparency_erased_source_ranges.latest_at IS 'Latest event instant whose source row was erased.';
COMMENT ON COLUMN copyright_transparency_erased_source_ranges.retired_source_generation IS 'Maximum generation of retired report facts; an overlapping exact-period baseline must already contain this generation before it can be extended.';
CREATE FUNCTION fn_register_copyright_transparency_fact()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  SELECT transparency_generation INTO STRICT NEW.transparency_generation
    FROM copyright_legal_mutation_sequence_states WHERE is_singleton FOR SHARE;
  RETURN NEW;
END;
$$;
CREATE FUNCTION fn_register_copyright_transparency_source_erasure()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE event_at timestamptz; event_jurisdiction copyright_jurisdictions;
BEGIN
  event_jurisdiction := (to_jsonb(OLD)->>'jurisdiction')::copyright_jurisdictions;
  IF event_jurisdiction <> 'eu_dsa' THEN RETURN OLD; END IF;
  event_at := (to_jsonb(OLD)->>TG_ARGV[0])::timestamptz;
  INSERT INTO copyright_transparency_erased_source_ranges (is_singleton, earliest_at, latest_at, retired_source_generation)
    VALUES (true, event_at, event_at, OLD.transparency_generation)
    ON CONFLICT (is_singleton) DO UPDATE SET
      earliest_at = LEAST(copyright_transparency_erased_source_ranges.earliest_at, EXCLUDED.earliest_at),
      latest_at = GREATEST(copyright_transparency_erased_source_ranges.latest_at, EXCLUDED.latest_at),
      retired_source_generation = GREATEST(copyright_transparency_erased_source_ranges.retired_source_generation, EXCLUDED.retired_source_generation);
  RETURN OLD;
END;
$$;

CREATE TRIGGER trigger_stamp_copyright_transparency_fact BEFORE INSERT ON copyright_territorial_notice_receipts FOR EACH ROW EXECUTE FUNCTION fn_register_copyright_transparency_fact();
CREATE TRIGGER trigger_record_copyright_transparency_source_erasure BEFORE DELETE ON copyright_territorial_notice_receipts FOR EACH ROW EXECUTE FUNCTION fn_register_copyright_transparency_source_erasure('received_at');

CREATE TRIGGER trigger_stamp_copyright_transparency_fact BEFORE INSERT ON copyright_territorial_decisions FOR EACH ROW EXECUTE FUNCTION fn_register_copyright_transparency_fact();
CREATE TRIGGER trigger_record_copyright_transparency_source_erasure BEFORE DELETE ON copyright_territorial_decisions FOR EACH ROW EXECUTE FUNCTION fn_register_copyright_transparency_source_erasure('decided_at');

CREATE TRIGGER trigger_stamp_copyright_transparency_fact BEFORE INSERT ON copyright_territorial_redress_requests FOR EACH ROW EXECUTE FUNCTION fn_register_copyright_transparency_fact();
CREATE TRIGGER trigger_record_copyright_transparency_source_erasure BEFORE DELETE ON copyright_territorial_redress_requests FOR EACH ROW EXECUTE FUNCTION fn_register_copyright_transparency_source_erasure('received_at');

CREATE TRIGGER trigger_stamp_copyright_transparency_fact BEFORE INSERT ON copyright_territorial_redress_decisions FOR EACH ROW EXECUTE FUNCTION fn_register_copyright_transparency_fact();
CREATE TRIGGER trigger_record_copyright_transparency_source_erasure BEFORE DELETE ON copyright_territorial_redress_decisions FOR EACH ROW EXECUTE FUNCTION fn_register_copyright_transparency_source_erasure('decided_at');

CREATE TRIGGER trigger_stamp_copyright_transparency_fact BEFORE INSERT ON copyright_eu_supervised_complaints FOR EACH ROW EXECUTE FUNCTION fn_register_copyright_transparency_fact();
CREATE TRIGGER trigger_record_copyright_transparency_source_erasure BEFORE DELETE ON copyright_eu_supervised_complaints FOR EACH ROW EXECUTE FUNCTION fn_register_copyright_transparency_source_erasure('received_at');

CREATE TRIGGER trigger_stamp_copyright_transparency_fact BEFORE INSERT ON copyright_territorial_escalations FOR EACH ROW EXECUTE FUNCTION fn_register_copyright_transparency_fact();
CREATE TRIGGER trigger_record_copyright_transparency_source_erasure BEFORE DELETE ON copyright_territorial_escalations FOR EACH ROW EXECUTE FUNCTION fn_register_copyright_transparency_source_erasure('escalated_at');

CREATE FUNCTION fn_ensure_writable_copyright_intake()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_intake_id uuid; target_notice_id uuid;
BEGIN
  target_intake_id := CASE WHEN TG_TABLE_NAME = 'copyright_notice_email_intakes' THEN (to_jsonb(NEW)->>'id')::uuid
    WHEN to_jsonb(NEW) ? 'copyright_notice_email_intake_receipt_id'
      THEN (to_jsonb(NEW)->>'copyright_notice_email_intake_receipt_id')::uuid
    ELSE (to_jsonb(NEW)->>'copyright_notice_email_intake_id')::uuid END;
  IF TG_TABLE_NAME = 'copyright_notice_email_intake_notice_links' THEN
    target_notice_id := NEW.copyright_notice_id;
  ELSE
    SELECT copyright_notice_id INTO target_notice_id FROM copyright_notice_email_intake_notice_links
      WHERE copyright_notice_email_intake_receipt_id = target_intake_id;
  END IF;
  -- Some callers already hold intake/child locks. Never wait in the opposite lifetime order:
  -- a concurrent erasure rejects this write, while an admitted writer fences erasure until commit.
  IF target_notice_id IS NOT NULL AND NOT pg_try_advisory_xact_lock_shared(
    hashtextextended('copyright-erasure:' || target_notice_id::text, 0)) THEN
    RAISE EXCEPTION 'copyright intake erasure is in progress' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    BEGIN
      PERFORM id FROM copyright_notice_email_intakes WHERE id = target_intake_id FOR UPDATE NOWAIT;
    EXCEPTION WHEN lock_not_available THEN
      RAISE EXCEPTION 'copyright intake writer must acquire its owner before updating a child' USING ERRCODE = 'check_violation';
    END;
  ELSE
    PERFORM id FROM copyright_notice_email_intakes WHERE id = target_intake_id FOR UPDATE;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'copyright intake is unavailable' USING ERRCODE = 'check_violation'; END IF;
  IF TG_TABLE_NAME = 'copyright_notice_email_intake_notice_links' THEN
    PERFORM id FROM copyright_notice_email_intake_receipts
      WHERE id = target_intake_id AND current_preservation_hold_token IS NULL
        AND final_explanation_erasure_started_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'copyright standalone receipt preservation or retirement blocks association'
      USING ERRCODE = 'check_violation'; END IF;
  END IF;
  -- The intake could have gained its first association while this row lock was pending.
  IF TG_TABLE_NAME <> 'copyright_notice_email_intake_notice_links' THEN
    SELECT copyright_notice_id INTO target_notice_id FROM copyright_notice_email_intake_notice_links
      WHERE copyright_notice_email_intake_receipt_id = target_intake_id;
  END IF;
  IF target_notice_id IS NOT NULL AND NOT pg_try_advisory_xact_lock_shared(
    hashtextextended('copyright-erasure:' || target_notice_id::text, 0)) THEN
    RAISE EXCEPTION 'copyright intake erasure is in progress' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM copyright_notice_email_intake_receipts receipt
      WHERE receipt.id = target_intake_id AND receipt.final_explanation_erasure_started_at IS NOT NULL)
    OR EXISTS (SELECT 1 FROM copyright_notice_minimal_purge_continuations work
    WHERE work.copyright_notice_identity_id = target_notice_id AND work.erasure_started_at IS NOT NULL
      AND (TG_OP = 'INSERT' OR NOT fn_copyright_retention_erasure_permitted(TG_TABLE_NAME, to_jsonb(OLD), to_jsonb(NEW))))
    OR EXISTS (SELECT 1 FROM copyright_email_intake_encryption_keys owned
    JOIN copyright_retention_keys key ON key.id = owned.copyright_retention_key_id
    WHERE owned.copyright_notice_email_intake_id = target_intake_id AND key.destroyed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'copyright intake has expired' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_require_writable_copyright_intake BEFORE INSERT OR UPDATE ON copyright_notice_email_intake_parses FOR EACH ROW EXECUTE FUNCTION fn_ensure_writable_copyright_intake();

CREATE TRIGGER trigger_require_writable_copyright_intake BEFORE INSERT OR UPDATE ON copyright_notice_email_intake_attachments FOR EACH ROW EXECUTE FUNCTION fn_ensure_writable_copyright_intake();

CREATE TRIGGER trigger_require_writable_copyright_intake BEFORE INSERT OR UPDATE ON copyright_notice_email_intake_recommendations FOR EACH ROW EXECUTE FUNCTION fn_ensure_writable_copyright_intake();

CREATE TRIGGER trigger_require_writable_copyright_intake BEFORE INSERT OR UPDATE ON copyright_notice_email_intake_reviews FOR EACH ROW EXECUTE FUNCTION fn_ensure_writable_copyright_intake();

CREATE TRIGGER trigger_require_writable_copyright_intake BEFORE INSERT OR UPDATE ON copyright_notice_email_thread_references FOR EACH ROW EXECUTE FUNCTION fn_ensure_writable_copyright_intake();

CREATE TRIGGER trigger_require_writable_copyright_intake BEFORE INSERT OR UPDATE ON copyright_notice_email_intake_notice_links FOR EACH ROW EXECUTE FUNCTION fn_ensure_writable_copyright_intake();

CREATE TRIGGER trigger_register_copyright_suspension_reliance_sequence
AFTER INSERT OR UPDATE ON copyright_account_suspension_reliances
FOR EACH ROW EXECUTE FUNCTION fn_register_copyright_legal_mutation_sequence();

-- The DELETE owns the reliance row before this fresh SPI check. A concurrent
-- source INSERT needs its FK key-share lock, so no unseen bridge may cascade.
-- Current suspension producers take the final-user-purge lifetime exclusively;
-- the bounded postroot drain holds it shared before its case and party locks.
CREATE FUNCTION fn_reject_copyright_suspension_reliance_purge()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  target_notice_id uuid := NULLIF(current_setting('app.copyright_minimal_purge_notice_id', true), '')::uuid;
BEGIN
  IF current_setting('app.copyright_minimal_purge_phase_table', true)
      IS DISTINCT FROM 'copyright_account_suspension_reliances'
    OR OLD.released_at IS NULL
    OR NOT EXISTS (SELECT 1 FROM copyright_notice_minimal_purge_continuations work
      WHERE work.copyright_notice_identity_id = target_notice_id AND work.root_purged_at IS NOT NULL)
    OR EXISTS (SELECT 1 FROM copyright_notices notice WHERE notice.id = target_notice_id)
    OR NOT EXISTS (SELECT 1 FROM copyright_notice_retained_parties party
      WHERE party.copyright_notice_identity_id = target_notice_id AND party.account_user_id = OLD.account_user_id)
    OR EXISTS (SELECT 1 FROM copyright_account_suspension_incidents source
      WHERE source.account_user_id = OLD.account_user_id) THEN
    RAISE EXCEPTION 'copyright suspension authority is retained until released and its sources are drained'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER trigger_reject_copyright_suspension_reliance_purge
BEFORE DELETE ON copyright_account_suspension_reliances FOR EACH ROW
EXECUTE FUNCTION fn_reject_copyright_suspension_reliance_purge();

CREATE FUNCTION fn_update_purged_copyright_suspension_reliance()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.purged_at IS NULL AND NEW.purged_at IS NOT NULL THEN
    UPDATE copyright_account_suspension_reliances SET released_at = NEW.purged_at
      WHERE account_user_id = NEW.id AND released_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trigger_release_purged_copyright_suspension_reliance
AFTER UPDATE OF purged_at ON retained_user_identities FOR EACH ROW
EXECUTE FUNCTION fn_update_purged_copyright_suspension_reliance();

CREATE TRIGGER trigger_require_writable_copyright_intake BEFORE INSERT ON copyright_email_intake_encryption_keys
FOR EACH ROW EXECUTE FUNCTION fn_ensure_writable_copyright_intake();

CREATE INDEX idx_cpyrght_ntc_eml_intk_ntc_lnks__case_intake ON copyright_notice_email_intake_notice_links (copyright_notice_id, copyright_notice_email_intake_receipt_id);
CREATE INDEX idx_cpyrght_ntc_evdnc_artfcts__case ON copyright_notice_evidence_artifacts (copyright_notice_id, id);

CREATE TRIGGER trigger_require_writable_copyright_intake BEFORE UPDATE ON copyright_notice_email_intakes
FOR EACH ROW EXECUTE FUNCTION fn_ensure_writable_copyright_intake();

CREATE TRIGGER trigger_register_copy_blocker_replay_receipt BEFORE INSERT ON copyright_notice_replay_receipts
FOR EACH ROW EXECUTE FUNCTION fn_register_copyright_minimal_blocker_mutation('direct');
CREATE FUNCTION fn_register_final_copyright_replay_case_purge()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE copyright_replay_retention_groups SET case_purged_at = NULLIF(current_setting('app.copyright_minimal_purge_now', true), '')::timestamptz
    WHERE id = OLD.copyright_replay_retention_group_id AND case_purged_at IS NULL;
  RETURN OLD;
END;
$$;
CREATE TRIGGER trigger_zz_stamp_final_copyright_replay_case_purge BEFORE DELETE ON copyright_notices
FOR EACH ROW EXECUTE FUNCTION fn_register_final_copyright_replay_case_purge();

-- Substantive DSA outcomes advance one compact case clock; claims/leases do not.
CREATE FUNCTION fn_register_copyright_dsa_activity()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_notice_id uuid; activity_at timestamptz;
BEGIN
  IF TG_TABLE_NAME = 'copyright_dsa_statement_submission_attempts' THEN
    SELECT restriction.copyright_notice_id INTO target_notice_id
      FROM copyright_dsa_statement_submissions submission
      JOIN copyright_restrictions restriction ON restriction.id = submission.copyright_restriction_id
      WHERE submission.id = NEW.copyright_dsa_statement_submission_id;
    activity_at := uuid_extract_timestamp(NEW.id);
  ELSE
    SELECT copyright_notice_id INTO target_notice_id FROM copyright_restrictions WHERE id = NEW.copyright_restriction_id;
    activity_at := GREATEST(NEW.submitted_at, NEW.failed_at);
  END IF;
  IF activity_at IS NOT NULL THEN
    PERFORM id FROM copyright_notices WHERE id = target_notice_id FOR UPDATE;
    UPDATE copyright_notice_retained_identities SET dsa_activity_at = GREATEST(dsa_activity_at, activity_at),
      proof_generation = proof_generation + 1 WHERE id = target_notice_id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trigger_register_copyright_dsa_outcome_activity
AFTER INSERT OR UPDATE OF submitted_at, failed_at ON copyright_dsa_statement_submissions
FOR EACH ROW EXECUTE FUNCTION fn_register_copyright_dsa_activity();
CREATE TRIGGER trigger_register_copyright_dsa_attempt_activity
AFTER INSERT ON copyright_dsa_statement_submission_attempts
FOR EACH ROW EXECUTE FUNCTION fn_register_copyright_dsa_activity();

CREATE FUNCTION fn_project_copyright_receipt_explanation_eligible(target_receipt_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM copyright_notice_email_intake_receipts receipt
    WHERE receipt.id = target_receipt_id AND receipt.reviewed_at IS NOT NULL
      AND receipt.erased_at IS NOT NULL
      AND receipt.final_explanation_erased_at IS NULL AND receipt.current_preservation_hold_token IS NULL
      AND GREATEST(receipt.created_at, receipt.reviewed_at, receipt.last_preservation_hold_released_at,
        receipt.last_delivery_activity_at) <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC' - make_interval(months => 72)) AT TIME ZONE 'UTC'
      AND NOT EXISTS (SELECT 1 FROM copyright_notice_email_intakes intake WHERE intake.id = receipt.id)
      AND NOT EXISTS (SELECT 1 FROM copyright_notice_email_intake_notice_links link
        WHERE link.copyright_notice_email_intake_receipt_id = receipt.id)
      AND NOT EXISTS (SELECT 1 FROM copyright_notice_delivery_work_items delivery
        WHERE delivery.copyright_notice_email_intake_receipt_id = receipt.id AND delivery.state IN ('pending', 'claimed')))
$$;
COMMENT ON FUNCTION fn_project_copyright_receipt_explanation_eligible IS 'Exact standalone seventy-two-month review, actual delivery and preservation-release clock with private-intake, linked-case and pending-delivery blockers.';

-- One fenced retirement clears the standalone final result and its provenance after key destruction.
CREATE FUNCTION fn_project_copyright_receipt_explanation_retirement_allowed(old_row jsonb, new_row jsonb)
RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE receipt_id uuid := (old_row->>'id')::uuid;
BEGIN
  IF current_setting('app.copyright_receipt_retention_id', true) IS DISTINCT FROM receipt_id::text
    OR old_row->>'reviewed_at' IS NULL OR old_row->>'current_preservation_hold_token' IS NOT NULL
    OR old_row->>'final_explanation_erased_at' IS NOT NULL
    OR NOT fn_project_copyright_receipt_explanation_eligible(receipt_id)
    THEN RETURN false; END IF;
  IF old_row->>'final_explanation_erasure_started_at' IS NULL THEN
    RETURN new_row->>'final_explanation_erasure_started_at' IS NOT NULL
      AND (old_row - 'final_explanation_erasure_started_at') =
        (new_row - 'final_explanation_erasure_started_at');
  END IF;
  RETURN new_row->>'final_explanation_erasure_started_at' = old_row->>'final_explanation_erasure_started_at'
    AND new_row->>'final_explanation_erased_at' IS NOT NULL
    AND new_row->>'review_decision' IS NULL AND new_row->>'reviewed_by_id' IS NULL
    AND new_row->>'reviewed_at' IS NULL AND new_row->>'review_rationale_ciphertext' IS NULL
    AND new_row->>'last_delivery_activity_at' IS NULL
    AND new_row->>'preservation_hold_kind' IS NULL
    AND new_row->>'preservation_hold_placed_at' IS NULL
    AND new_row->>'preservation_hold_placed_by_id' IS NULL
    AND new_row->>'preservation_hold_released_at' IS NULL
    AND new_row->>'preservation_hold_released_by_id' IS NULL
    AND new_row->>'last_preservation_hold_released_at' IS NULL
    AND (old_row - ARRAY['review_decision', 'reviewed_by_id', 'reviewed_at',
      'review_rationale_ciphertext', 'last_delivery_activity_at', 'preservation_hold_kind',
      'preservation_hold_placed_at', 'preservation_hold_placed_by_id',
      'preservation_hold_released_at', 'preservation_hold_released_by_id',
      'last_preservation_hold_released_at', 'final_explanation_erased_at']) =
      (new_row - ARRAY['review_decision', 'reviewed_by_id', 'reviewed_at',
      'review_rationale_ciphertext', 'last_delivery_activity_at', 'preservation_hold_kind',
      'preservation_hold_placed_at', 'preservation_hold_placed_by_id',
      'preservation_hold_released_at', 'preservation_hold_released_by_id',
      'last_preservation_hold_released_at', 'final_explanation_erased_at'])
    AND NOT EXISTS (SELECT 1 FROM copyright_email_receipt_encryption_keys owned
      JOIN copyright_retention_keys key ON key.id = owned.copyright_retention_key_id
      WHERE owned.copyright_notice_email_intake_receipt_id = receipt_id AND key.destroyed_at IS NULL);
END;
$$;
COMMENT ON FUNCTION fn_project_copyright_receipt_explanation_retirement_allowed IS 'Authorizes fenced standalone review retirement after seventy-two calendar months, current preservation and delivery checks, and receipt-key destruction; only SES replay identity remains.';

CREATE TRIGGER trigger_register_copyright_minimal_purge_delete_work
  BEFORE DELETE ON copyright_notice_retained_identities FOR EACH ROW
  EXECUTE FUNCTION fn_register_copyright_minimal_purge_row_work();
CREATE TRIGGER trigger_register_copyright_minimal_purge_delete_work
  BEFORE DELETE ON copyright_notice_email_intake_reviews FOR EACH ROW
  EXECUTE FUNCTION fn_register_copyright_minimal_purge_row_work();

DO $$
DECLARE owned_table text;
BEGIN
  FOREACH owned_table IN ARRAY ARRAY[
    'copyright_notice_submission_assessment_identities', 'copyright_territorial_decision_identities',
    'copyright_territorial_redress_decision_identities', 'copyright_notice_guest_capability_identities',
    'copyright_notice_thread_party_generations', 'copyright_notice_thread_blocker_generations',
    'copyright_notice_thread_retention_activities', 'copyright_notice_email_thread_retirements'
  ] LOOP
    EXECUTE format('CREATE TRIGGER trigger_reject_copyright_current_owner_deletion '
      || 'BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_purge_only_mutation()', owned_table);
  END LOOP;
END;
$$;

CREATE TRIGGER trigger_register_copyright_minimal_purge_cursor_work
  BEFORE UPDATE OF cursor_blocker_assessment_identity_id ON copyright_notice_operational_retention_cursors
  FOR EACH ROW WHEN (OLD.cursor_blocker_assessment_identity_id IS DISTINCT FROM NEW.cursor_blocker_assessment_identity_id)
  EXECUTE FUNCTION fn_register_copyright_minimal_purge_row_work();
