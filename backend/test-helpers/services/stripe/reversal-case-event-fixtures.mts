import { randomUUID } from 'node:crypto'
import { createTestPersistedReversalCaseFixture } from '../../data-stores/psql/membership-reversal-cases.mts'
import { createTestSku, createTestUser } from '../../index.mts'

export async function createStripeEventReversalCase(options: {
  providerApplicationId: string
  providerEnvironment: 'test' | 'production'
}) {
  const user = await createTestUser()
  const sku = await createTestSku({ plan: 'pro' })
  const suffix = randomUUID()
  const originatingInvoiceId = `in_event_reversal_${suffix}`
  const subscriptionId = `sub_event_reversal_${suffix}`
  const now = new Date()
  await createTestPersistedReversalCaseFixture({
    ...options,
    userId: user.id,
    originatingInvoiceId,
    subscriptionId,
    stripePriceId: sku.stripe_price_id,
    currency: 'usd',
    qualifyingAmountMinorUnits: 100,
    refundCapMinorUnits: 100,
    winningSourceKind: 'direct',
    periodStartedAt: now,
    periodEndsAt: now,
    collisionAt: now,
  })
  return { originatingInvoiceId, subscriptionId }
}
