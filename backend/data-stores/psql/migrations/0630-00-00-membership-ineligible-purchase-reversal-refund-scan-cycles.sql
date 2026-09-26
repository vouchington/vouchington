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
