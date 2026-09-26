CREATE TABLE IF NOT EXISTS membership_ineligible_purchase_reversal_refund_scans (
  id UUID CONSTRAINT pk_mipr_refund_scans PRIMARY KEY DEFAULT uuidv7(),
  membership_ineligible_purchase_reversal_case_id UUID NOT NULL,
  invoice_id TEXT NOT NULL,
  currency_code TEXT NOT NULL,
  charge_id TEXT,
  payment_intent_id TEXT,
  generation BIGINT NOT NULL DEFAULT 1 CONSTRAINT ck_mipr_refund_scans__generation_safe CHECK (generation BETWEEN 1 AND 9007199254740991),
  registered_cycle_generation BIGINT NOT NULL DEFAULT 1 CONSTRAINT ck_mipr_refund_scans__registered_cycle_generation_safe CHECK (registered_cycle_generation BETWEEN 1 AND 9007199254740991),
  verified_cycle_generation BIGINT CONSTRAINT ck_mipr_refund_scans__verified_cycle_generation_safe CHECK (verified_cycle_generation BETWEEN 1 AND 9007199254740991),
  CONSTRAINT ck_mipr_refund_scans__verified_cycle_registered CHECK (verified_cycle_generation IS NULL OR verified_cycle_generation <= registered_cycle_generation),
  head_stripe_refund_id TEXT,
  cursor_stripe_refund_id TEXT,
  first_page_seen_at TIMESTAMPTZ,
  reached_end_at TIMESTAMPTZ,
  nonterminal_refund_seen_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (char_length(invoice_id) BETWEEN 1 AND 255 AND invoice_id = TRIM(invoice_id)),
  CHECK (char_length(currency_code) BETWEEN 1 AND 16 AND currency_code = TRIM(currency_code)),
  CHECK (charge_id IS NULL OR (char_length(charge_id) BETWEEN 1 AND 255 AND charge_id = TRIM(charge_id))),
  CHECK (payment_intent_id IS NULL OR (char_length(payment_intent_id) BETWEEN 1 AND 255 AND payment_intent_id = TRIM(payment_intent_id))),
  CHECK (head_stripe_refund_id IS NULL OR (char_length(head_stripe_refund_id) BETWEEN 1 AND 255 AND head_stripe_refund_id = TRIM(head_stripe_refund_id))),
  CHECK (cursor_stripe_refund_id IS NULL OR (char_length(cursor_stripe_refund_id) BETWEEN 1 AND 255 AND cursor_stripe_refund_id = TRIM(cursor_stripe_refund_id))),
  CHECK (num_nonnulls(charge_id, payment_intent_id) = 1),
  CHECK (first_page_seen_at IS NOT NULL OR num_nonnulls(head_stripe_refund_id, cursor_stripe_refund_id, reached_end_at, nonterminal_refund_seen_at, completed_at) = 0),
  CHECK (cursor_stripe_refund_id IS NULL OR first_page_seen_at IS NOT NULL),
  CHECK (reached_end_at IS NULL OR (first_page_seen_at IS NOT NULL AND cursor_stripe_refund_id IS NULL)),
  CHECK (completed_at IS NULL OR (reached_end_at IS NOT NULL AND nonterminal_refund_seen_at IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mipr_refund_scans__target
  ON membership_ineligible_purchase_reversal_refund_scans (
    membership_ineligible_purchase_reversal_case_id, invoice_id, currency_code,
    charge_id, payment_intent_id
  ) NULLS NOT DISTINCT;
CREATE INDEX IF NOT EXISTS idx_mipr_refund_scans__currency
  ON membership_ineligible_purchase_reversal_refund_scans (currency_code);
ALTER TABLE membership_ineligible_purchase_reversal_refund_scans
  ADD CONSTRAINT fk_mipr_refund_scans__case FOREIGN KEY (membership_ineligible_purchase_reversal_case_id)
  REFERENCES membership_ineligible_purchase_reversal_cases(id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE membership_ineligible_purchase_reversal_refund_scans
  VALIDATE CONSTRAINT fk_mipr_refund_scans__case;
ALTER TABLE membership_ineligible_purchase_reversal_refund_scans
  ADD CONSTRAINT fk_mipr_refund_scans__currency FOREIGN KEY (currency_code)
  REFERENCES currencies (code) ON DELETE RESTRICT NOT VALID;
ALTER TABLE membership_ineligible_purchase_reversal_refund_scans
  VALIDATE CONSTRAINT fk_mipr_refund_scans__currency;

CREATE TRIGGER trigger_mipr_refund_scans_updated_at
BEFORE UPDATE ON membership_ineligible_purchase_reversal_refund_scans
FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE TABLE IF NOT EXISTS membership_ineligible_purchase_reversal_refund_observations (
  membership_ineligible_purchase_reversal_refund_scan_id UUID NOT NULL
    CONSTRAINT fk_mipr_succeeded_refund_observations__scan REFERENCES membership_ineligible_purchase_reversal_refund_scans(id) ON DELETE RESTRICT,
  stripe_refund_id TEXT NOT NULL,
  amount_minor_units BIGINT NOT NULL CHECK (amount_minor_units BETWEEN 0 AND 9007199254740991),
  currency_code TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_mipr_succeeded_refund_observations PRIMARY KEY (
    membership_ineligible_purchase_reversal_refund_scan_id, stripe_refund_id
  ),
  CHECK (char_length(stripe_refund_id) BETWEEN 1 AND 255 AND stripe_refund_id = TRIM(stripe_refund_id)),
  CHECK (char_length(currency_code) BETWEEN 1 AND 16 AND currency_code = TRIM(currency_code))
);

CREATE INDEX IF NOT EXISTS idx_mipr_refund_observations__currency
  ON membership_ineligible_purchase_reversal_refund_observations (currency_code);

ALTER TABLE membership_ineligible_purchase_reversal_refund_observations
  ADD CONSTRAINT fk_mipr_succeeded_refund_observations__currency FOREIGN KEY (currency_code)
  REFERENCES currencies (code) ON DELETE RESTRICT NOT VALID;
ALTER TABLE membership_ineligible_purchase_reversal_refund_observations
  VALIDATE CONSTRAINT fk_mipr_succeeded_refund_observations__currency;

CREATE OR REPLACE FUNCTION fn_reject_mipr_succeeded_refund_observation_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'membership ineligible purchase reversal succeeded refund observations are immutable';
END $$;

CREATE OR REPLACE TRIGGER trigger_mipr_succeeded_refund_observations_immutable
BEFORE UPDATE OR DELETE ON membership_ineligible_purchase_reversal_refund_observations
FOR EACH ROW
EXECUTE FUNCTION fn_reject_mipr_succeeded_refund_observation_mutation();

CREATE OR REPLACE FUNCTION fn_require_mipr_succeeded_refund_observation_context()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  scan_currency TEXT;
BEGIN
  SELECT currency_code INTO scan_currency
  FROM membership_ineligible_purchase_reversal_refund_scans
  WHERE id = NEW.membership_ineligible_purchase_reversal_refund_scan_id;
  IF scan_currency IS DISTINCT FROM NEW.currency_code THEN
    RAISE EXCEPTION 'succeeded refund observation currency does not match its scan'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER trigger_mipr_succeeded_refund_observations_context
BEFORE INSERT ON membership_ineligible_purchase_reversal_refund_observations
FOR EACH ROW
EXECUTE FUNCTION fn_require_mipr_succeeded_refund_observation_context();

COMMENT ON TABLE membership_ineligible_purchase_reversal_refund_scans IS
  'Mutable fenced Stripe refund-pagination cursor for one immutable reversal case payment target.';
COMMENT ON TABLE membership_ineligible_purchase_reversal_refund_observations IS
  'Immutable succeeded Stripe refunds observed while reconciling one reversal case payment target.';
COMMENT ON COLUMN membership_ineligible_purchase_reversal_refund_scans.membership_ineligible_purchase_reversal_case_id IS
  'Immutable reversal case that owns this resumable provider-history scan.';
COMMENT ON COLUMN membership_ineligible_purchase_reversal_refund_scans.invoice_id IS
  'Stripe invoice containing the canonical payment target.';
COMMENT ON COLUMN membership_ineligible_purchase_reversal_refund_scans.currency_code IS
  'Currency required for every accepted succeeded-refund observation.';
COMMENT ON COLUMN membership_ineligible_purchase_reversal_refund_scans.charge_id IS
  'Stripe charge selector when the payment target is charge-backed.';
COMMENT ON COLUMN membership_ineligible_purchase_reversal_refund_scans.payment_intent_id IS
  'Stripe payment-intent selector when the target has no charge selector.';
COMMENT ON COLUMN membership_ineligible_purchase_reversal_refund_scans.generation IS
  'Compare-and-set fence incremented whenever a scan restarts from its first page.';
COMMENT ON COLUMN membership_ineligible_purchase_reversal_refund_scans.registered_cycle_generation IS
  'Latest case-level verification pass that lazily registered this stable payment-target scan.';
COMMENT ON COLUMN membership_ineligible_purchase_reversal_refund_scans.verified_cycle_generation IS
  'Latest registered verification pass whose current Stripe head was observed for this target.';
COMMENT ON COLUMN membership_ineligible_purchase_reversal_refund_scans.head_stripe_refund_id IS
  'First refund ID seen in the current generation, or null for an empty first page.';
COMMENT ON COLUMN membership_ineligible_purchase_reversal_refund_scans.cursor_stripe_refund_id IS
  'Last committed Stripe refund ID from which the next page resumes.';
COMMENT ON COLUMN membership_ineligible_purchase_reversal_refund_scans.first_page_seen_at IS
  'Time the current generation committed its first page.';
COMMENT ON COLUMN membership_ineligible_purchase_reversal_refund_scans.reached_end_at IS
  'Time the current generation committed a page with no continuation.';
COMMENT ON COLUMN membership_ineligible_purchase_reversal_refund_scans.nonterminal_refund_seen_at IS
  'First time the current generation observed a pending or unknown refund status.';
COMMENT ON COLUMN membership_ineligible_purchase_reversal_refund_scans.completed_at IS
  'Time an unchanged first-page head verified the exhaustive terminal scan.';
COMMENT ON COLUMN membership_ineligible_purchase_reversal_refund_observations.membership_ineligible_purchase_reversal_refund_scan_id IS
  'Case-target scan that observed this succeeded Stripe refund.';
COMMENT ON COLUMN membership_ineligible_purchase_reversal_refund_observations.stripe_refund_id IS
  'Immutable Stripe refund identifier.';
COMMENT ON COLUMN membership_ineligible_purchase_reversal_refund_observations.amount_minor_units IS
  'Succeeded Stripe refund amount in the smallest currency unit.';
COMMENT ON COLUMN membership_ineligible_purchase_reversal_refund_observations.currency_code IS
  'Stripe refund currency, required by trigger to match the owning scan.';
COMMENT ON COLUMN membership_ineligible_purchase_reversal_refund_observations.observed_at IS
  'Time this succeeded refund was first committed locally.';
COMMENT ON COLUMN membership_ineligible_purchase_reversal_refund_observations.updated_at IS
  'Immutable insertion timestamp retained for the repository timestamp convention.';
