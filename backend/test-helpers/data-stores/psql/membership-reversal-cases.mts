import { randomUUID } from 'node:crypto'
import { beginTransaction, write, type QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getLockedIneligiblePurchaseReversalCase } from '../../../services/memberships/ineligible-stripe-purchase-reversal/case-ledger.mts'

type QueryResult = { rowCount: number | null }
type ReversalCaseAmounts = {
  qualifyingAmountMinorUnits: number
  refundCapMinorUnits: number
}
type ReversalCaseContext = Pick<
  TestReversalCaseFixture,
  'bindingId' | 'membershipProviderLineageId' | 'sourceId' | 'stripePriceId'
>
export type TestReversalCaseFixture = ReversalCaseAmounts & {
  bindingId: string
  caseId: string
  membershipProviderLineageId: string
  operationId: string
  sourceId: string
  stripePriceId: string
}
export function mutateTestReversalCase(caseId: string): Promise<QueryResult> {
  return write(sql`/* rejectReversalCaseMutation */ UPDATE membership_ineligible_purchase_reversal_cases
    SET refund_cap_minor_units = 0 WHERE id = ${caseId}`)
}
export function deleteTestReversalCase(caseId: string): Promise<QueryResult> {
  return write(
    sql`/* rejectReversalCaseDeletion */ DELETE FROM membership_ineligible_purchase_reversal_cases WHERE id = ${caseId}`,
  )
}
export function mutateTestReversalCaseOperation(caseId: string): Promise<QueryResult> {
  return write(sql`/* rejectReversalCaseOperationMutation */ UPDATE membership_ineligible_purchase_reversal_case_operations
    SET membership_operation_id = ${randomUUID()} WHERE membership_ineligible_purchase_reversal_case_id = ${caseId}`)
}
export function deleteTestReversalCaseOperation(caseId: string): Promise<QueryResult> {
  return write(
    sql`/* rejectReversalCaseOperationDeletion */ DELETE FROM membership_ineligible_purchase_reversal_case_operations WHERE membership_ineligible_purchase_reversal_case_id = ${caseId}`,
  )
}
export function associateTestReversalCaseWithOperation(
  caseId: string,
  operationId: string,
): Promise<QueryResult> {
  return write(sql`/* associateReversalCaseOperation */ INSERT INTO membership_ineligible_purchase_reversal_case_operations (
    membership_ineligible_purchase_reversal_case_id, membership_operation_id
  ) VALUES (${caseId}, ${operationId})`)
}
export function associateDuplicateTestReversalCaseOperation(
  caseId: string,
  operationId: string,
): Promise<QueryResult> {
  return write(sql`/* rejectDuplicateReversalCaseOperation */ INSERT INTO membership_ineligible_purchase_reversal_case_operations (
    membership_ineligible_purchase_reversal_case_id, membership_operation_id
  ) VALUES (${caseId}, ${operationId})`)
}
export function associateWrongKindTestReversalCaseOperation(
  caseId: string,
  operationId: string,
): Promise<QueryResult> {
  return write(sql`/* rejectWrongKindReversalCaseOperation */ INSERT INTO membership_ineligible_purchase_reversal_case_operations (
    membership_ineligible_purchase_reversal_case_id, membership_operation_id
  ) VALUES (${caseId}, ${operationId})`)
}
export function associateUnknownTestReversalCaseOperation(caseId: string): Promise<QueryResult> {
  return write(sql`/* rejectUnknownReversalCaseOperation */ INSERT INTO membership_ineligible_purchase_reversal_case_operations (
    membership_ineligible_purchase_reversal_case_id, membership_operation_id
  ) VALUES (${caseId}, ${randomUUID()})`)
}
export async function createWrongKindTestReversalCaseOperation(
  operationId: string,
): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`/* createWrongKindReversalCaseOperation */
    INSERT INTO membership_operations (membership_source_id, membership_provider_lineage_id,
      membership_lineage_binding_id, membership_provider_context_id, operation_kind,
      idempotency_key, qualifying_allocation_minor_units, remaining_refundable_minor_units,
      currency_code, period_started_at, period_ends_at)
    SELECT membership_source_id, membership_provider_lineage_id, membership_lineage_binding_id,
      membership_provider_context_id, 'automatic_refund', ${`wrong-kind-${randomUUID()}`},
      100, 100, 'usd', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    FROM membership_operations WHERE id = ${operationId} RETURNING id`)
  return rows[0]!.id
}
type PersistedReversalCaseInput = ReversalCaseAmounts & {
  userId: string
  originatingInvoiceId: string
  providerApplicationId: string
  providerEnvironment: 'test' | 'production'
  subscriptionId: string
  stripePriceId: string
  currency: string
  winningSourceKind: 'admin_grant' | 'direct' | 'family'
  periodStartedAt: Date
  periodEndsAt: Date
  collisionAt: Date
}

export async function createTestPersistedReversalCaseFixture(
  input: PersistedReversalCaseInput,
): Promise<{ caseId: string }> {
  await using transaction = await beginTransaction()
  const existing = await getLockedIneligiblePurchaseReversalCase(input, transaction)
  if (existing) {
    await transaction.commit()
    return { caseId: existing.id }
  }
  const context = await createTestReversalCaseContext(input, transaction)
  const caseId = await insertTestReversalCase({ ...context, ...input }, transaction)
  await transaction.commit()
  return { caseId }
}
export async function createTestReversalCaseFixture(
  userId: string,
  amounts: ReversalCaseAmounts = { qualifyingAmountMinorUnits: 100, refundCapMinorUnits: 75 },
): Promise<TestReversalCaseFixture> {
  const suffix = randomUUID()
  const providerApplicationId = `reversal-case-${suffix}`
  const context = await createTestReversalCaseContext({
    userId,
    originatingInvoiceId: `in_reversal_case_${suffix}`,
    providerApplicationId,
    providerEnvironment: 'test',
    subscriptionId: `lineage-${suffix}`,
    stripePriceId: `price-${suffix}`,
  })
  const { rows } = await write<{ id: string }>(sql`/* createReversalCaseFixtureOperation */
    INSERT INTO membership_operations (membership_source_id, membership_provider_lineage_id,
      membership_lineage_binding_id, membership_provider_context_id, operation_kind,
      idempotency_key, qualifying_allocation_minor_units, remaining_refundable_minor_units,
      currency_code, period_started_at, period_ends_at, collision_at)
    VALUES (${context.sourceId}, ${context.membershipProviderLineageId}, ${context.bindingId},
      fn_upsert_membership_provider_context_id('stripe', 'test', ${providerApplicationId}),
      'ineligible_purchase_reversal', ${`operation-${suffix}`}, 100, 100, 'usd',
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING id`)
  const fixture = { ...context, ...amounts, operationId: rows[0]!.id }
  const caseId = await insertTestReversalCase(fixture)
  await associateTestReversalCaseWithOperation(caseId, fixture.operationId)
  return { ...fixture, caseId }
}
async function createTestReversalCaseContext(
  input: Pick<
    PersistedReversalCaseInput,
    | 'userId'
    | 'originatingInvoiceId'
    | 'providerApplicationId'
    | 'providerEnvironment'
    | 'subscriptionId'
    | 'stripePriceId'
  >,
  query: QueryExecutor = write,
): Promise<ReversalCaseContext> {
  const { rows } = await query(sql`/* createReversalCaseFixtureContext */
    WITH lineage AS (INSERT INTO membership_provider_lineages (membership_provider_context_id, provider_lineage_id)
      VALUES (fn_upsert_membership_provider_context_id('stripe', ${input.providerEnvironment}, ${input.providerApplicationId}),
        ${input.subscriptionId}) RETURNING id),
    binding AS (INSERT INTO membership_lineage_bindings (
      membership_provider_lineage_id, user_id, source_kind, originating_invoice_id)
      SELECT id, ${input.userId}, 'direct', ${input.originatingInvoiceId} FROM lineage
      RETURNING id, membership_provider_lineage_id),
    source AS (INSERT INTO membership_sources (user_id, source_kind, membership_provider_lineage_id)
      SELECT ${input.userId}, 'direct', id FROM lineage RETURNING id, membership_provider_lineage_id)
    SELECT binding.id AS binding_id, binding.membership_provider_lineage_id,
      source.id AS source_id FROM binding CROSS JOIN source`)
  const context = rows[0] as {
    binding_id: string
    membership_provider_lineage_id: string
    source_id: string
  }
  return {
    bindingId: context.binding_id,
    membershipProviderLineageId: context.membership_provider_lineage_id,
    sourceId: context.source_id,
    stripePriceId: input.stripePriceId,
  }
}

export async function insertTestReversalCase(
  fixture: Omit<TestReversalCaseFixture, 'caseId' | 'operationId'> &
    Partial<
      Pick<
        PersistedReversalCaseInput,
        'currency' | 'winningSourceKind' | 'periodStartedAt' | 'periodEndsAt' | 'collisionAt'
      >
    >,
  query: QueryExecutor = write,
): Promise<string> {
  const { rows } = await query(sql`/* insertReversalCase */
    INSERT INTO membership_ineligible_purchase_reversal_cases (membership_source_id,
      membership_provider_lineage_id, membership_lineage_binding_id, stripe_price_id,
      winning_source_kind, qualifying_amount_minor_units, refund_cap_minor_units, currency_code,
      period_started_at, period_ends_at, collision_at)
    VALUES (${fixture.sourceId}, ${fixture.membershipProviderLineageId}, ${fixture.bindingId},
      ${fixture.stripePriceId}, ${fixture.winningSourceKind ?? 'direct'},
      ${fixture.qualifyingAmountMinorUnits}, ${fixture.refundCapMinorUnits},
      ${fixture.currency ?? 'usd'},
      COALESCE(${fixture.periodStartedAt ?? null}::timestamptz, CURRENT_TIMESTAMP),
      COALESCE(${fixture.periodEndsAt ?? null}::timestamptz, CURRENT_TIMESTAMP),
      COALESCE(${fixture.collisionAt ?? null}::timestamptz, CURRENT_TIMESTAMP)) RETURNING id`)
  return (rows[0] as { id: string }).id
}
