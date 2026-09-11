CREATE OR REPLACE FUNCTION fn_guard_membership_grant_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'membership grants cannot be deleted';
  END IF;

  IF OLD.revoked_at IS NULL
    AND OLD.revoked_by_id IS NULL
    AND OLD.revocation_reason IS NULL
    AND NEW.revoked_at IS NOT NULL
    AND NEW.revoked_by_id IS NOT NULL
    AND NEW.revocation_reason IS NOT NULL
    AND ROW(
      NEW.id, NEW.membership_source_id, NEW.source_kind, NEW.user_id,
      NEW.membership_product_id, NEW.calendar_days, NEW.granted_by_id,
      NEW.issuer_snapshot, NEW.note
    ) IS NOT DISTINCT FROM ROW(
      OLD.id, OLD.membership_source_id, OLD.source_kind, OLD.user_id,
      OLD.membership_product_id, OLD.calendar_days, OLD.granted_by_id,
      OLD.issuer_snapshot, OLD.note
    )
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'membership grants only allow a pending-to-revoked lifecycle transition';
END $$;

CREATE OR REPLACE TRIGGER trigger_membership_grants_guard
BEFORE UPDATE OR DELETE ON membership_grants
FOR EACH ROW
EXECUTE FUNCTION fn_guard_membership_grant_mutation();

CREATE OR REPLACE FUNCTION fn_guard_membership_operation_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'membership operations cannot be deleted';
  END IF;

  IF OLD.completed_at IS NULL
    AND OLD.failed_at IS NULL
    AND num_nonnulls(NEW.completed_at, NEW.failed_at) = 1
    AND ROW(
      NEW.id, NEW.membership_source_id, NEW.membership_provider_lineage_id,
      NEW.provider, NEW.environment, NEW.application_id, NEW.operation_kind,
      NEW.idempotency_key, NEW.qualifying_allocation_minor_units,
      NEW.remaining_refundable_minor_units, NEW.currency_code,
      NEW.period_started_at, NEW.period_ends_at, NEW.collision_at,
      NEW.requested_at
    ) IS NOT DISTINCT FROM ROW(
      OLD.id, OLD.membership_source_id, OLD.membership_provider_lineage_id,
      OLD.provider, OLD.environment, OLD.application_id, OLD.operation_kind,
      OLD.idempotency_key, OLD.qualifying_allocation_minor_units,
      OLD.remaining_refundable_minor_units, OLD.currency_code,
      OLD.period_started_at, OLD.period_ends_at, OLD.collision_at,
      OLD.requested_at
    )
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'membership operations only allow one terminal lifecycle transition';
END $$;

CREATE OR REPLACE TRIGGER trigger_membership_operations_guard
BEFORE UPDATE OR DELETE ON membership_operations
FOR EACH ROW
EXECUTE FUNCTION fn_guard_membership_operation_mutation();

CREATE OR REPLACE FUNCTION fn_reject_membership_change_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'membership changes are append-only';
END $$;

CREATE OR REPLACE TRIGGER trigger_membership_changes_append_only
BEFORE UPDATE OR DELETE ON membership_changes
FOR EACH ROW
EXECUTE FUNCTION fn_reject_membership_change_mutation();

CREATE OR REPLACE FUNCTION fn_guard_membership_lineage_binding_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'membership lineage bindings cannot be deleted';
  END IF;

  IF OLD.released_at IS NULL
    AND OLD.release_reason IS NULL
    AND NEW.released_at IS NOT NULL
    AND NEW.release_reason IS NOT NULL
    AND ROW(
      NEW.id, NEW.membership_provider_lineage_id, NEW.user_id, NEW.source_kind, NEW.bound_at
    ) IS NOT DISTINCT FROM ROW(
      OLD.id, OLD.membership_provider_lineage_id, OLD.user_id, OLD.source_kind, OLD.bound_at
    )
  THEN
    RETURN NEW;
  END IF;

  IF OLD.released_at IS NOT NULL
    AND OLD.user_id IS NOT NULL
    AND NEW.user_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id)
    AND ROW(
      NEW.id, NEW.membership_provider_lineage_id, NEW.source_kind, NEW.bound_at,
      NEW.released_at, NEW.release_reason
    ) IS NOT DISTINCT FROM ROW(
      OLD.id, OLD.membership_provider_lineage_id, OLD.source_kind, OLD.bound_at,
      OLD.released_at, OLD.release_reason
    )
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'membership lineage bindings only allow release and final-purge transitions';
END $$;

CREATE OR REPLACE TRIGGER trigger_membership_lineage_bindings_guard
BEFORE UPDATE OR DELETE ON membership_lineage_bindings
FOR EACH ROW
EXECUTE FUNCTION fn_guard_membership_lineage_binding_mutation();

CREATE OR REPLACE FUNCTION fn_guard_membership_grant_activation_period_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'membership grant activation periods cannot be deleted';
  END IF;

  IF OLD.ended_at IS NULL
    AND NEW.ended_at IS NOT NULL
    AND ROW(
      NEW.id, NEW.membership_grant_id, NEW.user_id, NEW.started_at
    ) IS NOT DISTINCT FROM ROW(
      OLD.id, OLD.membership_grant_id, OLD.user_id, OLD.started_at
    )
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'membership grant activation periods only allow an open-to-ended lifecycle transition';
END $$;

CREATE OR REPLACE TRIGGER trigger_membership_grant_activation_periods_guard
BEFORE UPDATE OR DELETE ON membership_grant_activation_periods
FOR EACH ROW
EXECUTE FUNCTION fn_guard_membership_grant_activation_period_mutation();
