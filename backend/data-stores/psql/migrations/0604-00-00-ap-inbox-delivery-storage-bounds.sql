-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE FUNCTION fn_project_activitypub_inbox_delivery_retention()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  unverified_deadline TIMESTAMPTZ := NEW.received_at + INTERVAL '1 hour';
  failure_deadline TIMESTAMPTZ;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.failed_at IS NOT NULL THEN
      NEW.first_failed_at := NEW.failed_at;
    ELSE
      NEW.first_failed_at := NULL;
    END IF;
  ELSIF OLD.first_failed_at IS NOT NULL THEN
    NEW.first_failed_at := OLD.first_failed_at;
  ELSIF NEW.failed_at IS NOT NULL THEN
    NEW.first_failed_at := NEW.failed_at;
  ELSE
    NEW.first_failed_at := NULL;
  END IF;

  IF NEW.first_failed_at IS NOT NULL THEN
    failure_deadline := NEW.first_failed_at + INTERVAL '7 days';
  END IF;

  IF NEW.verified_at IS NULL THEN
    NEW.retention_expires_at := LEAST(
      COALESCE(NEW.retention_expires_at, unverified_deadline),
      unverified_deadline,
      COALESCE(failure_deadline, unverified_deadline)
    );
  ELSIF NEW.first_failed_at IS NULL THEN
    NEW.retention_expires_at := NULL;
  ELSE
    NEW.retention_expires_at := LEAST(
      COALESCE(OLD.retention_expires_at, NEW.retention_expires_at, failure_deadline),
      COALESCE(NEW.retention_expires_at, failure_deadline),
      failure_deadline
    );
  END IF;

  RETURN NEW;
END;
$$;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE TRIGGER trigger_activitypub_inbox_work_items_retention
BEFORE INSERT OR UPDATE ON activitypub_inbox_delivery_work_items
FOR EACH ROW
EXECUTE FUNCTION fn_project_activitypub_inbox_delivery_retention();
