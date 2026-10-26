import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type IneligiblePurchaseReversalCase = {
  collisionAt: Date
  currency: string
  id: string
  membershipLineageBindingId: string
  membershipProviderLineageId: string
  membershipSourceId: string
  originatingInvoiceId: string
  periodEndsAt: Date
  periodStartedAt: Date
  providerApplicationId: string
  providerEnvironment: 'test' | 'production'
  qualifyingAmountMinorUnits: number
  refundCapMinorUnits: number
  stripePriceId: string
  subscriptionId: string
  winningSourceKind: 'admin_grant' | 'direct' | 'family'
}
export async function getReversalCaseTargetAllocations(
  caseId: string,
  query: QueryExecutor,
): Promise<Map<string, number>> {
  const { rows } = await query(sql`/* getReversalCaseTargetAllocations */
    SELECT operation.idempotency_key AS "idempotencyKey",
      operation.qualifying_allocation_minor_units::TEXT AS "qualifyingAllocationMinorUnits"
    FROM membership_ineligible_purchase_reversal_case_operations case_operation
    INNER JOIN membership_operations operation ON operation.id = case_operation.membership_operation_id
    WHERE case_operation.membership_ineligible_purchase_reversal_case_id = ${caseId}
    ORDER BY operation.id
    FOR SHARE OF operation
  `)
  return new Map(
    (rows as Array<{ idempotencyKey: string; qualifyingAllocationMinorUnits: string }>).map(row => [
      row.idempotencyKey,
      Number(row.qualifyingAllocationMinorUnits),
    ]),
  )
}

export async function getLockedIneligiblePurchaseReversalCase(
  options: {
    originatingInvoiceId: string
    providerApplicationId: string
    providerEnvironment: 'test' | 'production'
    subscriptionId: string
  },
  query: QueryExecutor,
): Promise<IneligiblePurchaseReversalCase | null> {
  const { rows } = await query(sql`/* getLockedIneligiblePurchaseReversalCase */
    SELECT reversal_case.id, reversal_case.membership_source_id AS "membershipSourceId",
      reversal_case.membership_provider_lineage_id AS "membershipProviderLineageId",
      reversal_case.membership_lineage_binding_id AS "membershipLineageBindingId",
      provider_context.environment AS "providerEnvironment", provider_context.application_id AS "providerApplicationId",
      lineage.provider_lineage_id AS "subscriptionId", binding.originating_invoice_id AS "originatingInvoiceId",
      reversal_case.stripe_price_id AS "stripePriceId", reversal_case.winning_source_kind AS "winningSourceKind",
      reversal_case.qualifying_amount_minor_units::TEXT AS "qualifyingAmountMinorUnits",
      reversal_case.refund_cap_minor_units::TEXT AS "refundCapMinorUnits", reversal_case.currency_code AS currency,
      reversal_case.period_started_at AS "periodStartedAt", reversal_case.period_ends_at AS "periodEndsAt", reversal_case.collision_at AS "collisionAt"
    FROM membership_ineligible_purchase_reversal_cases reversal_case
    INNER JOIN membership_lineage_bindings binding
      ON binding.id = reversal_case.membership_lineage_binding_id
    INNER JOIN membership_provider_lineages lineage
      ON lineage.id = reversal_case.membership_provider_lineage_id
    INNER JOIN membership_provider_contexts provider_context
      ON provider_context.id = lineage.membership_provider_context_id
    WHERE provider_context.provider = 'stripe' AND provider_context.environment = ${options.providerEnvironment}
      AND provider_context.application_id = ${options.providerApplicationId}
      AND lineage.provider_lineage_id = ${options.subscriptionId}
      AND binding.source_kind = 'direct'
      AND binding.originating_invoice_id = ${options.originatingInvoiceId}
    FOR UPDATE OF reversal_case, binding, lineage
  `)
  if (rows.length > 1)
    throw new Error('Stripe reversal case lookup matched more than one immutable case')
  const row = rows[0] as
    | (Omit<
        IneligiblePurchaseReversalCase,
        'qualifyingAmountMinorUnits' | 'refundCapMinorUnits'
      > & {
        qualifyingAmountMinorUnits: string
        refundCapMinorUnits: string
      })
    | undefined
  return row
    ? {
        ...row,
        qualifyingAmountMinorUnits: Number(row.qualifyingAmountMinorUnits),
        refundCapMinorUnits: Number(row.refundCapMinorUnits),
      }
    : null
}

export async function recordReversalCaseOperation(
  caseId: string,
  operationId: string,
  query: QueryExecutor,
): Promise<void> {
  await query(sql`/* recordReversalCaseOperation */
    INSERT INTO membership_ineligible_purchase_reversal_case_operations (
      membership_ineligible_purchase_reversal_case_id, membership_operation_id
    ) VALUES (${caseId}, ${operationId}) ON CONFLICT DO NOTHING
  `)
}
