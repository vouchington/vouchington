-- Canonical pre-launch copyright minimal-record purge predicate and finite-case guard.
-- Defined after every legal, notification, and agent receipt table it references.

CREATE TABLE copyright_legal_mutation_sequence_states (
  is_singleton boolean PRIMARY KEY DEFAULT true CHECK (is_singleton),
  current_sequence bigint NOT NULL DEFAULT 0 CHECK (current_sequence >= 0),
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
    SET legal_retention_mutation_sequence = assigned_sequence WHERE id = target_user_id;
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
      proof_generation = proof_generation + 1
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
    UPDATE copyright_notice_retained_identities
      SET proof_generation = proof_generation + 1 WHERE id = target_notice_id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trigger_register_copy_blocker_submission
AFTER INSERT ON copyright_notice_submissions FOR EACH ROW
EXECUTE FUNCTION fn_register_copyright_minimal_blocker_mutation('direct');
CREATE TRIGGER trigger_register_copy_blocker_target
AFTER INSERT ON copyright_notice_targets FOR EACH ROW
EXECUTE FUNCTION fn_register_copyright_minimal_blocker_mutation('direct');
CREATE TRIGGER trigger_register_copy_blocker_target_image
AFTER INSERT ON copyright_notice_target_images FOR EACH ROW
EXECUTE FUNCTION fn_register_copyright_minimal_blocker_mutation('target');
CREATE TRIGGER trigger_register_copy_blocker_form_intake
AFTER INSERT ON copyright_notice_form_intakes FOR EACH ROW
EXECUTE FUNCTION fn_register_copyright_minimal_blocker_mutation('direct');
CREATE TRIGGER trigger_register_copy_blocker_form_review
AFTER INSERT ON copyright_notice_form_intake_reviews FOR EACH ROW
EXECUTE FUNCTION fn_register_copyright_minimal_blocker_mutation('intake');
CREATE TRIGGER trigger_register_copy_blocker_form_attempt
AFTER INSERT OR UPDATE OF completed_at, failed_at, copyright_notice_form_screening_id
ON copyright_notice_form_screening_attempts FOR EACH ROW
EXECUTE FUNCTION fn_register_copyright_minimal_blocker_mutation('intake');
CREATE TRIGGER trigger_register_copy_blocker_assessment
AFTER INSERT ON copyright_notice_submission_assessments FOR EACH ROW
EXECUTE FUNCTION fn_register_copyright_minimal_blocker_mutation('direct');
CREATE TRIGGER trigger_register_copy_blocker_appeal_review
AFTER INSERT ON copyright_notice_appeal_reviews FOR EACH ROW
EXECUTE FUNCTION fn_register_copyright_minimal_blocker_mutation('submission');
CREATE TRIGGER trigger_register_copy_blocker_counter_review
AFTER INSERT ON copyright_notice_counter_notice_reviews FOR EACH ROW
EXECUTE FUNCTION fn_register_copyright_minimal_blocker_mutation('submission');
CREATE TRIGGER trigger_register_copy_blocker_hold_assessment
AFTER INSERT ON copyright_notice_legal_hold_assessments FOR EACH ROW
EXECUTE FUNCTION fn_register_copyright_minimal_blocker_mutation('direct');
CREATE TRIGGER trigger_register_copy_blocker_hold_resolution
AFTER INSERT ON copyright_notice_legal_hold_resolutions FOR EACH ROW
EXECUTE FUNCTION fn_register_copyright_minimal_blocker_mutation('direct');
CREATE TRIGGER trigger_register_copy_blocker_delivery_work
AFTER INSERT OR UPDATE OF recipient_role, channel, delivery_kind
ON copyright_notice_delivery_work_items FOR EACH ROW
EXECUTE FUNCTION fn_register_copyright_minimal_blocker_mutation('direct');
CREATE TRIGGER trigger_register_copy_blocker_delivery_recipient
AFTER INSERT ON copyright_notice_delivery_recipients FOR EACH ROW
EXECUTE FUNCTION fn_register_copyright_minimal_blocker_mutation('delivery_work');
CREATE TRIGGER trigger_register_copy_blocker_restriction
AFTER INSERT OR UPDATE OF lifted_at ON copyright_restrictions FOR EACH ROW
EXECUTE FUNCTION fn_register_copyright_minimal_blocker_mutation('direct');
CREATE TRIGGER trigger_register_copy_blocker_staydown_entry
AFTER INSERT ON copyright_staydown_entries FOR EACH ROW
EXECUTE FUNCTION fn_register_copyright_minimal_blocker_mutation('restriction');
CREATE TRIGGER trigger_register_copy_blocker_staydown_match
AFTER INSERT OR UPDATE OF reviewed_at ON copyright_staydown_matches FOR EACH ROW
EXECUTE FUNCTION fn_register_copyright_minimal_blocker_mutation('staydown_entry');
CREATE TRIGGER trigger_register_copy_blocker_territorial_receipt
AFTER INSERT ON copyright_territorial_notice_receipts FOR EACH ROW
EXECUTE FUNCTION fn_register_copyright_minimal_blocker_mutation('direct');
CREATE TRIGGER trigger_register_copy_blocker_territorial_decision
AFTER INSERT ON copyright_territorial_decisions FOR EACH ROW
EXECUTE FUNCTION fn_register_copyright_minimal_blocker_mutation('direct');
CREATE TRIGGER trigger_register_copy_blocker_redress_request
AFTER INSERT ON copyright_territorial_redress_requests FOR EACH ROW
EXECUTE FUNCTION fn_register_copyright_minimal_blocker_mutation('direct');
CREATE TRIGGER trigger_register_copy_blocker_redress_decision
AFTER INSERT ON copyright_territorial_redress_decisions FOR EACH ROW
EXECUTE FUNCTION fn_register_copyright_minimal_blocker_mutation('redress_request');
CREATE TRIGGER trigger_register_copy_blocker_email_correspondence
AFTER INSERT ON copyright_notice_email_correspondence_reviews FOR EACH ROW
EXECUTE FUNCTION fn_register_copyright_minimal_blocker_mutation('direct');

CREATE FUNCTION fn_project_copyright_minimal_record_purge_eligible(
  target_notice_id uuid, purge_now timestamptz, cutoff timestamptz
) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM copyright_notices notice
    JOIN copyright_notice_retention_erasures erased
      ON erased.copyright_notice_id = notice.id
    JOIN copyright_notice_minimal_purge_continuations work
      ON work.copyright_notice_identity_id = notice.id
    JOIN copyright_notice_retained_identities identity ON identity.id = notice.id
    JOIN copyright_legal_mutation_sequence_states mutation_state ON mutation_state.is_singleton
    WHERE notice.id = target_notice_id
      AND notice.jurisdiction IN ('us_dmca', 'eu_dsa', 'uk')
      AND purge_now IS NOT NULL AND cutoff IS NOT NULL
      AND cutoff <= purge_now - INTERVAL '3 years'
      AND work.is_party_scan_complete
      AND work.is_blocker_scan_complete AND NOT work.has_blocker
      AND work.proof_generation = identity.proof_generation
      AND work.mutation_cursor = mutation_state.current_sequence
      AND work.open_hold_count = 0
      AND work.unpurged_incident_account_count = 0
      AND identity.dsa_statement_count = 0
      AND NOT EXISTS (
        SELECT 1 FROM copyright_repeat_infringer_incidents incident
        WHERE incident.copyright_notice_id = notice.id AND incident.is_operative
      )
      AND NOT EXISTS (
        SELECT 1 FROM copyright_restrictions restriction
        WHERE restriction.copyright_notice_id = notice.id AND restriction.lifted_at IS NULL
      )
      -- DSA legal rows remain blocked pending the separate #3628 scope decision.
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
      AND GREATEST(
        fn_project_copyright_minimal_record_legal_clock(notice.id),
        work.legal_clock_at, work.party_legal_clock_at
      ) <= cutoff
  )
$$;

-- Every case-owned descendant except the two DSA blocker tables and two fixed
-- companions appears below. The authoritative eligibility predicate excludes
-- DSA cases; one rationale per lifecycle change and one erasure marker per
-- notice may cascade only with their already bounded parent deletion.
CREATE FUNCTION fn_project_copyright_minimal_purge_children_drained(target_notice_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT true
    AND NOT EXISTS (SELECT 1 FROM ai_agent_call_receipts child
      JOIN copyright_notice_submissions p0 ON child.copyright_notice_submission_id = p0.id
      WHERE p0.copyright_notice_id = target_notice_id)
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
      JOIN copyright_notice_submission_assessments p0 ON child.copyright_notice_submission_assessment_id = p0.id
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

      WHERE child.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_notice_form_screening_attempts child
      JOIN copyright_notice_form_intakes p0 ON child.copyright_notice_form_intake_id = p0.id
      WHERE p0.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_notice_form_screening_work_items child
      JOIN copyright_notice_form_intakes p0 ON child.copyright_notice_form_intake_id = p0.id
      WHERE p0.copyright_notice_id = target_notice_id)
    AND NOT EXISTS (SELECT 1 FROM copyright_notice_form_screenings child
      JOIN copyright_notice_form_intakes p0 ON child.copyright_notice_form_intake_id = p0.id
      WHERE p0.copyright_notice_id = target_notice_id)
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

      WHERE child.copyright_notice_id = target_notice_id)
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
      'public.ai_agent_call_receipts|fk_ai_agent_call_receipts__copyright_notice_submission|{copyright_notice_submission_id}|public.copyright_notice_submissions|{id}|c|true',
      'public.copyright_automatic_withholding_refusals|fk_copyright_automatic_withholding_refusals__notice_submission|{copyright_notice_submission_id}|public.copyright_notice_submissions|{id}|c|true',
      'public.copyright_claimant_misuse_events|copyright_claimant_misuse_events_copyright_notice_id_fkey|{copyright_notice_id}|public.copyright_notices|{id}|c|true',
      'public.copyright_claimant_misuse_events|copyright_claimant_misuse_events_copyright_restriction_id_fkey|{copyright_restriction_id}|public.copyright_restrictions|{id}|c|true',
      'public.copyright_claimant_misuse_events|fk_copyrig_claimant_misuse_events__notice_submission_assessment|{copyright_notice_submission_assessment_id}|public.copyright_notice_submission_assessments|{id}|c|true',
      'public.copyright_claimant_misuse_events|fk_copyright_claimant_misuse_events__notice_submission|{copyright_notice_submission_id}|public.copyright_notice_submissions|{id}|c|true',
      'public.copyright_claimant_suspension_reversals|fk_copyright_claimant_suspension_reversals__restriction|{copyright_restriction_id}|public.copyright_restrictions|{id}|c|true',
      'public.copyright_dsa_statement_submission_attempts|copyright_dsa_statement_submi_copyright_dsa_statement_subm_fkey|{copyright_dsa_statement_submission_id}|public.copyright_dsa_statement_submissions|{id}|c|true',
      'public.copyright_dsa_statement_submissions|copyright_dsa_statement_submissio_copyright_restriction_id_fkey|{copyright_restriction_id}|public.copyright_restrictions|{id}|r|true',
      'public.copyright_eu_dispute_settlement_outcomes|fk_copyright_eu_dispute_settlement_outcomes__referral|{copyright_eu_dispute_settlement_referral_id}|public.copyright_eu_dispute_settlement_referrals|{id}|c|true',
      'public.copyright_eu_dispute_settlement_referrals|fk_copyright_eu_dispute_settlement_referrals__decision|{copyright_notice_id,copyright_territorial_decision_id}|public.copyright_territorial_decisions|{copyright_notice_id,id}|c|true',
      'public.copyright_eu_dispute_settlement_referrals|fk_copyright_eu_dispute_settlement_referrals__notice|{copyright_notice_id,jurisdiction}|public.copyright_notices|{id,jurisdiction}|c|true',
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
      'public.copyright_notice_counter_notice_assessment_targets|fk_copyright_counter_targets__parent_notice|{copyright_notice_id,copyright_notice_submission_assessment_id}|public.copyright_notice_submission_assessments|{copyright_notice_id,id}|c|true',
      'public.copyright_notice_counter_notice_assessment_targets|fk_copyright_counter_targets__target_notice|{copyright_notice_id,copyright_notice_target_id}|public.copyright_notice_targets|{copyright_notice_id,id}|c|true',
      'public.copyright_notice_counter_notice_reviews|fk_copyrig_notice_counter_notice_reviews__submission_assessment|{copyright_notice_submission_assessment_id}|public.copyright_notice_submission_assessments|{id}|c|true',
      'public.copyright_notice_counter_notice_reviews|fk_copyright_notice_counter_notice_reviews__deadline|{copyright_notice_deadline_id}|public.copyright_notice_deadlines|{id}|c|true',
      'public.copyright_notice_counter_notice_reviews|fk_copyright_notice_counter_notice_reviews__submission|{copyright_notice_submission_id}|public.copyright_notice_submissions|{id}|c|true',
      'public.copyright_notice_deadlines|copyright_notice_deadlines_copyright_notice_id_fkey|{copyright_notice_id}|public.copyright_notices|{id}|c|true',
      'public.copyright_notice_deadlines|fk_copyrig_notice_deadlin__qualifying_counter_notice_assessment|{qualifying_counter_notice_assessment_id}|public.copyright_notice_submission_assessments|{id}|c|true',
      'public.copyright_notice_delivery_attempt_results|copyright_notice_delivery_attempt_results_attempt_id_fkey|{attempt_id}|public.copyright_notice_delivery_attempts|{id}|c|true',
      'public.copyright_notice_delivery_attempts|copyright_notice_delivery_attempts_work_item_id_fkey|{work_item_id}|public.copyright_notice_delivery_work_items|{id}|c|true',
      'public.copyright_notice_delivery_recipients|fk_copyright_notice_delivery_recipients__intent|{copyright_notice_delivery_work_item_id}|public.copyright_notice_delivery_work_items|{id}|r|true',
      'public.copyright_notice_delivery_work_items|copyright_notice_delivery_work_items_copyright_notice_id_fkey|{copyright_notice_id}|public.copyright_notices|{id}|c|true',
      'public.copyright_notice_delivery_work_items|fk_copyri_notice_delive_intents__correspondence_message__notice|{copyright_notice_correspondence_message_id,copyright_notice_id}|public.copyright_notice_correspondence_messages|{id,copyright_notice_id}|c|true',
      'public.copyright_notice_delivery_work_items|fk_copyright_notice_delivery_work_items__submission__notice|{copyright_notice_submission_id,copyright_notice_id}|public.copyright_notice_submissions|{id,copyright_notice_id}|c|true',
      'public.copyright_notice_email_correspondence_reviews|fk_copyright_notice_email_correspondenc_reviews__correspondence|{copyright_notice_correspondence_message_id}|public.copyright_notice_correspondence_messages|{id}|c|true',
      'public.copyright_notice_email_correspondence_reviews|fk_copyright_notice_email_correspondence_reviews__notice|{copyright_notice_id}|public.copyright_notices|{id}|c|true',
      'public.copyright_notice_email_correspondence_reviews|fk_copyright_notice_email_correspondence_reviews__submission|{copyright_notice_submission_id}|public.copyright_notice_submissions|{id}|c|true',
      'public.copyright_notice_email_intake_notice_links|fk_copyright_notice_email_intake_notice_links__notice|{copyright_notice_id}|public.copyright_notices|{id}|c|true',
      'public.copyright_notice_evidence_artifacts|fk_copyright_artifacts__parent_notice|{copyright_notice_id,copyright_notice_submission_id}|public.copyright_notice_submissions|{copyright_notice_id,id}|c|true',
      'public.copyright_notice_form_intake_reviews|fk_copyright_notice_form_intake_reviews__intake|{copyright_notice_form_intake_id}|public.copyright_notice_form_intakes|{id}|c|true',
      'public.copyright_notice_form_intakes|copyright_notice_form_intakes_copyright_notice_id_fkey|{copyright_notice_id}|public.copyright_notices|{id}|c|true',
      'public.copyright_notice_form_intakes|fk_copyright_notice_form_intakes__submission|{copyright_notice_submission_id}|public.copyright_notice_submissions|{id}|c|true',
      'public.copyright_notice_form_screening_attempts|fk_copyright_notice_form_screening_attempts__intake__screening|{copyright_notice_form_intake_id,copyright_notice_form_screening_id}|public.copyright_notice_form_screenings|{copyright_notice_form_intake_id,id}|c|true',
      'public.copyright_notice_form_screening_attempts|fk_copyright_notice_form_screening_attempts__intake|{copyright_notice_form_intake_id}|public.copyright_notice_form_intakes|{id}|c|true',
      'public.copyright_notice_form_screening_work_items|copyright_notice_form_screen_copyright_notice_form_intake_fkey1|{copyright_notice_form_intake_id,attempt_id}|public.copyright_notice_form_screening_attempts|{copyright_notice_form_intake_id,id}|c|true',
      'public.copyright_notice_form_screening_work_items|copyright_notice_form_screeni_copyright_notice_form_intake_fkey|{copyright_notice_form_intake_id}|public.copyright_notice_form_intakes|{id}|c|true',
      'public.copyright_notice_form_screenings|fk_copyright_notice_form_screenings__intake|{copyright_notice_form_intake_id}|public.copyright_notice_form_intakes|{id}|c|true',
      'public.copyright_notice_guest_capabilities|copyright_notice_guest_capabilities_copyright_notice_id_fkey|{copyright_notice_id}|public.copyright_notices|{id}|c|true',
      'public.copyright_notice_legal_hold_assessment_targets|fk_copyright_hold_targets__parent_notice|{copyright_notice_id,copyright_notice_legal_hold_assessment_id}|public.copyright_notice_legal_hold_assessments|{copyright_notice_id,id}|c|true',
      'public.copyright_notice_legal_hold_assessment_targets|fk_copyright_hold_targets__target_notice|{copyright_notice_id,copyright_notice_target_id}|public.copyright_notice_targets|{copyright_notice_id,id}|c|true',
      'public.copyright_notice_legal_hold_assessments|fk_copyright_hold_assessments__parent_notice|{copyright_notice_id,copyright_notice_submission_id}|public.copyright_notice_submissions|{copyright_notice_id,id}|c|true',
      'public.copyright_notice_legal_hold_resolutions|fk_copyright_hold_resolutions__parent_notice|{copyright_notice_id,copyright_notice_legal_hold_assessment_id}|public.copyright_notice_legal_hold_assessments|{copyright_notice_id,id}|c|true',
      'public.copyright_notice_lifecycle_change_rationales|copyright_notice_lifecycle_change_rationales_id_fkey|{id}|public.copyright_notice_lifecycle_changes|{id}|c|true',
      'public.copyright_notice_lifecycle_change_rationales|fk_copyright_notice_lifecycle_change_rationales__notice__|{copyright_notice_id,id}|public.copyright_notice_lifecycle_changes|{copyright_notice_id,id}|c|true',
      'public.copyright_notice_lifecycle_changes|copyright_lifecycle_event_action_intent_fk|{copyright_notice_id,copyright_notice_action_intent_id}|public.copyright_notice_action_work_items|{copyright_notice_id,id}|c|true',
      'public.copyright_notice_lifecycle_changes|copyright_lifecycle_event_delivery_intent_fk|{copyright_notice_delivery_work_item_id}|public.copyright_notice_delivery_work_items|{id}|c|true',
      'public.copyright_notice_lifecycle_changes|copyright_lifecycle_event_guest_capability_fk|{copyright_notice_guest_capability_id,copyright_notice_id}|public.copyright_notice_guest_capabilities|{id,copyright_notice_id}|r|true',
      'public.copyright_notice_lifecycle_changes|copyright_notice_lifecycle_changes_copyright_notice_id_fkey|{copyright_notice_id}|public.copyright_notices|{id}|c|true',
      'public.copyright_notice_lifecycle_changes|fk_copyright_lifecycle_changes__review_rationale|{review_rationale_id}|public.copyright_notice_lifecycle_change_rationales|{id}|a|true',
      'public.copyright_notice_lifecycle_changes|fk_copyright_lifecycle_events__artifact_notice|{copyright_notice_id,copyright_notice_evidence_artifact_id}|public.copyright_notice_evidence_artifacts|{copyright_notice_id,id}|c|true',
      'public.copyright_notice_lifecycle_changes|fk_copyright_lifecycle_events__assessment_notice|{copyright_notice_id,copyright_notice_submission_assessment_id}|public.copyright_notice_submission_assessments|{copyright_notice_id,id}|c|true',
      'public.copyright_notice_lifecycle_changes|fk_copyright_lifecycle_events__correspondence_notice|{copyright_notice_id,copyright_notice_correspondence_id}|public.copyright_notice_correspondence_messages|{copyright_notice_id,id}|c|true',
      'public.copyright_notice_lifecycle_changes|fk_copyright_lifecycle_events__deadline_notice|{copyright_notice_id,copyright_notice_deadline_id}|public.copyright_notice_deadlines|{copyright_notice_id,id}|c|true',
      'public.copyright_notice_lifecycle_changes|fk_copyright_lifecycle_events__email_intake_notice|{copyright_notice_id,copyright_notice_email_intake_id}|public.copyright_notice_email_intake_notice_links|{copyright_notice_id,copyright_notice_email_intake_id}|c|true',
      'public.copyright_notice_lifecycle_changes|fk_copyright_lifecycle_events__hold_assessment_notice|{copyright_notice_id,copyright_notice_legal_hold_assessment_id}|public.copyright_notice_legal_hold_assessments|{copyright_notice_id,id}|c|true',
      'public.copyright_notice_lifecycle_changes|fk_copyright_lifecycle_events__hold_resolution_notice|{copyright_notice_id,copyright_notice_legal_hold_resolution_id}|public.copyright_notice_legal_hold_resolutions|{copyright_notice_id,id}|c|true',
      'public.copyright_notice_lifecycle_changes|fk_copyright_lifecycle_events__restriction_notice|{copyright_notice_id,copyright_restriction_id}|public.copyright_restrictions|{copyright_notice_id,id}|c|true',
      'public.copyright_notice_lifecycle_changes|fk_copyright_lifecycle_events__submission_notice|{copyright_notice_id,copyright_notice_submission_id}|public.copyright_notice_submissions|{copyright_notice_id,id}|c|true',
      'public.copyright_notice_retention_erasures|copyright_notice_retention_erasures_copyright_notice_id_fkey|{copyright_notice_id}|public.copyright_notices|{id}|c|true',
      'public.copyright_notice_submission_assessments|fk_copyright_assessments__form_screening|{copyright_notice_form_screening_id}|public.copyright_notice_form_screenings|{id}|c|true',
      'public.copyright_notice_submission_assessments|fk_copyright_assessments__parent_notice|{copyright_notice_id,copyright_notice_submission_id}|public.copyright_notice_submissions|{copyright_notice_id,id}|c|true',
      'public.copyright_notice_submission_assessments|fk_copyright_assessments__supersedes_submission|{copyright_notice_submission_id,supersedes_assessment_id}|public.copyright_notice_submission_assessments|{copyright_notice_submission_id,id}|c|true',
      'public.copyright_notice_submission_guidance|fk_copyright_notice_submission_guidance__submission|{copyright_notice_submission_id}|public.copyright_notice_submissions|{id}|c|true',
      'public.copyright_notice_submission_requests|fk_copyright_notice_submission_requests__submission|{copyright_notice_submission_id}|public.copyright_notice_submissions|{id}|c|true',
      'public.copyright_notice_submission_targets|fk_copyright_submission_targets__parent_notice|{copyright_notice_id,copyright_notice_submission_id}|public.copyright_notice_submissions|{copyright_notice_id,id}|c|true',
      'public.copyright_notice_submission_targets|fk_copyright_submission_targets__target_notice|{copyright_notice_id,copyright_notice_target_id}|public.copyright_notice_targets|{copyright_notice_id,id}|c|true',
      'public.copyright_notice_submissions|copyright_notice_submissions_copyright_notice_id_fkey|{copyright_notice_id}|public.copyright_notices|{id}|c|true',
      'public.copyright_notice_submissions|copyright_submission_guest_capability_fk|{copyright_notice_guest_capability_id,copyright_notice_id}|public.copyright_notice_guest_capabilities|{id,copyright_notice_id}|r|true',
      'public.copyright_notice_target_images|copyright_notice_target_images_copyright_notice_target_id_fkey|{copyright_notice_target_id}|public.copyright_notice_targets|{id}|c|true',
      'public.copyright_notice_target_images|fk_copyright_notice_target_images__target__placement|{copyright_notice_target_id,placement_id}|public.copyright_notice_targets|{id,placement_id}|c|true',
      'public.copyright_notice_targets|copyright_notice_targets_copyright_notice_id_fkey|{copyright_notice_id}|public.copyright_notices|{id}|c|true',
      'public.copyright_notice_urgent_filings|fk_copyright_notice_urgent_filings__submission|{copyright_notice_submission_id}|public.copyright_notice_submissions|{id}|c|true',
      'public.copyright_repeat_infringer_dispositions|fk_copyright_repeat_infringer_dispositions__incident|{copyright_repeat_infringer_incident_id}|public.copyright_repeat_infringer_incidents|{id}|c|true',
      'public.copyright_repeat_infringer_incident_targets|fk_copyr_repeat_infringe_incident_targets__incident|{copyright_repeat_infringer_incident_id,copyright_notice_id}|public.copyright_repeat_infringer_incidents|{id,copyright_notice_id}|c|true',
      'public.copyright_repeat_infringer_incident_targets|fk_copyr_repeat_infringe_incident_targets__target|{copyright_notice_id,copyright_notice_target_id}|public.copyright_notice_targets|{copyright_notice_id,id}|c|true',
      'public.copyright_repeat_infringer_incidents|copyright_repeat_infringer_incidents_copyright_notice_id_fkey|{copyright_notice_id}|public.copyright_notices|{id}|c|true',
      'public.copyright_restriction_administrator_lifts|fk_copyright_restriction_administrator_lifts__restriction|{copyright_restriction_id}|public.copyright_restrictions|{id}|c|true',
      'public.copyright_restrictions|fk_copyright_restrictions__authorizing_assessment|{copyright_notice_id,authorizing_assessment_id}|public.copyright_notice_submission_assessments|{copyright_notice_id,id}|c|true',
      'public.copyright_restrictions|fk_copyright_restrictions__parent_notice|{copyright_notice_id,copyright_notice_target_id}|public.copyright_notice_targets|{copyright_notice_id,id}|c|true',
      'public.copyright_staydown_entries|copyright_staydown_entries_copyright_restriction_id_fkey|{copyright_restriction_id}|public.copyright_restrictions|{id}|c|true',
      'public.copyright_staydown_matches|copyright_staydown_matches_copyright_staydown_entry_id_fkey|{copyright_staydown_entry_id}|public.copyright_staydown_entries|{id}|c|true',
      'public.copyright_territorial_decisions|fk_copyright_territorial_decisions__assessment|{copyright_notice_submission_assessment_id}|public.copyright_notice_submission_assessments|{id}|c|true',
      'public.copyright_territorial_decisions|fk_copyright_territorial_decisions__notice|{copyright_notice_id,jurisdiction}|public.copyright_notices|{id,jurisdiction}|c|true',
      'public.copyright_territorial_decisions|fk_copyright_territorial_decisions__predecessor|{copyright_notice_id,supersedes_decision_id}|public.copyright_territorial_decisions|{copyright_notice_id,id}|c|true',
      'public.copyright_territorial_escalations|fk_copyright_territorial_escalations__eu_supervised_complaint|{copyright_eu_supervised_complaint_id}|public.copyright_eu_supervised_complaints|{id}|c|true',
      'public.copyright_territorial_escalations|fk_copyright_territorial_escalations__notice_acknowledgment|{copyright_territorial_notice_acknowledgment_id}|public.copyright_territorial_notice_acknowledgments|{id}|c|true',
      'public.copyright_territorial_escalations|fk_copyright_territorial_escalations__notice|{copyright_notice_id,jurisdiction}|public.copyright_notices|{id,jurisdiction}|c|true',
      'public.copyright_territorial_notice_acknowledgments|fk_copyright_territorial_notice_acknowledgments__receipt|{copyright_territorial_notice_receipt_id}|public.copyright_territorial_notice_receipts|{id}|c|true',
      'public.copyright_territorial_notice_receipts|fk_copyright_territorial_notice_receipts__notice|{copyright_notice_id,jurisdiction}|public.copyright_notices|{id,jurisdiction}|c|true',
      'public.copyright_territorial_notice_routings|fk_copyright_territorial_notice_routings__receipt|{copyright_territorial_notice_receipt_id}|public.copyright_territorial_notice_receipts|{id}|c|true',
      'public.copyright_territorial_redress_decisions|fk_copyright_territorial_redress_decisions__revoked_assessment|{revoked_assessment_id}|public.copyright_notice_submission_assessments|{id}|c|true',
      'public.copyright_territorial_redress_decisions|fk_copyright_territorial_redress_decisions__request|{copyright_territorial_redress_request_id}|public.copyright_territorial_redress_requests|{id}|c|true',
      'public.copyright_territorial_redress_requests|fk_copyright_territorial_redress_requests__decision|{copyright_notice_id,copyright_territorial_decision_id}|public.copyright_territorial_decisions|{copyright_notice_id,id}|c|true',
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
      -- This is the one fixed-cardinality companion owned by its lifecycle row.
      AND fk.conrelid <> 'copyright_notice_lifecycle_change_rationales'::regclass
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
  END LOOP;
END;
$$;
