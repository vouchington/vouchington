-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)

CREATE OR REPLACE TRIGGER trigger_membership_automatic_refund_receipts_immutable
BEFORE UPDATE OR DELETE ON membership_automatic_refund_receipts
FOR EACH ROW
EXECUTE FUNCTION fn_reject_mutation();
