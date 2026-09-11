CREATE TABLE IF NOT EXISTS membership_ineligible_purchase_reversal_refund_scan_cycles (
  membership_ineligible_purchase_reversal_case_id UUID CONSTRAINT pk_mipr_refund_scan_cycles PRIMARY KEY,
  generation BIGINT NOT NULL DEFAULT 1 CHECK (generation BETWEEN 1 AND 9007199254740991),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE membership_ineligible_purchase_reversal_refund_scan_cycles
  ADD CONSTRAINT fk_mipr_refund_scan_cycles__case FOREIGN KEY (membership_ineligible_purchase_reversal_case_id)
  REFERENCES membership_ineligible_purchase_reversal_cases(id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE membership_ineligible_purchase_reversal_refund_scan_cycles
  VALIDATE CONSTRAINT fk_mipr_refund_scan_cycles__case;

CREATE TRIGGER trigger_mipr_refund_scan_cycles_updated_at
BEFORE UPDATE ON membership_ineligible_purchase_reversal_refund_scan_cycles
FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

ALTER TABLE membership_ineligible_purchase_reversal_refund_scans
  ADD COLUMN registered_cycle_generation BIGINT NOT NULL DEFAULT 1,
  ADD COLUMN verified_cycle_generation BIGINT;

ALTER TABLE membership_ineligible_purchase_reversal_refund_scans
  ADD CONSTRAINT ck_mipr_refund_scans__generation_safe
    CHECK (generation BETWEEN 1 AND 9007199254740991) NOT VALID,
  ADD CONSTRAINT ck_mipr_refund_scans__registered_cycle_generation_safe
    CHECK (registered_cycle_generation BETWEEN 1 AND 9007199254740991) NOT VALID,
  ADD CONSTRAINT ck_mipr_refund_scans__verified_cycle_generation_safe
    CHECK (verified_cycle_generation BETWEEN 1 AND 9007199254740991) NOT VALID,
  ADD CONSTRAINT ck_mipr_refund_scans__verified_cycle_registered
    CHECK (verified_cycle_generation IS NULL OR verified_cycle_generation <= registered_cycle_generation) NOT VALID;

ALTER TABLE membership_ineligible_purchase_reversal_refund_scans
  VALIDATE CONSTRAINT ck_mipr_refund_scans__generation_safe,
  VALIDATE CONSTRAINT ck_mipr_refund_scans__registered_cycle_generation_safe,
  VALIDATE CONSTRAINT ck_mipr_refund_scans__verified_cycle_generation_safe,
  VALIDATE CONSTRAINT ck_mipr_refund_scans__verified_cycle_registered;

COMMENT ON TABLE membership_ineligible_purchase_reversal_refund_scan_cycles IS
  'Bounded mutable verification-cycle state for one reversal case; generation rotates after a completed pass.';
COMMENT ON COLUMN membership_ineligible_purchase_reversal_refund_scan_cycles.membership_ineligible_purchase_reversal_case_id IS
  'Immutable reversal case whose targets are verified in this cycle.';
COMMENT ON COLUMN membership_ineligible_purchase_reversal_refund_scan_cycles.generation IS
  'Current bounded verification-pass generation for this reversal case.';
COMMENT ON COLUMN membership_ineligible_purchase_reversal_refund_scan_cycles.completed_at IS
  'Time every lazily registered target completed its provider-history verification for this pass.';
COMMENT ON COLUMN membership_ineligible_purchase_reversal_refund_scan_cycles.updated_at IS
  'Last mutation of the reusable case-level verification-cycle state.';
COMMENT ON COLUMN membership_ineligible_purchase_reversal_refund_scans.registered_cycle_generation IS
  'Latest case-level verification pass that lazily registered this stable payment-target scan.';
COMMENT ON COLUMN membership_ineligible_purchase_reversal_refund_scans.verified_cycle_generation IS
  'Latest registered verification pass whose current Stripe head was observed for this target.';
