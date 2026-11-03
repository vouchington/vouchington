import { randomUUID } from 'node:crypto'
import { beginTransaction, read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createLocalTestUser } from './data-stores/psql/users.mts'
import { createTestPersistedReversalCaseFixture } from './data-stores/psql/membership-reversal-cases.mts'

/** closed: verified history; open_cycle: verification running; linked_operation: an operation still links. */
export type ReversalCaseRetentionState = 'closed' | 'open_cycle' | 'linked_operation'
export type ReversalCaseRetentionFixture = {
  caseId: string
  originatingInvoiceId: string
  providerApplicationId: string
}

/** A reversal case collided at a chosen time with one cycle, one provider-history scan and one observation. */
export async function createReversalCaseForRetention(
  collisionAt: Date,
  state: ReversalCaseRetentionState = 'closed',
): Promise<ReversalCaseRetentionFixture> {
  const user = await createLocalTestUser()
  const suffix = randomUUID()
  const originatingInvoiceId = `in_retention_${suffix}`
  const providerApplicationId = `reversal-retention-${suffix}`
  const { caseId } = await createTestPersistedReversalCaseFixture({
    userId: user.id,
    originatingInvoiceId,
    providerApplicationId,
    providerEnvironment: 'test',
    subscriptionId: `lineage-${suffix}`,
    stripePriceId: `price-${suffix}`,
    currency: 'usd',
    winningSourceKind: 'direct',
    qualifyingAmountMinorUnits: 100,
    refundCapMinorUnits: 75,
    periodStartedAt: collisionAt,
    periodEndsAt: collisionAt,
    collisionAt,
  })
  await write(sql`/* createReversalCaseRetentionHistory */
    WITH cycle AS (
      INSERT INTO membership_ineligible_purchase_reversal_refund_scan_cycles
        (membership_ineligible_purchase_reversal_case_id, completed_at)
      VALUES (${caseId}, ${state === 'open_cycle' ? null : collisionAt}::timestamptz)
    ), scan AS (
      INSERT INTO membership_ineligible_purchase_reversal_refund_scans
        (membership_ineligible_purchase_reversal_case_id, invoice_id, currency_code, charge_id)
      VALUES (${caseId}, ${originatingInvoiceId}, 'usd', ${`ch_${suffix}`}) RETURNING id
    ) INSERT INTO membership_ineligible_purchase_reversal_refund_observations
        (membership_ineligible_purchase_reversal_refund_scan_id, stripe_refund_id, amount_minor_units, currency_code)
      SELECT id, ${`re_${suffix}`}, 50, 'usd' FROM scan`)
  if (state === 'linked_operation')
    await write(sql`/* linkReversalCaseRetentionOperation */
      WITH operation AS (
        INSERT INTO membership_operations (membership_source_id, membership_provider_lineage_id,
          membership_lineage_binding_id, membership_provider_context_id, operation_kind, idempotency_key,
          qualifying_allocation_minor_units, remaining_refundable_minor_units, currency_code,
          period_started_at, period_ends_at, collision_at)
        SELECT membership_source_id, membership_provider_lineage_id, membership_lineage_binding_id,
          fn_upsert_membership_provider_context_id('stripe', 'test', ${providerApplicationId}),
          'ineligible_purchase_reversal', ${randomUUID()}, 100, 100, 'usd', ${collisionAt}, ${collisionAt}, ${collisionAt}
        FROM membership_ineligible_purchase_reversal_cases WHERE id = ${caseId} RETURNING id
      ) INSERT INTO membership_ineligible_purchase_reversal_case_operations
          (membership_ineligible_purchase_reversal_case_id, membership_operation_id)
        SELECT ${caseId}, id FROM operation`)
  return { caseId, originatingInvoiceId, providerApplicationId }
}

/** Case rows and their history still present. */
export async function countReversalCaseRetentionRows(
  caseId: string,
): Promise<{ cases: number; cycles: number; scans: number; observations: number }> {
  const { rows } = await read<{
    cases: string
    cycles: string
    scans: string
    observations: string
  }>(
    sql`/* countReversalCaseRetentionRows */ SELECT
      (SELECT count(*) FROM membership_ineligible_purchase_reversal_cases WHERE id = ${caseId})::TEXT AS cases,
      (SELECT count(*) FROM membership_ineligible_purchase_reversal_refund_scan_cycles
        WHERE membership_ineligible_purchase_reversal_case_id = ${caseId})::TEXT AS cycles,
      (SELECT count(*) FROM membership_ineligible_purchase_reversal_refund_scans
        WHERE membership_ineligible_purchase_reversal_case_id = ${caseId})::TEXT AS scans,
      (SELECT count(*) FROM membership_ineligible_purchase_reversal_refund_observations observation
        JOIN membership_ineligible_purchase_reversal_refund_scans scan
          ON scan.id = observation.membership_ineligible_purchase_reversal_refund_scan_id
        WHERE scan.membership_ineligible_purchase_reversal_case_id = ${caseId})::TEXT AS observations`,
  )
  const row = rows[0]!
  return {
    cases: Number(row.cases),
    cycles: Number(row.cycles),
    scans: Number(row.scans),
    observations: Number(row.observations),
  }
}

/** Starts the next unscoped pass right after a known case. */
export async function positionReversalCaseLedgerCursor(caseId: string | null): Promise<void> {
  await write(sql`/* positionReversalCaseLedgerCursor */
    UPDATE payment_operational_cleanup_cursors SET cursor_id = ${caseId}
    WHERE kind = 'membership_reversal_case_ledger'`)
}

/** Attempts a direct delete with retention delete mode on; the transaction is never committed. */
export async function attemptRetentionModeReversalCaseDelete(
  caseId: string,
  target: 'case' | 'observation',
): Promise<void> {
  await using query = await beginTransaction()
  await query(sql`/* permitReversalCaseDelete */ SET LOCAL app.billing_retention_delete = 'on'`)
  await query(
    target === 'case'
      ? sql`/* deleteReversalCase */
          DELETE FROM membership_ineligible_purchase_reversal_cases WHERE id = ${caseId}`
      : sql`/* deleteReversalObservation */
          DELETE FROM membership_ineligible_purchase_reversal_refund_observations observation
          USING membership_ineligible_purchase_reversal_refund_scans scan
          WHERE scan.id = observation.membership_ineligible_purchase_reversal_refund_scan_id
            AND scan.membership_ineligible_purchase_reversal_case_id = ${caseId}`,
  )
}
