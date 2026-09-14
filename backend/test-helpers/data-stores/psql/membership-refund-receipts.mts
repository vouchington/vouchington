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
    WITH lineage AS (
      INSERT INTO membership_provider_lineages (provider, environment, application_id, provider_lineage_id)
      VALUES ('stripe', 'test', ${applicationId}, ${`lineage-${randomUUID()}`}) RETURNING id
    ), binding AS (
      INSERT INTO membership_lineage_bindings (membership_provider_lineage_id, user_id)
      SELECT id, (SELECT id FROM users ORDER BY id LIMIT 1) FROM lineage RETURNING id, membership_provider_lineage_id
    ), source AS (
      INSERT INTO membership_sources (source_kind, membership_provider_lineage_id)
      SELECT 'direct', id FROM lineage RETURNING id, membership_provider_lineage_id
    )
    INSERT INTO membership_operations (
      membership_source_id, membership_provider_lineage_id, membership_lineage_binding_id,
      provider, environment, application_id, operation_kind, idempotency_key,
      qualifying_allocation_minor_units, remaining_refundable_minor_units, currency_code,
      period_started_at, period_ends_at, collision_at
    )
    SELECT source.id, source.membership_provider_lineage_id, binding.id,
      'stripe', 'test', ${applicationId}, 'automatic_refund', ${idempotencyKey},
      100, 100, 'usd', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ${collisionAt}
    FROM source INNER JOIN binding ON binding.membership_provider_lineage_id = source.membership_provider_lineage_id
    RETURNING id AS operation_id`)
  return { applicationId, operationId: rows[0]!.operation_id }
}

export async function createCollisionHandlingMembershipOperation(
  operationKind: 'collision_resolution' | 'ineligible_purchase_reversal',
  includeCollisionAt: boolean,
): Promise<string> {
  const applicationId = `collision-${randomUUID()}`
  const { rows } = await write<{ operation_id: string }>(sql`/* createCollisionHandlingOperation */
    WITH lineage AS (
      INSERT INTO membership_provider_lineages (provider, environment, application_id, provider_lineage_id)
      VALUES ('stripe', 'test', ${applicationId}, ${`lineage-${randomUUID()}`}) RETURNING id
    ), binding AS (
      INSERT INTO membership_lineage_bindings (membership_provider_lineage_id, user_id)
      SELECT id, (SELECT id FROM users ORDER BY id LIMIT 1) FROM lineage RETURNING id, membership_provider_lineage_id
    ), source AS (
      INSERT INTO membership_sources (source_kind, membership_provider_lineage_id)
      SELECT 'direct', id FROM lineage RETURNING id, membership_provider_lineage_id
    )
    INSERT INTO membership_operations (
      membership_source_id, membership_provider_lineage_id, membership_lineage_binding_id,
      provider, environment, application_id, operation_kind, idempotency_key,
      qualifying_allocation_minor_units, remaining_refundable_minor_units, currency_code,
      period_started_at, period_ends_at, collision_at
    )
    SELECT source.id, source.membership_provider_lineage_id, binding.id,
      'stripe', 'test', ${applicationId}, ${operationKind}, ${randomUUID()},
      100, 100, 'usd', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ${includeCollisionAt ? new Date() : null}
    FROM source INNER JOIN binding ON binding.membership_provider_lineage_id = source.membership_provider_lineage_id
    RETURNING id AS operation_id`)
  return rows[0]!.operation_id
}

export async function createMembershipAutomaticRefundReceipt(
  operation: MembershipRefundOperation,
  providerRefundId: string,
): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`/* createMembershipAutomaticRefundReceipt */
    INSERT INTO membership_automatic_refund_receipts (
      membership_operation_id, provider, environment, application_id, operation_kind,
      provider_refund_id, amount_minor_units, remaining_refundable_minor_units, currency_code
    ) VALUES (${operation.operationId}, 'stripe', 'test', ${operation.applicationId}, 'automatic_refund', ${providerRefundId}, 100, 100, 'usd')
    RETURNING id`)
  return rows[0]!.id
}

export async function createMismatchedMembershipAutomaticRefundReceipt(
  operation: MembershipRefundOperation,
  applicationId: string,
  providerRefundId: string,
) {
  return write(sql`/* mismatchMembershipAutomaticRefundReceiptContext */
    INSERT INTO membership_automatic_refund_receipts (
      membership_operation_id, provider, environment, application_id, operation_kind,
      provider_refund_id, amount_minor_units, remaining_refundable_minor_units, currency_code
    ) VALUES (${operation.operationId}, 'stripe', 'test', ${applicationId}, 'automatic_refund', ${providerRefundId}, 100, 100, 'usd')`)
}

export async function mutateMembershipAutomaticRefundReceipt(receiptId: string) {
  return write(sql`/* mutateMembershipAutomaticRefundReceipt */
    UPDATE membership_automatic_refund_receipts SET amount_minor_units = 99 WHERE id = ${receiptId}`)
}

export async function deleteMembershipAutomaticRefundReceipt(receiptId: string) {
  return write(sql`/* deleteMembershipAutomaticRefundReceipt */
    DELETE FROM membership_automatic_refund_receipts WHERE id = ${receiptId}`)
}
