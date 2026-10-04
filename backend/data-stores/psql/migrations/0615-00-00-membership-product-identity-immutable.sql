-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)

CREATE OR REPLACE TRIGGER trigger_membership_products_identity_immutable
BEFORE UPDATE OF plan, billing_interval ON membership_products
FOR EACH ROW
  WHEN (ROW(OLD.plan, OLD.billing_interval) IS DISTINCT FROM ROW(NEW.plan, NEW.billing_interval))
EXECUTE FUNCTION fn_reject_mutation();
