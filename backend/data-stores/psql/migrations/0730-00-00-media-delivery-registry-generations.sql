-- An edge generation can be observed before its surrounding legal transaction commits. Allocate it
-- outside transaction rollback, above every generation an old integer writer could have emitted.
-- This conversion rewrites the table under ACCESS EXCLUSIVE until the fixed migration commits.
-- It follows the planned offline migration policy in .squawk.toml; configured migration timeouts
-- bound failure, not acceptable downtime or live table size.
ALTER TABLE media_delivery_registry_records
  -- squawk-ignore changing-column-type -- Bigint reserves generations above every old signed-int writer under the planned offline migration policy.
  ALTER COLUMN generation TYPE bigint;

CREATE SEQUENCE media_delivery_registry_generation_sequence AS bigint
  MINVALUE 2147483648 START WITH 2147483648;

CREATE OR REPLACE FUNCTION fn_assign_media_delivery_registry_generation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT'
    OR NEW.desired_state IS DISTINCT FROM OLD.desired_state
    OR NEW.generation IS DISTINCT FROM OLD.generation THEN
    NEW.generation := nextval('media_delivery_registry_generation_sequence');
  ELSE
    NEW.generation := OLD.generation;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_media_delivery_registry_records_generation
BEFORE INSERT OR UPDATE ON media_delivery_registry_records
FOR EACH ROW EXECUTE FUNCTION fn_assign_media_delivery_registry_generation();

COMMENT ON COLUMN media_delivery_registry_records.generation IS
  'Database-assigned, nontransactional monotonic edge authority generation. It advances for a new record, effective desired-state change, or explicit republish, so a rolled-back prepublication cannot be reused.';
