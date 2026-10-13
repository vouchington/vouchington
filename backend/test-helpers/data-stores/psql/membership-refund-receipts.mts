import { randomUUID } from 'node:crypto'
import sql from 'sql-template-strings'
import { write } from '@data-stores/psql'

export type MembershipRefundOperation = { applicationId: string; operationId: string }

export async function createMembershipRefundOperation(
  applicationId: string,
  idempotencyKey: string,
  collisionAt: Date | null = null,
): Promise<MembershipRefundOperation> {
  const { rows } = await write<{ operation_id: string }>(sql`/* createRefundReceiptOperation */
    WITH actor AS (
      INSERT INTO users DEFAULT VALUES RETURNING id
    ), lineage AS (
      INSERT INTO membership_provider_lineages (membership_provider_context_id, provider_lineage_id)
      VALUES (fn_upsert_membership_provider_context_id('stripe', 'test', ${applicationId}), ${`lineage-${randomUUID()}`}) RETURNING id
    ), binding AS (
      INSERT INTO membership_lineage_bindings (membership_provider_lineage_id, user_id)
      SELECT lineage.id, actor.id FROM lineage CROSS JOIN actor RETURNING id, membership_provider_lineage_id
    ), source AS (
      INSERT INTO membership_sources (source_kind, membership_provider_lineage_id)
      SELECT 'direct', id FROM lineage RETURNING id, membership_provider_lineage_id
    )
    INSERT INTO membership_operations (
      membership_source_id, membership_provider_lineage_id, membership_lineage_binding_id,
      membership_provider_context_id, operation_kind, idempotency_key,
      qualifying_allocation_minor_units, remaining_refundable_minor_units, currency_code,
      period_started_at, period_ends_at, collision_at
    )
    SELECT source.id, source.membership_provider_lineage_id, binding.id,
      fn_upsert_membership_provider_context_id('stripe', 'test', ${applicationId}), 'automatic_refund', ${idempotencyKey},
      100, 100, 'usd', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ${collisionAt}
    FROM source INNER JOIN binding ON binding.membership_provider_lineage_id = source.membership_provider_lineage_id
    RETURNING id AS operation_id`)
  return { applicationId, operationId: rows[0]!.operation_id }
}

export async function createCollisionHandlingMembershipOperation(
  operationKind: 'collision_resolution' | 'ineligible_purchase_reversal',
  collisionAt: Date | null,
): Promise<string> {
  const applicationId = `collision-${randomUUID()}`
  const { rows } = await write<{ operation_id: string }>(sql`/* createCollisionHandlingOperation */
    WITH actor AS (
      INSERT INTO users DEFAULT VALUES RETURNING id
    ), lineage AS (
      INSERT INTO membership_provider_lineages (membership_provider_context_id, provider_lineage_id)
      VALUES (fn_upsert_membership_provider_context_id('stripe', 'test', ${applicationId}), ${`lineage-${randomUUID()}`}) RETURNING id
    ), binding AS (
      INSERT INTO membership_lineage_bindings (membership_provider_lineage_id, user_id)
      SELECT lineage.id, actor.id FROM lineage CROSS JOIN actor RETURNING id, membership_provider_lineage_id
    ), source AS (
      INSERT INTO membership_sources (source_kind, membership_provider_lineage_id)
      SELECT 'direct', id FROM lineage RETURNING id, membership_provider_lineage_id
    )
    INSERT INTO membership_operations (
      membership_source_id, membership_provider_lineage_id, membership_lineage_binding_id,
      membership_provider_context_id, operation_kind, idempotency_key,
      qualifying_allocation_minor_units, remaining_refundable_minor_units, currency_code,
      period_started_at, period_ends_at, collision_at
    )
    SELECT source.id, source.membership_provider_lineage_id, binding.id,
      fn_upsert_membership_provider_context_id('stripe', 'test', ${applicationId}), ${operationKind}, ${randomUUID()},
      100, 100, 'usd', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ${collisionAt}
    FROM source INNER JOIN binding ON binding.membership_provider_lineage_id = source.membership_provider_lineage_id
    RETURNING id AS operation_id`)
  return rows[0]!.operation_id
}

export async function createMembershipAutomaticRefundReceipt(
  operation: MembershipRefundOperation,
  providerRefundId: string,
  currencyCode: 'eur' | null = null,
): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`/* createMembershipAutomaticRefundReceipt */
    INSERT INTO membership_automatic_refund_receipts (
      membership_operation_id, membership_provider_context_id, provider_refund_id, amount_minor_units, currency_code
    ) SELECT id, membership_provider_context_id, ${providerRefundId}, 100,
      COALESCE(${currencyCode}::currency_codes, currency_code)
      FROM membership_operations WHERE id = ${operation.operationId}
    RETURNING id`)
  return rows[0]!.id
}

export async function mutateMembershipAutomaticRefundReceipt(receiptId: string) {
  return write(sql`/* mutateMembershipAutomaticRefundReceipt */
    UPDATE membership_automatic_refund_receipts SET amount_minor_units = 99 WHERE id = ${receiptId}`)
}

export async function deleteMembershipAutomaticRefundReceipt(receiptId: string) {
  return write(sql`/* deleteMembershipAutomaticRefundReceipt */
    DELETE FROM membership_automatic_refund_receipts WHERE id = ${receiptId}`)
}
