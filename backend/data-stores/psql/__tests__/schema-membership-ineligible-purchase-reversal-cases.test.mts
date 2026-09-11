import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import sql from 'sql-template-strings'
import { onGracefulShutdown, write } from '../index.mts'
import { createLocalTestUser } from '../test-helpers/users.mts'

describe('membership ineligible purchase reversal case schema', () => {
  afterAll(async () => {
    await onGracefulShutdown()
  })

  it('makes collision cases and their operation associations immutable', async () => {
    const fixture = await createReversalCaseFixture()

    await expect(
      write(sql`/* rejectReversalCaseMutation */
        UPDATE membership_ineligible_purchase_reversal_cases
        SET refund_cap_minor_units = 0 WHERE id = ${fixture.caseId}`),
    ).rejects.toThrow('membership ineligible purchase reversal cases are immutable')
    await expect(
      write(sql`/* rejectReversalCaseDeletion */
        DELETE FROM membership_ineligible_purchase_reversal_cases WHERE id = ${fixture.caseId}`),
    ).rejects.toThrow('membership ineligible purchase reversal cases are immutable')
    await expect(
      write(sql`/* rejectReversalCaseOperationMutation */
        UPDATE membership_ineligible_purchase_reversal_case_operations
        SET membership_operation_id = ${randomUUID()}
        WHERE membership_ineligible_purchase_reversal_case_id = ${fixture.caseId}`),
    ).rejects.toThrow('membership ineligible purchase reversal case operations are immutable')
    await expect(
      write(sql`/* rejectReversalCaseOperationDeletion */
        DELETE FROM membership_ineligible_purchase_reversal_case_operations
        WHERE membership_ineligible_purchase_reversal_case_id = ${fixture.caseId}`),
    ).rejects.toThrow('membership ineligible purchase reversal case operations are immutable')
  })

  it('keeps each binding and operation associated with at most one reversal case', async () => {
    const [first, second] = await Promise.all([
      createReversalCaseFixture(),
      createReversalCaseFixture(),
    ])

    await expect(
      insertReversalCase({
        ...first,
        refundCapMinorUnits: 50,
      }),
    ).rejects.toMatchObject({ code: '23505' })
    await expect(
      write(sql`/* rejectDuplicateReversalCaseOperation */
        INSERT INTO membership_ineligible_purchase_reversal_case_operations (
          membership_ineligible_purchase_reversal_case_id, membership_operation_id
        ) VALUES (${second.caseId}, ${first.operationId})`),
    ).rejects.toMatchObject({ code: '23514' })
    const { rows } = await write<{ id: string }>(sql`/* createWrongKindReversalCaseOperation */
      INSERT INTO membership_operations (
        membership_source_id, membership_provider_lineage_id, membership_lineage_binding_id,
        provider, environment, application_id, operation_kind, idempotency_key,
        qualifying_allocation_minor_units, remaining_refundable_minor_units, currency_code,
        period_started_at, period_ends_at
      )
      SELECT membership_source_id, membership_provider_lineage_id,
        membership_lineage_binding_id, provider, environment, application_id,
        'automatic_refund', ${`wrong-kind-${randomUUID()}`}, 100, 100, 'usd',
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      FROM membership_operations WHERE id = ${first.operationId}
      RETURNING id`)
    await expect(
      write(sql`/* rejectWrongKindReversalCaseOperation */
        INSERT INTO membership_ineligible_purchase_reversal_case_operations (
          membership_ineligible_purchase_reversal_case_id, membership_operation_id
        ) VALUES (${first.caseId}, ${rows[0]!.id})`),
    ).rejects.toMatchObject({ code: '23514' })
    await expect(
      write(sql`/* rejectUnknownReversalCaseOperation */
        INSERT INTO membership_ineligible_purchase_reversal_case_operations (
          membership_ineligible_purchase_reversal_case_id, membership_operation_id
        ) VALUES (${second.caseId}, ${randomUUID()})`),
    ).rejects.toMatchObject({ code: '23503' })
  })

  it('enforces safe, qualifying-bounded refund caps', async () => {
    await expect(
      createReversalCaseFixture({ qualifyingAmountMinorUnits: 100, refundCapMinorUnits: 101 }),
    ).rejects.toMatchObject({ code: '23514' })
    await expect(
      createReversalCaseFixture({ qualifyingAmountMinorUnits: 100, refundCapMinorUnits: -1 }),
    ).rejects.toMatchObject({ code: '23514' })
    await expect(
      createReversalCaseFixture({
        qualifyingAmountMinorUnits: 9_007_199_254_740_992,
        refundCapMinorUnits: 9_007_199_254_740_992,
      }),
    ).rejects.toMatchObject({ code: '23514' })
  })
})

type ReversalCaseFixture = {
  bindingId: string
  caseId: string
  membershipProviderLineageId: string
  operationId: string
  refundCapMinorUnits: number
  sourceId: string
  stripePriceId: string
  qualifyingAmountMinorUnits: number
}

async function createReversalCaseFixture(
  amounts: Pick<ReversalCaseFixture, 'qualifyingAmountMinorUnits' | 'refundCapMinorUnits'> = {
    qualifyingAmountMinorUnits: 100,
    refundCapMinorUnits: 75,
  },
): Promise<ReversalCaseFixture> {
  const user = await createLocalTestUser()
  const suffix = randomUUID()
  const applicationId = `reversal-case-${suffix}`
  const { rows } = await write<{
    binding_id: string
    membership_provider_lineage_id: string
    operation_id: string
    source_id: string
  }>(sql`/* createReversalCaseFixtureContext */
    WITH lineage AS (
      INSERT INTO membership_provider_lineages (
        provider, environment, application_id, provider_lineage_id
      ) VALUES ('stripe', 'test', ${applicationId}, ${`lineage-${suffix}`})
      RETURNING id
    ), binding AS (
      INSERT INTO membership_lineage_bindings (membership_provider_lineage_id, user_id)
      SELECT id, ${user.id} FROM lineage
      RETURNING id, membership_provider_lineage_id
    ), source AS (
      INSERT INTO membership_sources (
        user_id, source_kind, membership_provider_lineage_id
      )
      SELECT ${user.id}, 'direct', id FROM lineage
      RETURNING id, membership_provider_lineage_id
    ), operation AS (
      INSERT INTO membership_operations (
        membership_source_id, membership_provider_lineage_id, membership_lineage_binding_id,
        provider, environment, application_id, operation_kind, idempotency_key,
        qualifying_allocation_minor_units, remaining_refundable_minor_units, currency_code,
        period_started_at, period_ends_at, collision_at
      )
      SELECT source.id, source.membership_provider_lineage_id, binding.id,
        'stripe', 'test', ${applicationId}, 'ineligible_purchase_reversal', ${`operation-${suffix}`},
        100, 100, 'usd', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      FROM source INNER JOIN binding
        ON binding.membership_provider_lineage_id = source.membership_provider_lineage_id
      RETURNING id
    )
    SELECT binding.id AS binding_id,
      binding.membership_provider_lineage_id,
      operation.id AS operation_id, source.id AS source_id
    FROM binding CROSS JOIN source CROSS JOIN operation`)
  const fixture = {
    bindingId: rows[0]!.binding_id,
    membershipProviderLineageId: rows[0]!.membership_provider_lineage_id,
    operationId: rows[0]!.operation_id,
    sourceId: rows[0]!.source_id,
    stripePriceId: `price-${suffix}`,
    ...amounts,
  }
  const caseId = await insertReversalCase(fixture)

  await write(sql`/* associateReversalCaseOperation */
    INSERT INTO membership_ineligible_purchase_reversal_case_operations (
      membership_ineligible_purchase_reversal_case_id, membership_operation_id
    ) VALUES (${caseId}, ${fixture.operationId})`)

  return { ...fixture, caseId }
}

async function insertReversalCase(
  fixture: Omit<ReversalCaseFixture, 'caseId' | 'operationId'>,
): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`/* insertReversalCase */
    INSERT INTO membership_ineligible_purchase_reversal_cases (
      membership_source_id, membership_provider_lineage_id, membership_lineage_binding_id,
      stripe_price_id, winning_source_kind, qualifying_amount_minor_units,
      refund_cap_minor_units, currency_code, period_started_at, period_ends_at, collision_at
    ) VALUES (
      ${fixture.sourceId}, ${fixture.membershipProviderLineageId}, ${fixture.bindingId},
      ${fixture.stripePriceId}, 'direct', ${fixture.qualifyingAmountMinorUnits},
      ${fixture.refundCapMinorUnits}, 'usd', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    ) RETURNING id`)
  return rows[0]!.id
}
