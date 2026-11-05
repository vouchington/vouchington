import { write } from '@data-stores/psql'
import { seedUser } from '../run-support.mts'

export type LedgerSeedKind =
  | 'automatic_refund'
  | 'collision_resolution'
  | 'ineligible_purchase_reversal'

export type LedgerSeed = {
  kind: LedgerSeedKind
  count: number
  /** Postgres interval text, such as '9 years', counted back from now. */
  completedAgo: string
  /** Idempotency key prefix and provider application, unique per seeded group. */
  prefix: string
  /** Reversal kinds belong to a case whose verification cycle is open or completed. */
  caseCycle?: 'open' | 'completed'
  /** Adds the automatic refund receipt (and for a reversal its case link) to every operation. */
  withChildren?: boolean
}

/** Completed operations, one lineage each, ordered by completion one second apart. */
export async function seedLedgerOperations(seed: LedgerSeed): Promise<void> {
  await write(
    `/* seedExplainLedgerOperations */
     WITH series AS (SELECT n FROM generate_series(0, $1::int - 1) AS n),
     context AS (SELECT fn_upsert_membership_provider_context_id('stripe', 'test', $2) AS id),
     lineage AS (
       INSERT INTO membership_provider_lineages (membership_provider_context_id, provider_lineage_id)
       SELECT context.id, $2 || '-' || series.n FROM series CROSS JOIN context
       RETURNING id, membership_provider_context_id, provider_lineage_id
     ), binding AS (
       INSERT INTO membership_lineage_bindings (membership_provider_lineage_id, user_id, source_kind)
       SELECT id, $3::uuid, 'direct' FROM lineage
       RETURNING id, membership_provider_lineage_id
     ), source AS (
       INSERT INTO membership_sources (source_kind, membership_provider_lineage_id)
       SELECT 'direct', id FROM lineage RETURNING id, membership_provider_lineage_id
     ), reversal_case AS (
       INSERT INTO membership_ineligible_purchase_reversal_cases (membership_source_id,
         membership_provider_lineage_id, membership_lineage_binding_id, originating_invoice_id, stripe_price_id,
         winning_source_kind, qualifying_amount_minor_units, refund_cap_minor_units, currency_code,
         period_started_at, period_ends_at, collision_at)
       SELECT source.id, lineage.id, binding.id, 'in_' || lineage.provider_lineage_id, 'price_explain', 'direct', 100, 100, 'usd', NOW(), NOW(), NOW() - $7::interval
       FROM lineage JOIN source ON source.membership_provider_lineage_id = lineage.id
         JOIN binding ON binding.membership_provider_lineage_id = lineage.id
       WHERE $6::text IS NOT NULL RETURNING id
     ), cycle AS (
       INSERT INTO membership_ineligible_purchase_reversal_refund_scan_cycles
         (membership_ineligible_purchase_reversal_case_id, completed_at)
       SELECT id, CASE WHEN $6 = 'completed' THEN NOW() END FROM reversal_case
     ) INSERT INTO membership_operations (membership_source_id, membership_provider_lineage_id,
         membership_lineage_binding_id, membership_provider_context_id, operation_kind,
         idempotency_key, qualifying_allocation_minor_units, remaining_refundable_minor_units,
         currency_code, period_started_at, period_ends_at, collision_at, requested_at, completed_at)
       SELECT source.id, lineage.id, binding.id, lineage.membership_provider_context_id,
         $4::membership_operation_kinds, $5 || lineage.provider_lineage_id, 100, 100, 'usd',
         NOW() - $7::interval, NOW() - $7::interval,
         CASE WHEN $4::membership_operation_kinds <> 'automatic_refund' THEN NOW() - $7::interval END,
         NOW() - $7::interval - INTERVAL '1 hour' + series.n * INTERVAL '1 second',
         NOW() - $7::interval + series.n * INTERVAL '1 second'
       FROM lineage JOIN source ON source.membership_provider_lineage_id = lineage.id
         JOIN binding ON binding.membership_provider_lineage_id = lineage.id
         JOIN series ON lineage.provider_lineage_id = $2 || '-' || series.n`,
    [
      seed.count,
      seed.prefix,
      seedUser.id,
      seed.kind,
      `${seed.prefix}-op-`,
      seed.caseCycle ?? null,
      seed.completedAgo,
    ],
  )
  if (seed.withChildren) {
    await write(
      `/* seedExplainLedgerReceipts */
       INSERT INTO membership_automatic_refund_receipts (membership_operation_id,
         membership_provider_context_id, provider_refund_id, amount_minor_units, currency_code)
       SELECT id, membership_provider_context_id, 're_' || idempotency_key, 100, 'usd'
       FROM membership_operations WHERE idempotency_key LIKE $1 || '%'`,
      [`${seed.prefix}-op-`],
    )
    if (seed.kind === 'ineligible_purchase_reversal')
      await write(
        `/* seedExplainLedgerCaseLinks */
         INSERT INTO membership_ineligible_purchase_reversal_case_operations
           (membership_ineligible_purchase_reversal_case_id, membership_operation_id)
         SELECT reversal_case.id, operation.id FROM membership_operations operation
           JOIN membership_ineligible_purchase_reversal_cases reversal_case
             ON reversal_case.membership_lineage_binding_id = operation.membership_lineage_binding_id
         WHERE operation.idempotency_key LIKE $1 || '%'`,
        [`${seed.prefix}-op-`],
      )
  }
  await write(`/* seedExplainLedgerOperations:analyze */ ANALYZE membership_operations`)
}

/** Points the persisted pass at the last operation of a seeded group. */
export async function positionLedgerCursor(prefix: string): Promise<void> {
  await write(
    `/* positionExplainLedgerCursor */
     UPDATE payment_operational_cleanup_cursors SET cursor_id = (
       SELECT id FROM membership_operations WHERE idempotency_key LIKE $1 || '%'
       ORDER BY completed_at DESC, id DESC LIMIT 1)
     WHERE kind = 'membership_operation_ledger'`,
    [`${prefix}-op-`],
  )
}

/** Points the persisted reversal case pass at the last case of a seeded operation group. */
export async function positionReversalCaseCursor(prefix: string): Promise<void> {
  await write(
    `/* positionExplainReversalCaseCursor */
     UPDATE payment_operational_cleanup_cursors SET cursor_id = (
       SELECT reversal_case.id FROM membership_ineligible_purchase_reversal_cases reversal_case
         JOIN membership_operations operation
           ON operation.membership_lineage_binding_id = reversal_case.membership_lineage_binding_id
       WHERE operation.idempotency_key LIKE $1 || '%'
       ORDER BY reversal_case.collision_at DESC, reversal_case.id DESC LIMIT 1)
     WHERE kind = 'membership_reversal_case_ledger'`,
    [`${prefix}-op-`],
  )
}

export async function resetReversalCaseCursor(): Promise<void> {
  await write(
    `/* resetExplainReversalCaseCursor */
     UPDATE payment_operational_cleanup_cursors SET cursor_id = NULL
     WHERE kind = 'membership_reversal_case_ledger'`,
  )
}

export async function resetLedgerCursor(): Promise<void> {
  await write(
    `/* resetExplainLedgerCursor */
     UPDATE payment_operational_cleanup_cursors SET cursor_id = NULL
     WHERE kind = 'membership_operation_ledger'`,
  )
}
