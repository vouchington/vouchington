CREATE OR REPLACE FUNCTION fn_reject_membership_automatic_refund_receipt_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'membership automatic refund receipts are immutable';
END $$;

CREATE OR REPLACE TRIGGER trigger_membership_automatic_refund_receipts_immutable
BEFORE UPDATE OR DELETE ON membership_automatic_refund_receipts
FOR EACH ROW
EXECUTE FUNCTION fn_reject_membership_automatic_refund_receipt_mutation();
