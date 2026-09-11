CREATE TABLE IF NOT EXISTS membership_ineligible_purchase_reversal_cases (
  id UUID CONSTRAINT pk_mipr_cases PRIMARY KEY DEFAULT uuidv7(),
  membership_source_id UUID NOT NULL,
  membership_provider_lineage_id UUID NOT NULL,
  membership_lineage_binding_id UUID NOT NULL,
  stripe_price_id TEXT NOT NULL,
  winning_source_kind membership_source_kinds NOT NULL,
  qualifying_amount_minor_units BIGINT NOT NULL CHECK (qualifying_amount_minor_units BETWEEN 0 AND 9007199254740991),
  refund_cap_minor_units BIGINT NOT NULL CHECK (refund_cap_minor_units BETWEEN 0 AND 9007199254740991),
  currency_code TEXT NOT NULL,
  period_started_at TIMESTAMPTZ NOT NULL,
  period_ends_at TIMESTAMPTZ NOT NULL,
  collision_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  CHECK (char_length(stripe_price_id) BETWEEN 1 AND 255 AND stripe_price_id = TRIM(stripe_price_id)),
  CHECK (refund_cap_minor_units <= qualifying_amount_minor_units),
  CHECK (period_ends_at >= period_started_at),
  CHECK (winning_source_kind <> 'family' OR period_ends_at > period_started_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mipr_cases__binding
  ON membership_ineligible_purchase_reversal_cases (membership_lineage_binding_id);
CREATE INDEX IF NOT EXISTS idx_mipr_cases__source_lineage
  ON membership_ineligible_purchase_reversal_cases (membership_source_id, membership_provider_lineage_id);
CREATE INDEX IF NOT EXISTS idx_mipr_cases__currency
  ON membership_ineligible_purchase_reversal_cases (currency_code);
CREATE INDEX IF NOT EXISTS idx_membership_bindings__lineage_origin
  ON membership_lineage_bindings (membership_provider_lineage_id, originating_invoice_id, id)
  WHERE originating_invoice_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS membership_ineligible_purchase_reversal_case_operations (
  membership_ineligible_purchase_reversal_case_id UUID NOT NULL
    CONSTRAINT fk_mipr_case_ops__case REFERENCES membership_ineligible_purchase_reversal_cases(id) ON DELETE RESTRICT,
  membership_operation_id UUID NOT NULL,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(membership_operation_id)) VIRTUAL,
  CONSTRAINT pk_mipr_case_ops PRIMARY KEY (
    membership_ineligible_purchase_reversal_case_id, membership_operation_id
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mipr_case_ops__operation
  ON membership_ineligible_purchase_reversal_case_operations (membership_operation_id);

ALTER TABLE membership_ineligible_purchase_reversal_cases
  ADD CONSTRAINT fk_mipr_cases__source_lineage FOREIGN KEY (
    membership_source_id, membership_provider_lineage_id
  ) REFERENCES membership_sources (id, membership_provider_lineage_id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE membership_ineligible_purchase_reversal_cases
  VALIDATE CONSTRAINT fk_mipr_cases__source_lineage;
ALTER TABLE membership_ineligible_purchase_reversal_cases
  ADD CONSTRAINT fk_mipr_cases__binding_lineage FOREIGN KEY (
    membership_lineage_binding_id, membership_provider_lineage_id
  ) REFERENCES membership_lineage_bindings (id, membership_provider_lineage_id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE membership_ineligible_purchase_reversal_cases
  VALIDATE CONSTRAINT fk_mipr_cases__binding_lineage;
ALTER TABLE membership_ineligible_purchase_reversal_cases
  ADD CONSTRAINT fk_mipr_cases__currency FOREIGN KEY (currency_code)
  REFERENCES currencies (code) ON DELETE RESTRICT NOT VALID;
ALTER TABLE membership_ineligible_purchase_reversal_cases
  VALIDATE CONSTRAINT fk_mipr_cases__currency;
ALTER TABLE membership_ineligible_purchase_reversal_case_operations
  ADD CONSTRAINT fk_mipr_case_ops__operation FOREIGN KEY (membership_operation_id)
  REFERENCES membership_operations (id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE membership_ineligible_purchase_reversal_case_operations
  VALIDATE CONSTRAINT fk_mipr_case_ops__operation;

CREATE OR REPLACE FUNCTION fn_require_mipr_case_op_context()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  valid_context BOOLEAN;
BEGIN
  SELECT operation.operation_kind = 'ineligible_purchase_reversal'
    AND operation.membership_source_id = reversal_case.membership_source_id
    AND operation.membership_provider_lineage_id = reversal_case.membership_provider_lineage_id
    AND operation.membership_lineage_binding_id = reversal_case.membership_lineage_binding_id
  INTO valid_context
  FROM membership_operations operation
  CROSS JOIN membership_ineligible_purchase_reversal_cases reversal_case
  WHERE operation.id = NEW.membership_operation_id
    AND reversal_case.id = NEW.membership_ineligible_purchase_reversal_case_id;

  IF valid_context = FALSE THEN
    RAISE EXCEPTION 'reversal case operation context does not match its immutable case'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER trigger_mipr_case_ops_context
BEFORE INSERT ON membership_ineligible_purchase_reversal_case_operations
FOR EACH ROW
EXECUTE FUNCTION fn_require_mipr_case_op_context();

CREATE OR REPLACE FUNCTION fn_reject_mipr_case_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'membership ineligible purchase reversal cases are immutable';
END $$;

CREATE OR REPLACE TRIGGER trigger_mipr_cases_immutable
BEFORE UPDATE OR DELETE ON membership_ineligible_purchase_reversal_cases
FOR EACH ROW
EXECUTE FUNCTION fn_reject_mipr_case_mutation();

CREATE OR REPLACE FUNCTION fn_reject_mipr_case_op_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'membership ineligible purchase reversal case operations are immutable';
END $$;

CREATE OR REPLACE TRIGGER trigger_mipr_case_ops_immutable
BEFORE UPDATE OR DELETE ON membership_ineligible_purchase_reversal_case_operations
FOR EACH ROW
EXECUTE FUNCTION fn_reject_mipr_case_op_mutation();

COMMENT ON TABLE membership_ineligible_purchase_reversal_cases IS
  'Immutable collision snapshot that bounds Stripe refund allocation as invoice payments arrive.';
COMMENT ON COLUMN membership_ineligible_purchase_reversal_cases.membership_source_id IS
  'Membership source whose collision created this immutable reversal case.';
COMMENT ON COLUMN membership_ineligible_purchase_reversal_cases.membership_provider_lineage_id IS
  'Provider lineage shared by the case source, binding, and reversal operations.';
COMMENT ON COLUMN membership_ineligible_purchase_reversal_cases.membership_lineage_binding_id IS
  'Immutable lineage binding whose collision this case records.';
COMMENT ON COLUMN membership_ineligible_purchase_reversal_cases.stripe_price_id IS
  'Stripe Price identifier for the ineligible qualifying purchase.';
COMMENT ON COLUMN membership_ineligible_purchase_reversal_cases.winning_source_kind IS
  'Source kind that won the collision and made the qualifying purchase ineligible.';
COMMENT ON COLUMN membership_ineligible_purchase_reversal_cases.qualifying_amount_minor_units IS
  'Original qualifying purchase amount in currency minor units.';
COMMENT ON COLUMN membership_ineligible_purchase_reversal_cases.refund_cap_minor_units IS
  'Immutable maximum total refundable amount in currency minor units for this case.';
COMMENT ON COLUMN membership_ineligible_purchase_reversal_cases.currency_code IS
  'ISO 4217 currency code for all amounts in this immutable case.';
COMMENT ON COLUMN membership_ineligible_purchase_reversal_cases.period_started_at IS
  'Start of the original qualifying purchase period.';
COMMENT ON COLUMN membership_ineligible_purchase_reversal_cases.period_ends_at IS
  'End of the original qualifying purchase period.';
COMMENT ON COLUMN membership_ineligible_purchase_reversal_cases.collision_at IS
  'When the competing membership source collision was recorded.';
COMMENT ON TABLE membership_ineligible_purchase_reversal_case_operations IS
  'Immutable association between one collision case and its payment-target reversal operations.';
COMMENT ON COLUMN membership_ineligible_purchase_reversal_case_operations.membership_ineligible_purchase_reversal_case_id IS
  'Immutable reversal case that owns the associated payment-target operation.';
COMMENT ON COLUMN membership_ineligible_purchase_reversal_case_operations.membership_operation_id IS
  'Ineligible-purchase reversal operation associated with this immutable case.';
