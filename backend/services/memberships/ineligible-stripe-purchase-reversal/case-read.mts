import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { IneligiblePurchaseReversalCase } from './case-ledger.mts'

export type IneligiblePurchaseReversalCaseLookup = {
  originatingInvoiceId: string
  providerApplicationId?: string
  providerEnvironment: 'test' | 'production'
}

export type IneligiblePurchaseReversalCasesLookup = Omit<
  IneligiblePurchaseReversalCaseLookup,
  'originatingInvoiceId'
> & { originatingInvoiceIds: string[] }

/** Reads the unexpired reversal case for each invoice id in one statement. */
export async function getIneligiblePurchaseReversalCases(
  options: IneligiblePurchaseReversalCasesLookup,
): Promise<IneligiblePurchaseReversalCase[]> {
  if (options.originatingInvoiceIds.length === 0) return []
  const { rows } = await write(sql`/* getIneligiblePurchaseReversalCases */
    SELECT reversal_case.id, reversal_case.membership_source_id AS "membershipSourceId",
      reversal_case.membership_provider_lineage_id AS "membershipProviderLineageId",
      reversal_case.membership_lineage_binding_id AS "membershipLineageBindingId",
      provider_context.environment AS "providerEnvironment", provider_context.application_id AS "providerApplicationId",
      lineage.provider_lineage_id AS "subscriptionId", reversal_case.originating_invoice_id AS "originatingInvoiceId",
      reversal_case.stripe_price_id AS "stripePriceId", reversal_case.winning_source_kind AS "winningSourceKind",
      reversal_case.qualifying_amount_minor_units::TEXT AS "qualifyingAmountMinorUnits",
      reversal_case.refund_cap_minor_units::TEXT AS "refundCapMinorUnits", reversal_case.currency_code AS currency,
      reversal_case.period_started_at AS "periodStartedAt", reversal_case.period_ends_at AS "periodEndsAt",
      reversal_case.collision_at AS "collisionAt"
    FROM membership_lineage_bindings binding
    INNER JOIN membership_provider_lineages lineage
      ON lineage.id = binding.membership_provider_lineage_id
    INNER JOIN membership_provider_contexts provider_context
      ON provider_context.id = lineage.membership_provider_context_id
    INNER JOIN membership_ineligible_purchase_reversal_cases reversal_case
      ON reversal_case.membership_lineage_binding_id = binding.id
    WHERE provider_context.provider = 'stripe' AND provider_context.environment = ${options.providerEnvironment}
      AND provider_context.application_id = ${options.providerApplicationId ?? 'voucha-web'}
      AND binding.source_kind = 'direct'
      AND reversal_case.originating_invoice_id = ANY(${options.originatingInvoiceIds}::text[])
      AND NOT fn_membership_reversal_case_expired(reversal_case.id)
  `)
  return (
    rows as Array<
      Omit<IneligiblePurchaseReversalCase, 'qualifyingAmountMinorUnits' | 'refundCapMinorUnits'> & {
        qualifyingAmountMinorUnits: string
        refundCapMinorUnits: string
      }
    >
  ).map(row => ({
    ...row,
    qualifyingAmountMinorUnits: Number(row.qualifyingAmountMinorUnits),
    refundCapMinorUnits: Number(row.refundCapMinorUnits),
  }))
}

export async function getIneligiblePurchaseReversalCase(
  options: IneligiblePurchaseReversalCaseLookup,
): Promise<IneligiblePurchaseReversalCase | null> {
  const { originatingInvoiceId, ...scope } = options
  const cases = await getIneligiblePurchaseReversalCases({
    ...scope,
    originatingInvoiceIds: [originatingInvoiceId],
  })
  if (cases.length > 1)
    throw new Error('Stripe reversal case lookup matched more than one immutable case')
  return cases[0] ?? null
}
