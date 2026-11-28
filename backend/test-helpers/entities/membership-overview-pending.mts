import { randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function createTestMemberFinancialOperation(options: {
  userId: string
  provider?: 'stripe' | 'apple_app_store' | 'google_play' | 'microsoft_store'
  kind?:
    | 'cancel_source'
    | 'automatic_refund'
    | 'ineligible_purchase_reversal'
    | 'collision_resolution'
  state: 'pending' | 'failed' | 'completed'
}): Promise<string> {
  const provider = options.provider ?? 'stripe'
  const kind = options.kind ?? 'cancel_source'
  const applicationId = `overview-pending-${randomUUID()}`
  const isRefund =
    kind === 'automatic_refund' ||
    kind === 'ineligible_purchase_reversal' ||
    kind === 'collision_resolution'
  const needsCollision = kind === 'ineligible_purchase_reversal' || kind === 'collision_resolution'
  const { rows } = await write<{ id: string }>(sql`/* createTestMemberFinancialOperation */
    WITH context AS (
      SELECT fn_upsert_membership_provider_context_id(${provider}, 'test', ${applicationId}) AS id
    ), lineage AS (
      INSERT INTO membership_provider_lineages (membership_provider_context_id, provider_lineage_id)
      SELECT context.id, ${`lineage-${randomUUID()}`} FROM context
      RETURNING id, membership_provider_context_id
    ), binding AS (
      INSERT INTO membership_lineage_bindings (membership_provider_lineage_id, user_id)
      SELECT lineage.id, ${options.userId}::uuid FROM lineage
      RETURNING id, membership_provider_lineage_id
    ), source AS (
      INSERT INTO membership_sources (user_id, source_kind, membership_provider_lineage_id)
      SELECT ${options.userId}::uuid, 'direct', lineage.id FROM lineage
      RETURNING id, membership_provider_lineage_id
    )
    INSERT INTO membership_operations (
      membership_source_id, membership_provider_lineage_id, membership_lineage_binding_id,
      membership_provider_context_id, operation_kind, idempotency_key,
      collision_at, qualifying_allocation_minor_units, remaining_refundable_minor_units,
      currency_code, period_started_at, period_ends_at,
      completed_at, failed_at, failure_message
    )
    SELECT source.id, source.membership_provider_lineage_id, binding.id,
      lineage.membership_provider_context_id, ${kind}::membership_operation_kinds, ${`op-${randomUUID()}`},
      CASE WHEN ${needsCollision} THEN CURRENT_TIMESTAMP END,
      CASE WHEN ${isRefund} THEN 100 END,
      CASE WHEN ${isRefund} THEN 100 END,
      CASE WHEN ${isRefund} THEN 'usd'::currency_codes END,
      CASE WHEN ${isRefund} THEN CURRENT_TIMESTAMP END,
      CASE WHEN ${isRefund} THEN CURRENT_TIMESTAMP END,
      CASE WHEN ${options.state === 'completed'} THEN CURRENT_TIMESTAMP END,
      CASE WHEN ${options.state === 'failed'} THEN CURRENT_TIMESTAMP END,
      CASE WHEN ${options.state === 'failed'} THEN 'Synthetic failure' END
    FROM source
    INNER JOIN binding ON binding.membership_provider_lineage_id = source.membership_provider_lineage_id
    INNER JOIN lineage ON lineage.id = source.membership_provider_lineage_id
    RETURNING id`)
  return rows[0]!.id
}
