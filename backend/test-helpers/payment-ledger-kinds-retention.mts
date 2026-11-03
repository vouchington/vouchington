import { randomUUID } from 'node:crypto'
import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createLocalTestUser } from './data-stores/psql/users.mts'
import { claimTestMembershipOperation } from './data-stores/psql/membership-ledger-immutability.mts'
import {
  associateTestReversalCaseWithOperation,
  insertTestReversalCase,
} from './data-stores/psql/membership-reversal-cases.mts'

export type FiscalLedgerKind =
  | 'automatic_refund'
  | 'collision_resolution'
  | 'ineligible_purchase_reversal'
/** How the reversal case of a settled operation looks: closed, mid-verification, or with a failed sibling. */
export type FiscalLedgerCaseState = 'closed' | 'open_cycle' | 'unfinished_sibling'
export type FiscalLedgerOperation = { operationId: string; caseId: string | null }

/**
 * A completed operation of one kind with its automatic refund receipt, and for a reversal the case
 * and its operation link. The request is backdated one minute before completion.
 */
export async function createCompletedFiscalLedgerOperation(
  kind: FiscalLedgerKind,
  completedAt: Date,
  caseState: FiscalLedgerCaseState = 'closed',
): Promise<FiscalLedgerOperation> {
  const user = await createLocalTestUser()
  const applicationId = `fiscal-kind-${randomUUID()}`
  const isCaseKind = kind !== 'automatic_refund'
  const { rows } = await write<{
    id: string
    source_id: string
    lineage_id: string
    binding_id: string
  }>(
    sql`/* createCompletedFiscalLedgerOperation */
    WITH lineage AS (
      INSERT INTO membership_provider_lineages (membership_provider_context_id, provider_lineage_id)
      VALUES (fn_upsert_membership_provider_context_id('stripe', 'test', ${applicationId}), ${`lineage-${randomUUID()}`})
      RETURNING id, membership_provider_context_id
    ), binding AS (
      INSERT INTO membership_lineage_bindings (membership_provider_lineage_id, user_id, source_kind, originating_invoice_id)
      SELECT id, ${user.id}, 'direct', ${`in_${randomUUID()}`} FROM lineage RETURNING id, membership_provider_lineage_id
    ), source AS (
      INSERT INTO membership_sources (user_id, source_kind, membership_provider_lineage_id)
      SELECT ${user.id}, 'direct', id FROM lineage RETURNING id, membership_provider_lineage_id
    ), operation AS (
      INSERT INTO membership_operations (membership_source_id, membership_provider_lineage_id,
        membership_lineage_binding_id, membership_provider_context_id, operation_kind, idempotency_key,
        qualifying_allocation_minor_units, remaining_refundable_minor_units, currency_code,
        period_started_at, period_ends_at, collision_at, requested_at)
      SELECT source.id, source.membership_provider_lineage_id, binding.id, lineage.membership_provider_context_id,
        ${kind}::membership_operation_kinds, ${randomUUID()}, 100, 100, 'usd', ${completedAt}, ${completedAt},
        CASE WHEN ${isCaseKind} THEN ${completedAt}::timestamptz END, ${new Date(completedAt.getTime() - 60_000)}
      FROM source JOIN binding ON binding.membership_provider_lineage_id = source.membership_provider_lineage_id
        JOIN lineage ON lineage.id = source.membership_provider_lineage_id
      RETURNING id
    ), receipt AS (
      INSERT INTO membership_automatic_refund_receipts (membership_operation_id,
        membership_provider_context_id, provider_refund_id, amount_minor_units, currency_code)
      SELECT operation.id, lineage.membership_provider_context_id, ${`re_${randomUUID()}`}, 100, 'usd'
      FROM operation CROSS JOIN lineage
    ) SELECT operation.id, source.id AS source_id, lineage.id AS lineage_id, binding.id AS binding_id
      FROM operation CROSS JOIN source CROSS JOIN lineage CROSS JOIN binding`,
  )
  const { id, source_id, lineage_id, binding_id } = rows[0]!
  let caseId: string | null = null
  if (isCaseKind) {
    caseId = await insertTestReversalCase({
      bindingId: binding_id,
      membershipProviderLineageId: lineage_id,
      sourceId: source_id,
      stripePriceId: `price-${randomUUID()}`,
      qualifyingAmountMinorUnits: 100,
      refundCapMinorUnits: 100,
    })
    if (kind === 'ineligible_purchase_reversal')
      await associateTestReversalCaseWithOperation(caseId, id)
    if (caseState !== 'unfinished_sibling')
      await write(sql`/* createFiscalLedgerCaseCycle */
        INSERT INTO membership_ineligible_purchase_reversal_refund_scan_cycles
          (membership_ineligible_purchase_reversal_case_id, completed_at)
        VALUES (${caseId}, ${caseState === 'closed' ? new Date() : null})`)
    else
      await write(sql`/* createFiscalLedgerUnfinishedSibling */
        INSERT INTO membership_operations (membership_source_id, membership_provider_lineage_id,
          membership_lineage_binding_id, membership_provider_context_id, operation_kind, idempotency_key,
          qualifying_allocation_minor_units, remaining_refundable_minor_units, currency_code,
          period_started_at, period_ends_at, collision_at)
        SELECT membership_source_id, membership_provider_lineage_id, membership_lineage_binding_id,
          membership_provider_context_id, 'collision_resolution', ${randomUUID()}, 100, 100, 'usd',
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        FROM membership_operations WHERE id = ${id}`)
  }
  await claimTestMembershipOperation(id)
  await write(sql`/* completeFiscalLedgerOperation */
    UPDATE membership_operations SET completed_at = ${completedAt} WHERE id = ${id}`)
  return { operationId: id, caseId }
}

/** Receipts and case links still present for one operation. */
export async function countFiscalLedgerChildren(
  operationId: string,
): Promise<{ receipts: number; caseLinks: number }> {
  const { rows } = await read<{ receipts: string; case_links: string }>(
    sql`/* countFiscalLedgerChildren */ SELECT
      (SELECT count(*) FROM membership_automatic_refund_receipts WHERE membership_operation_id = ${operationId})::TEXT AS receipts,
      (SELECT count(*) FROM membership_ineligible_purchase_reversal_case_operations WHERE membership_operation_id = ${operationId})::TEXT AS case_links`,
  )
  return { receipts: Number(rows[0]!.receipts), caseLinks: Number(rows[0]!.case_links) }
}

/** Starts the next unscoped pass right after a known operation. */
export async function positionMembershipOperationLedgerCursor(
  operationId: string | null,
): Promise<void> {
  await write(sql`/* positionMembershipOperationLedgerCursor */
    UPDATE payment_operational_cleanup_cursors SET cursor_id = ${operationId}
    WHERE kind = 'membership_operation_ledger'`)
}
