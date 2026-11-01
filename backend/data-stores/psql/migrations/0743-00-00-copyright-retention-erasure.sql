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
