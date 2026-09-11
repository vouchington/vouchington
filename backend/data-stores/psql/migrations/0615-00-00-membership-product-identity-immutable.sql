CREATE OR REPLACE FUNCTION fn_reject_membership_product_identity_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.plan IS DISTINCT FROM OLD.plan OR NEW.billing_interval IS DISTINCT FROM OLD.billing_interval THEN
    RAISE EXCEPTION 'membership product identity is immutable';
  END IF;

  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER trigger_membership_products_identity_immutable
BEFORE UPDATE ON membership_products
FOR EACH ROW
EXECUTE FUNCTION fn_reject_membership_product_identity_mutation();
