import { write } from '@data-stores/psql'
import { mapWithConcurrency } from '@vouchington/utils/async'
import sql from 'sql-template-strings'
import { createIneligiblePurchaseReversalIdempotencyKey } from '../ineligible-stripe-purchase-reversal-idempotency.mts'
import type { ReversalTarget } from '../ineligible-stripe-purchase-reversal-types.mts'
import { resolveStripeRefundChargeId } from '../refund-issuance.mts'
import type { IneligiblePurchaseReversalCase } from './case-ledger.mts'

export async function prepareReversalTargetCharges(
  reversalCase: IneligiblePurchaseReversalCase,
  targets: readonly ReversalTarget[],
): Promise<ReadonlyMap<string, string>> {
  const paymentIntentsByKey = new Map(
    targets.flatMap(target => {
      if (!target.paymentIntentId) return []
      const idempotencyKey = createIneligiblePurchaseReversalIdempotencyKey(
        reversalCase.providerEnvironment,
        reversalCase.providerApplicationId,
        reversalCase.subscriptionId,
        target,
      )
      return [[idempotencyKey, target.paymentIntentId] as const]
    }),
  )
  if (paymentIntentsByKey.size === 0) return new Map()

  const { rows } = await write<{ idempotencyKey: string }>(sql`/* prepareReversalTargetCharges */
    SELECT operation.idempotency_key AS "idempotencyKey"
    FROM membership_operations operation
    INNER JOIN membership_provider_lineages lineage
      ON lineage.membership_provider_context_id = operation.membership_provider_context_id
    WHERE lineage.id = ${reversalCase.membershipProviderLineageId}
      AND operation.idempotency_key = ANY(${[...paymentIntentsByKey.keys()]}::TEXT[])
  `)
  const existingOperationKeys = new Set(rows.map(row => row.idempotencyKey))
  const newPaymentIntents = [...paymentIntentsByKey].filter(
    ([idempotencyKey]) => !existingOperationKeys.has(idempotencyKey),
  )
  return new Map(
    await mapWithConcurrency(
      newPaymentIntents,
      1,
      async ([idempotencyKey, paymentIntentId]) =>
        [idempotencyKey, await resolveStripeRefundChargeId(paymentIntentId)] as const,
    ),
  )
}
