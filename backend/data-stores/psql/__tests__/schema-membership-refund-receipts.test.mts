import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import sql from 'sql-template-strings'
import { onGracefulShutdown, write } from '../index.mts'

describe('membership automatic refund receipts', () => {
  afterAll(async () => {
    await onGracefulShutdown()
  })

  it('scopes provider identities and rejects receipt mutation', async () => {
    const suffix = randomUUID()
    const first = await createOperation(`receipt-a-${suffix}`, `shared-key-${suffix}`)
    const second = await createOperation(`receipt-b-${suffix}`, `shared-key-${suffix}`)
    const sameContext = await createOperation(first.applicationId, `same-context-${suffix}`)
    const mismatched = await createOperation(`receipt-c-${suffix}`, `mismatch-key-${suffix}`)
    const providerRefundId = `refund-${suffix}`

    const firstReceipt = await createReceipt(first, providerRefundId)
    await expect(createReceipt(second, providerRefundId)).resolves.toEqual(expect.any(String))
    await expect(createReceipt(sameContext, providerRefundId)).rejects.toMatchObject({
      code: '23505',
    })
    await expect(
      createOperation(first.applicationId, `shared-key-${suffix}`),
    ).rejects.toMatchObject({ code: '23505' })

    await expect(
      write(sql`/* mismatchMembershipAutomaticRefundReceiptContext */
        INSERT INTO membership_automatic_refund_receipts (
          membership_operation_id, provider, environment, application_id, operation_kind,
          provider_refund_id, amount_minor_units, remaining_refundable_minor_units, currency_code
        ) VALUES (
          ${mismatched.operationId}, 'stripe', 'test', ${second.applicationId}, 'automatic_refund',
          ${`mismatch-${suffix}`}, 100, 100, 'usd'
        )`),
    ).rejects.toMatchObject({ code: '23503' })

    await expect(
      write(sql`/* mutateMembershipAutomaticRefundReceipt */
        UPDATE membership_automatic_refund_receipts
        SET amount_minor_units = 99
        WHERE id = ${firstReceipt}`),
    ).rejects.toThrow('membership automatic refund receipts are immutable')
    await expect(
      write(sql`/* deleteMembershipAutomaticRefundReceipt */
        DELETE FROM membership_automatic_refund_receipts WHERE id = ${firstReceipt}`),
    ).rejects.toThrow('membership automatic refund receipts are immutable')
  })

  it('records collision time only for collision-handling operations', async () => {
    await expect(
      createOperation(`invalid-automatic-${randomUUID()}`, randomUUID(), new Date()),
    ).rejects.toMatchObject({ code: '23514' })
    await expect(createCollisionOperation('collision_resolution', false)).rejects.toMatchObject({
      code: '23514',
    })
    await expect(createCollisionOperation('collision_resolution', true)).resolves.toEqual(
      expect.any(String),
    )
    await expect(
      createCollisionOperation('ineligible_purchase_reversal', false),
    ).rejects.toMatchObject({ code: '23514' })
    await expect(createCollisionOperation('ineligible_purchase_reversal', true)).resolves.toEqual(
      expect.any(String),
    )
  })
})

async function createOperation(
  applicationId: string,
  idempotencyKey: string,
  collisionAt: Date | null = null,
): Promise<{ operationId: string; applicationId: string }> {
  const { rows } = await write<{ operation_id: string }>(sql`/* createRefundReceiptOperation */
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
      period_started_at, period_ends_at, collision_at
    )
    SELECT source.id, source.membership_provider_lineage_id, binding.id,
      'stripe', 'test', ${applicationId}, 'automatic_refund', ${idempotencyKey},
      100, 100, 'usd', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ${collisionAt}
    FROM source INNER JOIN binding
      ON binding.membership_provider_lineage_id = source.membership_provider_lineage_id
    RETURNING id AS operation_id`)
  return { operationId: rows[0]!.operation_id, applicationId }
}

async function createCollisionOperation(
  operationKind: 'collision_resolution' | 'ineligible_purchase_reversal',
  includeCollisionAt: boolean,
): Promise<string> {
  const applicationId = `collision-${randomUUID()}`
  const { rows } = await write<{ operation_id: string }>(
    sql`/* createCollisionHandlingOperation */
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
        period_started_at, period_ends_at, collision_at
      )
      SELECT source.id, source.membership_provider_lineage_id, binding.id,
        'stripe', 'test', ${applicationId}, ${operationKind}, ${randomUUID()},
        100, 100, 'usd', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
        ${includeCollisionAt ? new Date() : null}
      FROM source INNER JOIN binding
        ON binding.membership_provider_lineage_id = source.membership_provider_lineage_id
      RETURNING id AS operation_id`,
  )
  return rows[0]!.operation_id
}

async function createReceipt(
  operation: { operationId: string; applicationId: string },
  providerRefundId: string,
): Promise<string> {
  const { rows } = await write(sql`/* createMembershipAutomaticRefundReceipt */
    INSERT INTO membership_automatic_refund_receipts (
      membership_operation_id, provider, environment, application_id, operation_kind,
      provider_refund_id, amount_minor_units, remaining_refundable_minor_units, currency_code
    ) VALUES (
      ${operation.operationId}, 'stripe', 'test', ${operation.applicationId}, 'automatic_refund',
      ${providerRefundId}, 100, 100, 'usd'
    )
    RETURNING id`)
  return (rows[0] as { id: string }).id
}
