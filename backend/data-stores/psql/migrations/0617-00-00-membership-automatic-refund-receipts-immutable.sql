-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
-- Settled operation children stay append-only until their operation is due for fiscal deletion.
CREATE OR REPLACE FUNCTION fn_reject_membership_operation_child_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND fn_membership_operation_fiscal_retention_due(OLD.membership_operation_id) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME USING ERRCODE = 'check_violation';
END;
$$;
COMMENT ON FUNCTION fn_reject_membership_operation_child_mutation() IS
  'Rejects every update and every delete except the bounded fiscal-retention delete of a due operation child.';

CREATE OR REPLACE TRIGGER trigger_membership_automatic_refund_receipts_immutable
BEFORE UPDATE OR DELETE ON membership_automatic_refund_receipts
FOR EACH ROW
EXECUTE FUNCTION fn_reject_membership_operation_child_mutation();
