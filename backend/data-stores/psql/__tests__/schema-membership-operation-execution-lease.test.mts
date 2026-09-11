import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import sql from 'sql-template-strings'
import { onGracefulShutdown, write } from '../index.mts'

describe('membership operation execution leases', () => {
  afterAll(async () => {
    await onGracefulShutdown()
  })

  it('permits only an expired lease to rotate its execution token', async () => {
    const staleOperationId = await createOperation(`stale-lease-${randomUUID()}`)
    const activeOperationId = await createOperation(`active-lease-${randomUUID()}`)
    const staleToken = randomUUID()
    const activeToken = randomUUID()

    await claimOperation(staleOperationId, staleToken)
    await write(sql`/* expireMembershipOperationExecutionLease */
      UPDATE membership_operations
      SET execution_claimed_at = CURRENT_TIMESTAMP - INTERVAL '6 minutes'
      WHERE id = ${staleOperationId}`)
    await expect(claimOperation(staleOperationId, randomUUID())).resolves.toMatchObject({
      rowCount: 1,
    })

    await claimOperation(activeOperationId, activeToken)
    await expect(claimOperation(activeOperationId, randomUUID())).rejects.toMatchObject({
      code: 'P0001',
      message: expect.stringContaining(
        'membership operations only allow claimed provider execution lifecycle transitions',
      ),
    })
  })
})

async function createOperation(idempotencyKey: string): Promise<string> {
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

function claimOperation(operationId: string, claimToken: string) {
  return write(sql`/* claimMembershipOperationExecutionLease */
    UPDATE membership_operations
    SET execution_claim_token = ${claimToken}, execution_claimed_at = CURRENT_TIMESTAMP
    WHERE id = ${operationId}`)
}
