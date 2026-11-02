-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
-- Pointer clearing for the bounded case purge and operational retention. Legal-record guards stay
-- in force; they allow a transaction that sets app.copyright_retention_erasure to null only the
-- storage and token pointers listed in fn_copyright_retention_erasable_columns, right before the
-- purge or retention job deletes the object or token the pointer named.

CREATE OR REPLACE FUNCTION fn_copyright_retention_erasable_columns(table_name text)
RETURNS text[] LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE table_name
    WHEN 'copyright_notice_evidence_artifacts' THEN ARRAY['storage_object_id']
    WHEN 'copyright_notice_email_intakes' THEN ARRAY['raw_storage_object_id']
    WHEN 'copyright_notice_email_intake_notice_links' THEN ARRAY['matched_token_id']
  END
$$;

CREATE OR REPLACE FUNCTION fn_copyright_retention_erasure_permitted(table_name text, old_row jsonb, new_row jsonb)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('app.copyright_retention_erasure', true) = 'on', false)
    AND fn_copyright_retention_erasable_columns(table_name) IS NOT NULL
    AND (old_row - fn_copyright_retention_erasable_columns(table_name))
      = (new_row - fn_copyright_retention_erasable_columns(table_name))
$$;

COMMENT ON FUNCTION fn_copyright_retention_erasable_columns(text) IS 'Pointer columns, per table, that a purge or operational-retention transaction may null in place; NULL for every other table.';
COMMENT ON FUNCTION fn_copyright_retention_erasure_permitted(text, jsonb, jsonb) IS 'True only inside a transaction that set app.copyright_retention_erasure to on and only when the update changes nothing outside the table''s pointer columns; legal-record guards call it before rejecting an update.';

CREATE OR REPLACE FUNCTION fn_reject_copyright_decision_rationale_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE retention_cutoff TIMESTAMPTZ;
BEGIN
  IF TG_OP = 'DELETE' AND fn_copyright_case_purge_permitted(TG_TABLE_NAME) THEN RETURN OLD; END IF;
  IF TG_OP = 'DELETE' THEN
    retention_cutoff := NULLIF(current_setting('app.copyright_rationale_retention_cutoff', TRUE), '')::timestamptz;
    IF retention_cutoff IS NOT NULL
      AND fn_copyright_decision_rationale_retention_eligible(OLD, retention_cutoff) THEN
      RETURN OLD;
    END IF;
  END IF;
  RAISE EXCEPTION 'copyright decision rationale is retained legal evidence'
    USING ERRCODE = 'check_violation';
END;
$$;

CREATE OR REPLACE TRIGGER trigger_copyright_decision_rationales_immutable
BEFORE UPDATE OR DELETE ON copyright_decision_rationales
FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_decision_rationale_mutation();

COMMENT ON FUNCTION fn_reject_copyright_decision_rationale_mutation() IS 'Permits only case-purge deletion or bounded retention deletion of eligible legal rationale.';

-- A decision attempt can be admitted just as the case erasure worker commits. Hold the same
-- notice row lock that its FOR UPDATE conflicts with, then read the erasure fact in a fresh
-- statement. Return NULL for an erased case so its security audit still commits without new
-- legal ciphertext.
CREATE OR REPLACE FUNCTION fn_reject_erased_copyright_decision_rationale()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE case_id UUID;
BEGIN
  FOR case_id IN
    SELECT notice.id FROM copyright_notices notice
    WHERE notice.id = NEW.copyright_notice_id
      OR notice.id IN (
        SELECT link.copyright_notice_id FROM copyright_notice_email_intake_notice_links link
        WHERE link.copyright_notice_email_intake_id = NEW.copyright_notice_email_intake_receipt_id)
    ORDER BY notice.id
  LOOP
    PERFORM 1 FROM copyright_notices WHERE id = case_id FOR KEY SHARE;
  END LOOP;
  IF EXISTS (SELECT 1 FROM copyright_notices erased
    WHERE erased.evidence_erased_at IS NOT NULL
      AND (erased.id = NEW.copyright_notice_id
        OR erased.id IN (
          SELECT link.copyright_notice_id FROM copyright_notice_email_intake_notice_links link
          WHERE link.copyright_notice_email_intake_id = NEW.copyright_notice_email_intake_receipt_id))) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_copyright_decision_rationales_skip_erased
BEFORE INSERT ON copyright_decision_rationales
FOR EACH ROW EXECUTE FUNCTION fn_reject_erased_copyright_decision_rationale();
COMMENT ON FUNCTION fn_reject_erased_copyright_decision_rationale() IS 'Serializes with case erasure and suppresses fresh legal rationale ciphertext once the case records evidence_erased_at, without suppressing the security attempt.';
