ALTER TABLE membership_operations
  -- squawk-ignore adding-required-field
  ADD COLUMN membership_lineage_binding_id UUID NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_lineage_bindings__id_lineage_id
  ON membership_lineage_bindings (id, membership_provider_lineage_id);

CREATE INDEX IF NOT EXISTS idx_membership_operations__binding_id
  ON membership_operations (membership_lineage_binding_id, id DESC);

ALTER TABLE membership_operations
  ADD CONSTRAINT fk_membership_operations__binding_lineage
  FOREIGN KEY (membership_lineage_binding_id, membership_provider_lineage_id)
  REFERENCES membership_lineage_bindings (id, membership_provider_lineage_id)
  ON DELETE RESTRICT NOT VALID;

ALTER TABLE membership_operations
  VALIDATE CONSTRAINT fk_membership_operations__binding_lineage;

COMMENT ON COLUMN membership_operations.membership_lineage_binding_id IS
  'Binding and owner captured when the provider operation was requested.';

CREATE OR REPLACE FUNCTION fn_guard_membership_operation_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'membership operations cannot be deleted';
  END IF;

  IF OLD.completed_at IS NOT NULL THEN
    RAISE EXCEPTION 'membership operations only allow one terminal lifecycle transition';
  END IF;

  IF ROW(
    NEW.id, NEW.membership_source_id, NEW.membership_provider_lineage_id,
    NEW.membership_lineage_binding_id, NEW.provider, NEW.environment,
    NEW.application_id, NEW.operation_kind, NEW.idempotency_key,
    NEW.qualifying_allocation_minor_units, NEW.currency_code, NEW.period_started_at,
    NEW.period_ends_at, NEW.collision_at, NEW.requested_at
  ) IS DISTINCT FROM ROW(
    OLD.id, OLD.membership_source_id, OLD.membership_provider_lineage_id,
    OLD.membership_lineage_binding_id, OLD.provider, OLD.environment,
    OLD.application_id, OLD.operation_kind, OLD.idempotency_key,
    OLD.qualifying_allocation_minor_units, OLD.currency_code, OLD.period_started_at,
    OLD.period_ends_at, OLD.collision_at, OLD.requested_at
  ) THEN
    RAISE EXCEPTION 'membership operations only allow one terminal lifecycle transition';
  END IF;

  IF OLD.failed_at IS NOT NULL
    AND OLD.execution_claim_token IS NULL
    AND NEW.failed_at IS NOT NULL
    AND NEW.execution_claim_token IS NULL
    AND NEW.completed_at IS NULL
    AND NEW.provider_refund_id IS NOT DISTINCT FROM OLD.provider_refund_id
    AND NEW.remaining_refundable_minor_units <= OLD.remaining_refundable_minor_units
  THEN
    RETURN NEW;
  END IF;

  IF OLD.execution_claim_token IS NULL
    AND NEW.execution_claim_token IS NOT NULL
    AND NEW.completed_at IS NULL
    AND NEW.failed_at IS NULL
    AND NEW.provider_refund_id IS NOT DISTINCT FROM OLD.provider_refund_id
    AND NEW.remaining_refundable_minor_units IS NOT DISTINCT FROM OLD.remaining_refundable_minor_units
  THEN
    RETURN NEW;
  END IF;

  IF OLD.execution_claim_token IS NOT NULL
    AND NEW.execution_claim_token IS NOT DISTINCT FROM OLD.execution_claim_token
    AND NEW.completed_at IS NULL
    AND NEW.failed_at IS NULL
    AND NEW.remaining_refundable_minor_units IS NOT DISTINCT FROM OLD.remaining_refundable_minor_units
  THEN
    RETURN NEW;
  END IF;

  IF OLD.execution_claim_token IS NOT NULL
    AND OLD.execution_claimed_at < CURRENT_TIMESTAMP - INTERVAL '5 minutes'
    AND NEW.execution_claim_token IS NOT NULL
    AND NEW.execution_claim_token IS DISTINCT FROM OLD.execution_claim_token
    AND NEW.execution_claimed_at > OLD.execution_claimed_at
    AND NEW.completed_at IS NULL
    AND NEW.failed_at IS NULL
    AND NEW.provider_refund_id IS NOT DISTINCT FROM OLD.provider_refund_id
    AND NEW.remaining_refundable_minor_units IS NOT DISTINCT FROM OLD.remaining_refundable_minor_units
  THEN
    RETURN NEW;
  END IF;

  IF OLD.execution_claim_token IS NOT NULL
    AND NEW.execution_claim_token IS NULL
    AND NEW.completed_at IS NULL
    AND NEW.failed_at IS NOT NULL
    AND NEW.remaining_refundable_minor_units IS NOT DISTINCT FROM OLD.remaining_refundable_minor_units
  THEN
    RETURN NEW;
  END IF;

  IF OLD.execution_claim_token IS NOT NULL
    AND NEW.execution_claim_token IS NULL
    AND NEW.completed_at IS NOT NULL
    AND NEW.failed_at IS NULL
    AND NEW.remaining_refundable_minor_units IS NOT DISTINCT FROM OLD.remaining_refundable_minor_units
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'membership operations only allow claimed provider execution lifecycle transitions';
END $$;
