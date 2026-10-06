import { randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

type QueryResult = { rowCount: number | null }

export async function createExecutionLeaseOperation(idempotencyKey: string): Promise<string> {
  const applicationId = `execution-lease-${randomUUID()}`
  const { rows } = await write<{ id: string }>(sql`/* createExecutionLeaseOperation */
    WITH lineage AS (
      INSERT INTO membership_provider_lineages (
        provider, environment, application_id, provider_lineage_id
      ) VALUES ('stripe', 'test', ${applicationId}, ${`lineage-${randomUUID()}`})
      RETURNING id
    ), binding AS (
      INSERT INTO membership_lineage_bindings (membership_provider_lineage_id, user_id)
      SELECT id, (SELECT id FROM users ORDER BY id LIMIT 1) FROM lineage
      RETURNING id, membership_provider_lineage_id
    ), source AS (
      INSERT INTO membership_sources (source_kind, membership_provider_lineage_id)
      SELECT 'direct', id FROM lineage
      RETURNING id, membership_provider_lineage_id
    )
    INSERT INTO membership_operations (
      membership_source_id, membership_provider_lineage_id, membership_lineage_binding_id,
      provider, environment, application_id, operation_kind, idempotency_key,
      qualifying_allocation_minor_units, remaining_refundable_minor_units, currency_code,
      period_started_at, period_ends_at
    )
    SELECT source.id, source.membership_provider_lineage_id, binding.id,
      'stripe', 'test', ${applicationId}, 'automatic_refund', ${idempotencyKey},
      100, 100, 'usd', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    FROM source INNER JOIN binding
      ON binding.membership_provider_lineage_id = source.membership_provider_lineage_id
    RETURNING id`)
  return rows[0]!.id
}

export function claimMembershipOperationExecutionLease(
  operationId: string,
  claimToken: string,
): Promise<QueryResult> {
  return write(sql`/* claimMembershipOperationExecutionLease */
    UPDATE membership_operation_execution_work_items
    SET lease_token = ${claimToken}, leased_at = clock_timestamp(),
      lease_expires_at = clock_timestamp() + INTERVAL '5 minutes', attempt_count = attempt_count + 1
    WHERE membership_operation_id = ${operationId}`)
}

export function expireMembershipOperationExecutionLease(operationId: string): Promise<QueryResult> {
  return write(sql`/* expireMembershipOperationExecutionLease */
    UPDATE membership_operation_execution_work_items
    SET leased_at = clock_timestamp() - INTERVAL '6 minutes', lease_expires_at = clock_timestamp() - INTERVAL '1 minute'
    WHERE membership_operation_id = ${operationId}`)
}

export async function getMembershipOperationExecutionWork(operationId: string) {
  const { rows } = await write<{ lease_token: string | null; attempt_count: number }>(
    sql`/* getMembershipOperationExecutionWork */ SELECT lease_token, attempt_count
    FROM membership_operation_execution_work_items WHERE membership_operation_id = ${operationId}`,
  )
  return rows[0] ?? null
}
