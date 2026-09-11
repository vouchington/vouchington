ALTER TABLE membership_operations
  ADD COLUMN IF NOT EXISTS provider_refund_id TEXT;

ALTER TABLE membership_operations
  ADD CONSTRAINT membership_operations__provider_refund_id_valid
  CHECK (
    provider_refund_id IS NULL
    OR (
      char_length(provider_refund_id) BETWEEN 1 AND 255
      AND provider_refund_id = TRIM(provider_refund_id)
    )
  ) NOT VALID;

ALTER TABLE membership_operations
  VALIDATE CONSTRAINT membership_operations__provider_refund_id_valid;

CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_operations__provider_refund
  ON membership_operations (provider, environment, application_id, provider_refund_id)
  WHERE provider_refund_id IS NOT NULL;

COMMENT ON COLUMN membership_operations.provider_refund_id IS
  'Latest Stripe refund identity, retained to reconcile non-terminal refund outcomes before retrying.';

ALTER TABLE membership_lineage_bindings
  ADD COLUMN IF NOT EXISTS originating_invoice_id TEXT;

ALTER TABLE membership_lineage_bindings
  ADD CONSTRAINT membership_lineage_bindings_originating_invoice_id_valid
  CHECK (
    originating_invoice_id IS NULL
    OR (
      char_length(originating_invoice_id) BETWEEN 1 AND 255
      AND originating_invoice_id = TRIM(originating_invoice_id)
    )
  ) NOT VALID;

ALTER TABLE membership_lineage_bindings
  VALIDATE CONSTRAINT membership_lineage_bindings_originating_invoice_id_valid;

COMMENT ON COLUMN membership_lineage_bindings.originating_invoice_id IS
  'Stripe invoice that established the bound provider lineage for deterministic reversal targeting.';

ALTER TABLE membership_operations
  ADD COLUMN IF NOT EXISTS execution_claim_token TEXT,
  ADD COLUMN IF NOT EXISTS execution_claimed_at TIMESTAMPTZ;

ALTER TABLE membership_operations
  ADD CONSTRAINT membership_operations_execution_claim_pair_valid
  CHECK ((execution_claim_token IS NULL) = (execution_claimed_at IS NULL)) NOT VALID;

ALTER TABLE membership_operations
  ADD CONSTRAINT membership_operations_execution_claim_token_valid
  CHECK (execution_claim_token IS NULL OR char_length(execution_claim_token) = 36) NOT VALID;

ALTER TABLE membership_operations
  VALIDATE CONSTRAINT membership_operations_execution_claim_pair_valid,
  VALIDATE CONSTRAINT membership_operations_execution_claim_token_valid;

COMMENT ON COLUMN membership_operations.execution_claim_token IS
  'Opaque lease token held by the current provider-operation attempt.';

COMMENT ON COLUMN membership_operations.execution_claimed_at IS
  'When the current provider-operation execution lease was acquired.';

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
    NEW.provider, NEW.environment, NEW.application_id, NEW.operation_kind,
    NEW.idempotency_key, NEW.qualifying_allocation_minor_units, NEW.currency_code,
    NEW.period_started_at, NEW.period_ends_at, NEW.collision_at, NEW.requested_at
  ) IS DISTINCT FROM ROW(
    OLD.id, OLD.membership_source_id, OLD.membership_provider_lineage_id,
    OLD.provider, OLD.environment, OLD.application_id, OLD.operation_kind,
    OLD.idempotency_key, OLD.qualifying_allocation_minor_units, OLD.currency_code,
    OLD.period_started_at, OLD.period_ends_at, OLD.collision_at, OLD.requested_at
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

CREATE OR REPLACE FUNCTION fn_guard_membership_lineage_binding_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'membership lineage bindings cannot be deleted';
  END IF;

  IF OLD.released_at IS NULL
    AND OLD.originating_invoice_id IS NULL
    AND NEW.released_at IS NULL
    AND NEW.release_reason IS NULL
    AND NEW.originating_invoice_id IS NOT NULL
    AND ROW(
      NEW.id, NEW.membership_provider_lineage_id, NEW.user_id, NEW.source_kind, NEW.bound_at
    ) IS NOT DISTINCT FROM ROW(
      OLD.id, OLD.membership_provider_lineage_id, OLD.user_id, OLD.source_kind, OLD.bound_at
    )
  THEN
    RETURN NEW;
  END IF;

  IF OLD.released_at IS NULL
    AND OLD.release_reason IS NULL
    AND NEW.released_at IS NOT NULL
    AND NEW.release_reason IS NOT NULL
    AND ROW(
      NEW.id, NEW.membership_provider_lineage_id, NEW.user_id, NEW.source_kind, NEW.bound_at,
      NEW.originating_invoice_id
    ) IS NOT DISTINCT FROM ROW(
      OLD.id, OLD.membership_provider_lineage_id, OLD.user_id, OLD.source_kind, OLD.bound_at,
      OLD.originating_invoice_id
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
      NEW.released_at, NEW.release_reason, NEW.originating_invoice_id
    ) IS NOT DISTINCT FROM ROW(
      OLD.id, OLD.membership_provider_lineage_id, OLD.source_kind, OLD.bound_at,
      OLD.released_at, OLD.release_reason, OLD.originating_invoice_id
    )
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'membership lineage bindings only allow release and final-purge transitions';
END $$;
