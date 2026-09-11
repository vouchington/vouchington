import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestSku, createTestUser } from '@voucha/test-helpers'
import { createMembership } from '../create.mts'
import { claimIneligiblePurchaseReversals } from './claim-ledger.mts'
import { getIneligiblePurchaseReversalCase } from './case-read.mts'

describe('getIneligiblePurchaseReversalCase', () => {
  it('finds the immutable case from the originating invoice without a subscription payload', async () => {
    const user = await createTestUser()
    const currentSku = await createTestSku({ plan: 'plus' })
    await createMembership({
      userId: user.id,
      plan: 'plus',
      skuId: currentSku.id,
      stripeSubscriptionId: `sub_case_read_current_${randomUUID()}`,
      providerEnvironment: 'production',
    })
    const sku = await createTestSku({ plan: 'pro' })
    const subscriptionId = `sub_case_read_${randomUUID()}`
    const originatingInvoiceId = `in_case_read_${randomUUID()}`
    const target = {
      amountMinorUnits: 100,
      chargeId: `ch_case_read_${randomUUID()}`,
      currency: 'usd',
      invoiceId: originatingInvoiceId,
      paymentIntentId: null,
      qualifyingAmountMinorUnits: 100,
    }
    await claimIneligiblePurchaseReversals(
      {
        customerId: `cus_case_read_${randomUUID()}`,
        effectiveAt: undefined,
        expiresAt: undefined,
        incomingPlan: 'pro',
        incomingStatus: 'active',
        originatingInvoiceId,
        providerEnvironment: 'production',
        sku,
        stripePriceId: sku.stripe_price_id,
        subscriptionId,
        userId: user.id,
      },
      [target],
      { currency: target.currency, qualifyingAmountMinorUnits: target.qualifyingAmountMinorUnits },
    )

    await expect(
      getIneligiblePurchaseReversalCase({
        originatingInvoiceId,
        providerEnvironment: 'production',
      }),
    ).resolves.toMatchObject({ originatingInvoiceId, subscriptionId })
    await expect(
      getIneligiblePurchaseReversalCase({
        originatingInvoiceId,
        providerApplicationId: `other-app-${randomUUID()}`,
        providerEnvironment: 'production',
      }),
    ).resolves.toBeNull()
  })
})
