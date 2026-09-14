import type { QueryExecutor } from '@data-stores/psql'
import { createHash } from 'node:crypto'
import { getMapping } from './verification-persistence.mts'
import { verifyGooglePlaySubscription } from './subscription-verifier.mts'
import type { GooglePlayVerificationContext } from './context.mts'
import type { GooglePlaySubscriptionV2 } from './types.mts'

export async function preflightGooglePlayCurrentSubscription(options: {
  context: GooglePlayVerificationContext
  purchaseToken: string
  subscription: GooglePlaySubscriptionV2
  query: QueryExecutor
}): Promise<{ reasonCode: string } | { reasonCode: null }> {
  const mapping = await getMapping(options.context, options.subscription, options.query)
  if (!mapping) return { reasonCode: 'wrong_product' }
  const result = verifyGooglePlaySubscription({
    subscription: options.subscription,
    purchaseToken: options.purchaseToken,
    applicationId: options.context.applicationId,
    environment: options.context.environment,
    expectedProduct: {
      ...mapping,
      expectedObfuscatedAccountId: createHash('sha256')
        .update(options.context.userId)
        .digest('hex'),
    },
  })
  return result.accepted || result.bindablePending
    ? { reasonCode: null }
    : { reasonCode: result.reasonCode }
}
