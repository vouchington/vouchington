-- Collision facts would disappear when the losing membership projection retires. Keep the
-- financial work in the same transaction; GlideMQ owns execution locks and crash recovery.
CREATE TABLE IF NOT EXISTS membership_stripe_purchase_collision_work_items (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  membership_source_id UUID NOT NULL,
  membership_provider_lineage_id UUID NOT NULL,
  membership_lineage_binding_id UUID NOT NULL,
  winning_source_kind membership_source_kinds NOT NULL
    CHECK (winning_source_kind IN ('direct', 'family')),
  winning_plan membership_plan_slugs NOT NULL CHECK (winning_plan IN ('plus', 'pro')),
  collision_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_stripe_purchase_collision_work_items__collision
  ON membership_stripe_purchase_collision_work_items (
    membership_source_id, membership_provider_lineage_id, membership_lineage_binding_id,
    winning_source_kind, winning_plan, collision_at
  );
CREATE INDEX IF NOT EXISTS idx_membership_stripe_purchase_collision_work_items__binding
  ON membership_stripe_purchase_collision_work_items (
    membership_lineage_binding_id, membership_provider_lineage_id
  );
ALTER TABLE membership_stripe_purchase_collision_work_items
  ADD CONSTRAINT fk_membership_stripe_purchase_collision_work_items__source
  FOREIGN KEY (membership_source_id, membership_provider_lineage_id)
  REFERENCES membership_sources (id, membership_provider_lineage_id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE membership_stripe_purchase_collision_work_items
  VALIDATE CONSTRAINT fk_membership_stripe_purchase_collision_work_items__source;
ALTER TABLE membership_stripe_purchase_collision_work_items
  ADD CONSTRAINT fk_membership_stripe_purchase_collision_work_items__binding
  FOREIGN KEY (membership_lineage_binding_id, membership_provider_lineage_id)
  REFERENCES membership_lineage_bindings (id, membership_provider_lineage_id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE membership_stripe_purchase_collision_work_items
  VALIDATE CONSTRAINT fk_membership_stripe_purchase_collision_work_items__binding;
CREATE TRIGGER trigger_membership_stripe_purchase_collision_work_items_guard
  BEFORE UPDATE ON membership_stripe_purchase_collision_work_items
  FOR EACH ROW EXECUTE FUNCTION fn_reject_mutation();
COMMENT ON TABLE membership_stripe_purchase_collision_work_items IS 'Immutable financial collision facts captured with membership projection. Pending rows recover lost queue admissions and terminal failures; completion deletes them after cases and reconciliation succeed.';
COMMENT ON COLUMN membership_stripe_purchase_collision_work_items.id IS 'UUIDv7 work identity used by bounded recovery and stable GlideMQ admission.';
COMMENT ON COLUMN membership_stripe_purchase_collision_work_items.membership_source_id IS 'Retained losing Stripe source whose invoices must be inspected outside membership transactions.';
COMMENT ON COLUMN membership_stripe_purchase_collision_work_items.membership_provider_lineage_id IS 'Canonical provider lineage shared by the retained source and binding.';
COMMENT ON COLUMN membership_stripe_purchase_collision_work_items.membership_lineage_binding_id IS 'Retained binding authorized at collision capture; it does not authorize access by a deleted user.';
COMMENT ON COLUMN membership_stripe_purchase_collision_work_items.winning_source_kind IS 'Winning direct native or family source at the captured collision.';
COMMENT ON COLUMN membership_stripe_purchase_collision_work_items.winning_plan IS 'Winning plan snapshot used to preserve family tier precedence during deferred discovery.';
COMMENT ON COLUMN membership_stripe_purchase_collision_work_items.collision_at IS 'Winning membership effective time used for immutable overlap refund caps.';
COMMENT ON COLUMN membership_stripe_purchase_collision_work_items.created_at IS 'Work insertion time derived from its UUIDv7 identity; recovery orders by id.';

-- Unresolved staff decisions are separate from retryable discovery work. Never guess a
-- multi-line invoice's refundable amount or keep polling Stripe for deterministic ambiguity.
CREATE TABLE IF NOT EXISTS membership_stripe_purchase_collision_reviews (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  membership_source_id UUID NOT NULL,
  membership_provider_lineage_id UUID NOT NULL,
  membership_lineage_binding_id UUID NOT NULL,
  originating_invoice_id TEXT NOT NULL CHECK (
    char_length(originating_invoice_id) BETWEEN 1 AND 255
    AND originating_invoice_id = TRIM(originating_invoice_id)
  ),
  winning_source_kind membership_source_kinds NOT NULL
    CHECK (winning_source_kind IN ('direct', 'family')),
  winning_plan membership_plan_slugs NOT NULL CHECK (winning_plan IN ('plus', 'pro')),
  collision_at TIMESTAMPTZ NOT NULL,
  invoice_line_count INTEGER NOT NULL CHECK (invoice_line_count > 1),
  mapped_membership_line_count INTEGER NOT NULL CHECK (
    mapped_membership_line_count > 0 AND mapped_membership_line_count <= invoice_line_count
  ),
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_stripe_purchase_collision_reviews__invoice
  ON membership_stripe_purchase_collision_reviews (membership_provider_lineage_id, originating_invoice_id);
CREATE INDEX IF NOT EXISTS idx_membership_stripe_purchase_collision_reviews__source
  ON membership_stripe_purchase_collision_reviews (membership_source_id, membership_provider_lineage_id);
CREATE INDEX IF NOT EXISTS idx_membership_stripe_purchase_collision_reviews__binding
  ON membership_stripe_purchase_collision_reviews (membership_lineage_binding_id, membership_provider_lineage_id);
ALTER TABLE membership_stripe_purchase_collision_reviews
  ADD CONSTRAINT fk_membership_stripe_purchase_collision_reviews__source
  FOREIGN KEY (membership_source_id, membership_provider_lineage_id)
  REFERENCES membership_sources (id, membership_provider_lineage_id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE membership_stripe_purchase_collision_reviews
  VALIDATE CONSTRAINT fk_membership_stripe_purchase_collision_reviews__source;
ALTER TABLE membership_stripe_purchase_collision_reviews
  ADD CONSTRAINT fk_membership_stripe_purchase_collision_reviews__binding
  FOREIGN KEY (membership_lineage_binding_id, membership_provider_lineage_id)
  REFERENCES membership_lineage_bindings (id, membership_provider_lineage_id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE membership_stripe_purchase_collision_reviews
  VALIDATE CONSTRAINT fk_membership_stripe_purchase_collision_reviews__binding;
CREATE TRIGGER trigger_membership_stripe_purchase_collision_reviews_guard
  BEFORE UPDATE ON membership_stripe_purchase_collision_reviews
  FOR EACH ROW EXECUTE FUNCTION fn_reject_mutation();
COMMENT ON TABLE membership_stripe_purchase_collision_reviews IS 'Current unresolved staff reviews for ambiguous Stripe invoices. Unique lineage/invoice identity preserves evidence without retrying discovery; explicit staff disposition removes the review. This is not financial allocation or audit history.';
COMMENT ON COLUMN membership_stripe_purchase_collision_reviews.id IS 'UUIDv7 staff-review identity; bounded staff inspection orders by this key.';
COMMENT ON COLUMN membership_stripe_purchase_collision_reviews.membership_source_id IS 'Retained losing Stripe source; this evidence does not authorize a deleted owner.';
COMMENT ON COLUMN membership_stripe_purchase_collision_reviews.membership_provider_lineage_id IS 'Canonical Stripe lineage identifying the subscription and provider context for staff investigation.';
COMMENT ON COLUMN membership_stripe_purchase_collision_reviews.membership_lineage_binding_id IS 'Retained binding authorized when the collision was captured.';
COMMENT ON COLUMN membership_stripe_purchase_collision_reviews.originating_invoice_id IS 'Exact external Stripe invoice identity requiring staff allocation review.';
COMMENT ON COLUMN membership_stripe_purchase_collision_reviews.winning_source_kind IS 'Immutable winning source kind captured with the deferred collision.';
COMMENT ON COLUMN membership_stripe_purchase_collision_reviews.winning_plan IS 'Immutable supported winning plan captured with the deferred collision.';
COMMENT ON COLUMN membership_stripe_purchase_collision_reviews.collision_at IS 'Captured collision time retained for staff after discovery work completes.';
COMMENT ON COLUMN membership_stripe_purchase_collision_reviews.invoice_line_count IS 'Observed total invoice line count that made automatic allocation ambiguous.';
COMMENT ON COLUMN membership_stripe_purchase_collision_reviews.mapped_membership_line_count IS 'Observed number of invoice lines mapped to membership plans.';
COMMENT ON COLUMN membership_stripe_purchase_collision_reviews.created_at IS 'Review insertion timestamp derived from its UUIDv7 identity.';

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS membership_ineligible_purchase_reversal_cases (
  id UUID CONSTRAINT pk_mipr_cases PRIMARY KEY DEFAULT uuidv7(),
  membership_source_id UUID NOT NULL,
  membership_provider_lineage_id UUID NOT NULL,
  membership_lineage_binding_id UUID NOT NULL,
  originating_invoice_id TEXT NOT NULL CONSTRAINT chk_mipr_cases__originating_invoice_id CHECK (char_length(originating_invoice_id) BETWEEN 1 AND 255 AND originating_invoice_id = TRIM(originating_invoice_id)),
  stripe_price_id TEXT NOT NULL,
  winning_source_kind membership_source_kinds NOT NULL,
  qualifying_amount_minor_units BIGINT NOT NULL CONSTRAINT chk_memb_ineli_purch_rever_cases__qualifying_amount_minor_units CHECK (qualifying_amount_minor_units BETWEEN 0 AND 9007199254740991),
  refund_cap_minor_units BIGINT NOT NULL CONSTRAINT chk_member_inelig_purchas_reversa_cases__refund_cap_minor_units CHECK (refund_cap_minor_units BETWEEN 0 AND 9007199254740991),
  currency_code currency_codes NOT NULL,
  period_started_at TIMESTAMPTZ NOT NULL,
  period_ends_at TIMESTAMPTZ NOT NULL,
  collision_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  CONSTRAINT chk_membersh_ineligibl_purchase_reversal_cases__stripe_price_id CHECK (char_length(stripe_price_id) BETWEEN 1 AND 255 AND stripe_price_id = TRIM(stripe_price_id)),
  CHECK (refund_cap_minor_units <= qualifying_amount_minor_units),
  CHECK (period_ends_at >= period_started_at)
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_ineligible_purchase_reversal_cases__invoice
  ON membership_ineligible_purchase_reversal_cases (membership_provider_lineage_id, originating_invoice_id);
CREATE INDEX IF NOT EXISTS idx_membership_ineligible_purchase_reversal_cases__binding
  ON membership_ineligible_purchase_reversal_cases (membership_lineage_binding_id, membership_provider_lineage_id);
CREATE INDEX IF NOT EXISTS idx_membership_ineligible_purchase_reversal_cases__invoice_id
  ON membership_ineligible_purchase_reversal_cases (originating_invoice_id);
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_membershi_ineligibl_purchase_reversal_cases__source_lineage
  ON membership_ineligible_purchase_reversal_cases (membership_source_id, membership_provider_lineage_id);
-- Fiscal retention scan: every case by collision time. Whether a case may go depends on other
-- tables, so a persisted cursor steps past blocked rows and a run reads at most one page.
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_member_inelig_purchase_reversal_cases__collision_at_id
  ON membership_ineligible_purchase_reversal_cases (collision_at, id);
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_membership_ineligible_purchase_reversal_cases__currency
  ON membership_ineligible_purchase_reversal_cases (currency_code);
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS membership_ineligible_purchase_reversal_case_operations (
  membership_ineligible_purchase_reversal_case_id UUID NOT NULL
    CONSTRAINT fk_mipr_case_ops__case REFERENCES membership_ineligible_purchase_reversal_cases(id) ON DELETE RESTRICT,
  membership_operation_id UUID NOT NULL,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(membership_operation_id)) VIRTUAL,
  CONSTRAINT pk_mipr_case_ops PRIMARY KEY (
    membership_ineligible_purchase_reversal_case_id, membership_operation_id
  )
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE UNIQUE INDEX IF NOT EXISTS idx_members_ineligib_purchase_reversal_case_operatio__operation
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

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE FUNCTION fn_reject_purchase_reversal_case_operation_context()
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

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE TRIGGER trigger_purchase_reversal_case_operation_context
BEFORE INSERT ON membership_ineligible_purchase_reversal_case_operations
FOR EACH ROW
EXECUTE FUNCTION fn_reject_purchase_reversal_case_operation_context();

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE TRIGGER trigger_membership_ineligible_purchase_reversal_cases_immutable
BEFORE UPDATE OR DELETE ON membership_ineligible_purchase_reversal_cases
FOR EACH ROW
EXECUTE FUNCTION fn_reject_membership_reversal_case_mutation();

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE TRIGGER trigger_purchase_reversal_case_operations_immutable
BEFORE UPDATE OR DELETE ON membership_ineligible_purchase_reversal_case_operations
FOR EACH ROW
EXECUTE FUNCTION fn_reject_membership_operation_child_mutation();

COMMENT ON TABLE membership_ineligible_purchase_reversal_cases IS
  'Collision snapshot that bounds Stripe refund allocation as invoice payments arrive; immutable until bounded retention deletes it after its fiscal window.';
COMMENT ON COLUMN membership_ineligible_purchase_reversal_cases.membership_source_id IS
  'Membership source whose collision created this immutable reversal case.';
COMMENT ON COLUMN membership_ineligible_purchase_reversal_cases.membership_provider_lineage_id IS
  'Provider lineage shared by the case source, binding, and reversal operations.';
COMMENT ON COLUMN membership_ineligible_purchase_reversal_cases.membership_lineage_binding_id IS
  'Immutable lineage binding whose collision this case records.';
COMMENT ON COLUMN membership_ineligible_purchase_reversal_cases.originating_invoice_id IS
  'Stripe invoice identifying the qualifying purchase within its provider lineage.';
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
