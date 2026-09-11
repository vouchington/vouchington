import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { IneligiblePurchaseReversalCase } from './case-ledger.mts'

export type IneligiblePurchaseReversalCaseLookup = {
  originatingInvoiceId: string
  providerApplicationId?: string
  providerEnvironment: 'test' | 'production'
}

export async function getIneligiblePurchaseReversalCase(
  options: IneligiblePurchaseReversalCaseLookup,
): Promise<IneligiblePurchaseReversalCase | null> {
  const { rows } = await write(sql`/* getIneligiblePurchaseReversalCase */
    SELECT reversal_case.id, reversal_case.membership_source_id AS "membershipSourceId",
      reversal_case.membership_provider_lineage_id AS "membershipProviderLineageId",
      reversal_case.membership_lineage_binding_id AS "membershipLineageBindingId",
      lineage.environment AS "providerEnvironment", lineage.application_id AS "providerApplicationId",
      lineage.provider_lineage_id AS "subscriptionId", binding.originating_invoice_id AS "originatingInvoiceId",
      reversal_case.stripe_price_id AS "stripePriceId", reversal_case.winning_source_kind AS "winningSourceKind",
      reversal_case.qualifying_amount_minor_units::TEXT AS "qualifyingAmountMinorUnits",
      reversal_case.refund_cap_minor_units::TEXT AS "refundCapMinorUnits", reversal_case.currency_code AS currency,
      reversal_case.period_started_at AS "periodStartedAt", reversal_case.period_ends_at AS "periodEndsAt",
      reversal_case.collision_at AS "collisionAt"
    FROM membership_lineage_bindings binding
    INNER JOIN membership_provider_lineages lineage
      ON lineage.id = binding.membership_provider_lineage_id
    INNER JOIN membership_ineligible_purchase_reversal_cases reversal_case
      ON reversal_case.membership_lineage_binding_id = binding.id
    WHERE lineage.provider = 'stripe' AND lineage.environment = ${options.providerEnvironment}
      AND lineage.application_id = ${options.providerApplicationId ?? 'voucha-web'}
      AND binding.source_kind = 'direct'
      AND binding.originating_invoice_id = ${options.originatingInvoiceId}
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
