import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import sql from 'sql-template-strings'
import { onGracefulShutdown, read, write } from '../index.mts'

describe('membership ledger immutability', () => {
  afterAll(async () => {
    await onGracefulShutdown()
  })

  it('freezes grant facts and permits one revocation transition', async () => {
    const { rows: productRows } = await read<{ id: string }>(
      `SELECT id FROM membership_products WHERE plan = 'plus' AND billing_interval = 'monthly'`,
    )
    const { rows } = await write<{ id: string }>(sql`/* createImmutableTestGrant */
      WITH source AS (
        INSERT INTO membership_sources (user_id, source_kind)
        VALUES (${randomUUID()}, 'admin_grant')
        RETURNING id, user_id
      )
      INSERT INTO membership_grants (
        membership_source_id, user_id, membership_product_id,
        calendar_days, issuer_snapshot
      )
      SELECT id, user_id, ${productRows[0]!.id}, 30, 'Test issuer' FROM source
      RETURNING id`)
    const grantId = rows[0]!.id

    await expect(
      write(sql`UPDATE membership_grants SET calendar_days = 31 WHERE id = ${grantId}`),
    ).rejects.toThrow('membership grants only allow a pending-to-revoked lifecycle transition')
    await expect(write(sql`DELETE FROM membership_grants WHERE id = ${grantId}`)).rejects.toThrow(
      'membership grants cannot be deleted',
    )
    await expect(
      write(sql`UPDATE membership_grants
        SET revoked_at = CURRENT_TIMESTAMP, revoked_by_id = ${randomUUID()},
            revocation_reason = 'policy reversal'
        WHERE id = ${grantId}`),
    ).resolves.toMatchObject({ rowCount: 1 })
    await expect(
      write(sql`UPDATE membership_grants SET revocation_reason = 'changed' WHERE id = ${grantId}`),
    ).rejects.toThrow('membership grants only allow a pending-to-revoked lifecycle transition')
    await expect(
      write(
        sql`UPDATE membership_grants SET revoked_by_id = ${randomUUID()} WHERE id = ${grantId}`,
      ),
    ).rejects.toThrow('membership grants only allow a pending-to-revoked lifecycle transition')
  })

  it('freezes operation facts and permits one terminal transition', async () => {
    await expect(
      createOperation(`invalid-collision-${randomUUID()}`, new Date()),
    ).rejects.toMatchObject({ code: '23514' })
    const operationId = await createOperation(`complete-${randomUUID()}`)

    await expect(
      write(
        sql`UPDATE membership_operations SET idempotency_key = 'changed' WHERE id = ${operationId}`,
      ),
    ).rejects.toThrow('membership operations only allow one terminal lifecycle transition')
    await expect(
      write(sql`UPDATE membership_operations
        SET membership_lineage_binding_id = ${randomUUID()} WHERE id = ${operationId}`),
    ).rejects.toThrow('membership operations only allow one terminal lifecycle transition')
    await expect(
      write(sql`DELETE FROM membership_operations WHERE id = ${operationId}`),
    ).rejects.toThrow('membership operations cannot be deleted')
    await claimOperation(operationId)
    await expect(
      write(
        sql`UPDATE membership_operations
          SET completed_at = CURRENT_TIMESTAMP,
              execution_claim_token = NULL, execution_claimed_at = NULL
          WHERE id = ${operationId}`,
      ),
    ).resolves.toMatchObject({ rowCount: 1 })
    await expect(
      write(sql`UPDATE membership_operations SET completed_at = NULL WHERE id = ${operationId}`),
    ).rejects.toThrow('membership operations only allow one terminal lifecycle transition')

    const failedOperationId = await createOperation(`failed-${randomUUID()}`)
    await claimOperation(failedOperationId)
    await expect(
      write(
        sql`UPDATE membership_operations
          SET failed_at = CURRENT_TIMESTAMP,
              execution_claim_token = NULL, execution_claimed_at = NULL
          WHERE id = ${failedOperationId}`,
      ),
    ).rejects.toMatchObject({ code: '23514' })
    await expect(
      write(sql`UPDATE membership_operations
        SET failed_at = CURRENT_TIMESTAMP, failure_message = 'provider request failed',
            execution_claim_token = NULL, execution_claimed_at = NULL
        WHERE id = ${failedOperationId}`),
    ).resolves.toMatchObject({ rowCount: 1 })
  })

  it('permits only claimed provider execution and reconciliation transitions', async () => {
    const operationId = await createRefundOperation(`lease-${randomUUID()}`)
    const claimToken = randomUUID()

    await expect(
      write(sql`UPDATE membership_operations
        SET execution_claim_token = ${claimToken} WHERE id = ${operationId}`),
    ).rejects.toMatchObject({ code: '23514' })
    await expect(
      write(sql`UPDATE membership_operations
        SET execution_claim_token = ${claimToken}, execution_claimed_at = CURRENT_TIMESTAMP
        WHERE id = ${operationId}`),
    ).resolves.toMatchObject({ rowCount: 1 })
    await expect(
      write(sql`UPDATE membership_operations
        SET provider_refund_id = ${`re_${randomUUID()}`} WHERE id = ${operationId}`),
    ).resolves.toMatchObject({ rowCount: 1 })
    await expect(
      write(sql`UPDATE membership_operations
        SET failed_at = CURRENT_TIMESTAMP, failure_message = 'provider request failed',
            execution_claim_token = NULL, execution_claimed_at = NULL
        WHERE id = ${operationId}`),
    ).resolves.toMatchObject({ rowCount: 1 })
    await expect(
      write(sql`UPDATE membership_operations
        SET remaining_refundable_minor_units = 50 WHERE id = ${operationId}`),
    ).resolves.toMatchObject({ rowCount: 1 })
  })

  it('scopes provider refund identities to their provider application context', async () => {
    const [firstOperationId, secondOperationId] = await Promise.all([
      createRefundOperation(`refund-context-first-${randomUUID()}`),
      createRefundOperation(`refund-context-second-${randomUUID()}`),
    ])
    const providerRefundId = `re_${randomUUID()}`

    await Promise.all(
      [firstOperationId, secondOperationId].map(operationId =>
        write(sql`UPDATE membership_operations
          SET execution_claim_token = ${randomUUID()}, execution_claimed_at = CURRENT_TIMESTAMP
          WHERE id = ${operationId}`),
      ),
    )
    await expect(
      Promise.all(
        [firstOperationId, secondOperationId].map(operationId =>
          write(sql`UPDATE membership_operations
            SET provider_refund_id = ${providerRefundId} WHERE id = ${operationId}`),
        ),
      ),
    ).resolves.toHaveLength(2)
  })

  it('allows a lineage binding originating invoice to be filled once', async () => {
    const applicationId = `binding-immutable-${randomUUID()}`
    const { rows: userRows } = await read<{ id: string }>(
      `/* getImmutableTestBindingUser */ SELECT id FROM users ORDER BY id LIMIT 1`,
    )
    const userId = userRows[0]!.id
    const { rows } = await write<{ id: string }>(sql`/* createImmutableTestBinding */
      WITH lineage AS (
        INSERT INTO membership_provider_lineages (
          provider, environment, application_id, provider_lineage_id
        ) VALUES ('stripe', 'test', ${applicationId}, ${`lineage-${randomUUID()}`})
        RETURNING id
      )
      INSERT INTO membership_lineage_bindings (
        membership_provider_lineage_id, user_id
      )
      SELECT id, ${userId} FROM lineage
      RETURNING id`)
    const bindingId = rows[0]!.id

    await expect(
      write(sql`UPDATE membership_lineage_bindings
        SET originating_invoice_id = 'in_original' WHERE id = ${bindingId}`),
    ).resolves.toMatchObject({ rowCount: 1 })
    await expect(
      write(sql`UPDATE membership_lineage_bindings
        SET originating_invoice_id = 'in_rewritten' WHERE id = ${bindingId}`),
    ).rejects.toThrow('membership lineage bindings only allow release and final-purge transitions')
  })

  it('rejects membership change history mutation and deletion', async () => {
    const changeId = randomUUID()
    await write(sql`/* createImmutableTestMembershipChange */
      INSERT INTO membership_changes (id, membership_id, user_id, change_type, note)
      VALUES (${changeId}, ${randomUUID()}, ${randomUUID()}, 'admin_grant', 'original')`)

    await expect(
      write(sql`UPDATE membership_changes SET note = 'rewritten' WHERE id = ${changeId}`),
    ).rejects.toThrow('membership changes are append-only')
    await expect(write(sql`DELETE FROM membership_changes WHERE id = ${changeId}`)).rejects.toThrow(
      'membership changes are append-only',
    )
  })
})

async function createOperation(
  idempotencyKey: string,
  collisionAt: Date | null = null,
): Promise<string> {
  const applicationId = `ledger-immutable-${randomUUID()}`
  const { rows } = await write<{ id: string }>(sql`/* createImmutableTestOperation */
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
      provider, environment, application_id, operation_kind, idempotency_key, collision_at
    )
    SELECT source.id, source.membership_provider_lineage_id, binding.id,
      'stripe', 'test', ${applicationId}, 'cancel_source', ${idempotencyKey}, ${collisionAt}
    FROM source INNER JOIN binding
      ON binding.membership_provider_lineage_id = source.membership_provider_lineage_id
    RETURNING id`)
  return rows[0]!.id
}

async function createRefundOperation(idempotencyKey: string): Promise<string> {
  const applicationId = `ledger-lease-${randomUUID()}`
  const { rows } = await write<{ id: string }>(sql`/* createLeasedRefundOperation */
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

async function claimOperation(operationId: string): Promise<void> {
  await write(sql`/* claimImmutableTestOperation */ UPDATE membership_operations
    SET execution_claim_token = ${randomUUID()}, execution_claimed_at = CURRENT_TIMESTAMP
    WHERE id = ${operationId}`)
}
