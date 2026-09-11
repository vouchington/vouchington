import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestFamilyMembership,
  createTestSku,
  createTestUser,
  getTestIneligiblePurchaseReversal,
} from '@voucha/test-helpers'
import { createMembership } from '../create.mts'
import {
  completeIneligiblePurchaseReversal,
  failIneligiblePurchaseReversal,
  markIneligiblePurchaseReversalCompleted,
} from '../ineligible-stripe-purchase-reversal-execution.mts'
import {
  claimIneligiblePurchaseReversals,
  claimPersistedIneligiblePurchaseReversalCase,
} from './claim-ledger.mts'

describe('claimIneligiblePurchaseReversals no-op cases', () => {
  it('does not create operations when the immutable case does not exist', async () => {
    await expect(
      claimPersistedIneligiblePurchaseReversalCase(
        {
          originatingInvoiceId: `in_missing_case_${randomUUID()}`,
          providerEnvironment: 'production',
          subscriptionId: `sub_missing_case_${randomUUID()}`,
        },
        [],
      ),
    ).resolves.toBeNull()
  })

  it('does not create operations without an entitlement collision', async () => {
    const user = await createTestUser()
    const sku = await createTestSku({ plan: 'pro' })

    await expect(
      claimIneligiblePurchaseReversals(
        {
          customerId: `cus_claim_none_${randomUUID()}`,
          effectiveAt: undefined,
          expiresAt: undefined,
          incomingPlan: 'pro',
          incomingStatus: 'active',
          originatingInvoiceId: `in_claim_none_${randomUUID()}`,
          providerEnvironment: 'production',
          sku,
          stripePriceId: sku.stripe_price_id,
          subscriptionId: `sub_claim_none_${randomUUID()}`,
          userId: user.id,
        },
        [],
        { currency: 'usd', qualifyingAmountMinorUnits: 0 },
      ),
    ).resolves.toBeNull()
  })

  it('returns no operations when the direct purchase already converged', async () => {
    const user = await createTestUser()
    const sku = await createTestSku({ plan: 'pro' })
    const subscriptionId = `sub_claim_converged_${randomUUID()}`
    await createMembership({
      userId: user.id,
      plan: 'pro',
      skuId: sku.id,
      stripeSubscriptionId: subscriptionId,
      providerEnvironment: 'production',
    })

    await expect(
      claimIneligiblePurchaseReversals(
        {
          customerId: `cus_claim_converged_${randomUUID()}`,
          effectiveAt: undefined,
          expiresAt: undefined,
          incomingPlan: 'pro',
          incomingStatus: 'active',
          originatingInvoiceId: `in_claim_converged_${randomUUID()}`,
          providerEnvironment: 'production',
          sku,
          stripePriceId: sku.stripe_price_id,
          subscriptionId,
          userId: user.id,
        },
        [],
        { currency: 'usd', qualifyingAmountMinorUnits: 0 },
      ),
    ).resolves.toEqual({ cancellation: null, reversals: [] })
  })
})

describe('family collision reversal ledger', () => {
  it('does not recompute the authoritative family collision snapshot on retry', async () => {
    const user = await createTestUser()
    const familySku = await createTestSku({
      plan: 'plus',
      provider_application_id: `family-proration-${randomUUID()}`,
    })
    const now = Date.now()
    const periodStartedAt = new Date(now - 3 * 60 * 60 * 1_000)
    const periodEndsAt = new Date(now + 60 * 60 * 1_000)
    const collisionAt = new Date(now - 60 * 60 * 1_000)
    await createTestFamilyMembership({
      applicationId: familySku.provider_application_id,
      effectiveAt: collisionAt,
      expiresAt: new Date(now + 365 * 24 * 60 * 60 * 1_000),
      membershipProductId: familySku.id,
      membershipProviderProductId: familySku.membership_provider_product_id,
      userId: user.id,
    })
    const incomingSku = await createTestSku({ plan: 'plus' })
    const subscriptionId = `sub_family_proration_${randomUUID()}`
    const options = {
      customerId: `cus_family_proration_${randomUUID()}`,
      effectiveAt: periodStartedAt,
      expiresAt: periodEndsAt,
      incomingPlan: 'plus' as const,
      incomingStatus: 'active' as const,
      originatingInvoiceId: `in_family_proration_${randomUUID()}`,
      providerEnvironment: 'production' as const,
      sku: incomingSku,
      stripePriceId: incomingSku.stripe_price_id,
      subscriptionId,
      userId: user.id,
    }
    const target = {
      amountMinorUnits: 1_000,
      chargeId: `ch_family_proration_${randomUUID()}`,
      currency: 'usd',
      invoiceId: options.originatingInvoiceId,
      paymentIntentId: null,
      qualifyingAmountMinorUnits: 1_000,
    }
    const snapshot = { currency: target.currency, qualifyingAmountMinorUnits: 1_000 }
    const initial = (await claimIneligiblePurchaseReversals(options, [target], snapshot))!
    await Promise.all(
      [initial.cancellation!, initial.reversals[0]!].map(operation =>
        failIneligiblePurchaseReversal(operation, new Error('retry after provider timeout')),
      ),
    )

    const retried = (await claimIneligiblePurchaseReversals(options, [target], snapshot))!
      .reversals[0]!

    expect(retried.target.amountMinorUnits).toBe(500)
    await expect(
      getTestIneligiblePurchaseReversal(subscriptionId, 'production'),
    ).resolves.toMatchObject({ amount_minor_units: '500' })
  })

  it('returns an existing completed receipt without reclaiming its execution lease', async () => {
    const user = await createTestUser()
    const currentSku = await createTestSku({ plan: 'plus' })
    await createMembership({
      userId: user.id,
      plan: 'plus',
      skuId: currentSku.id,
      stripeSubscriptionId: `sub_completed_current_${randomUUID()}`,
      providerEnvironment: 'production',
    })
    const sku = await createTestSku({ plan: 'pro' })
    const options = {
      customerId: `cus_completed_${randomUUID()}`,
      effectiveAt: undefined,
      expiresAt: undefined,
      incomingPlan: 'pro' as const,
      incomingStatus: 'active' as const,
      originatingInvoiceId: `in_completed_${randomUUID()}`,
      providerEnvironment: 'production' as const,
      sku,
      stripePriceId: sku.stripe_price_id,
      subscriptionId: `sub_completed_${randomUUID()}`,
      userId: user.id,
    }
    const target = {
      amountMinorUnits: 900,
      chargeId: `ch_completed_${randomUUID()}`,
      currency: 'usd',
      invoiceId: options.originatingInvoiceId,
      paymentIntentId: null,
      qualifyingAmountMinorUnits: 900,
    }
    const snapshot = { currency: target.currency, qualifyingAmountMinorUnits: 900 }
    const initial = (await claimIneligiblePurchaseReversals(options, [target], snapshot))!
    await markIneligiblePurchaseReversalCompleted(initial.cancellation!)
    await completeIneligiblePurchaseReversal(initial.reversals[0]!, {
      amountMinorUnits: 900,
      providerRefundId: `re_completed_${randomUUID()}`,
    })

    await expect(claimIneligiblePurchaseReversals(options, [target], snapshot)).resolves.toEqual(
      expect.objectContaining({
        reversals: [
          expect.objectContaining({
            completed: true,
            executionClaimToken: null,
            hasReceipt: true,
            id: initial.reversals[0]!.id,
            target: expect.objectContaining({ amountMinorUnits: 900 }),
          }),
        ],
      }),
    )
  })
})
