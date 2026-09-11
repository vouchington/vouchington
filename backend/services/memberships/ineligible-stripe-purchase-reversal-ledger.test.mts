import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  createTestSku,
  createTestUser,
  getTestIneligiblePurchaseReversal,
} from '@voucha/test-helpers'
import { createMembership } from './create.mts'
import { failIneligiblePurchaseReversal } from './ineligible-stripe-purchase-reversal-execution.mts'
import { createIneligiblePurchaseReversalRetryIdempotencyKey } from './ineligible-stripe-purchase-reversal-idempotency.mts'
import {
  claimIneligiblePurchaseReversals,
  claimPersistedIneligiblePurchaseReversalCase,
} from './ineligible-stripe-purchase-reversal/claim-ledger.mts'
import {
  createOrRetrieveIneligiblePurchaseReversalRefund,
  type IneligiblePurchaseReversalRefundOperations,
} from './ineligible-stripe-purchase-reversal-provider.mts'
import { reconcileFailedIneligiblePurchaseReversal } from './ineligible-stripe-purchase-reversal-reconcile.mts'

describe('ineligible Stripe purchase reversal ledger', () => {
  it('keeps identical Stripe subscription IDs isolated by provider application', async () => {
    const { options, target } = await createIneligiblePurchaseReversalFixture()
    const applicationA = 'voucha-ios'
    const applicationB = 'voucha-android'
    const [first, second] = await Promise.all([
      claimIneligiblePurchaseReversals(
        { ...options, providerApplicationId: applicationA },
        [target],
        caseSnapshot(target),
      ),
      claimIneligiblePurchaseReversals(
        { ...options, providerApplicationId: applicationB },
        [target],
        caseSnapshot(target),
      ),
    ])

    expect(first?.cancellation?.id).not.toBe(second?.cancellation?.id)
    expect(first?.reversals[0]?.id).not.toBe(second?.reversals[0]?.id)
  })

  it('claims the cancellation with its refund intents under the same locked disposition', async () => {
    const { options, target } = await createIneligiblePurchaseReversalFixture()

    const claimed = await claimIneligiblePurchaseReversals(options, [target], caseSnapshot(target))

    expect(claimed).toEqual(
      expect.objectContaining({
        cancellation: expect.objectContaining({ completed: false }),
        reversals: [
          expect.objectContaining({
            completed: false,
            target: expect.objectContaining(target),
          }),
        ],
      }),
    )
  })

  it('advances a known failed operation to the newly observed refundable remainder', async () => {
    const { options, target } = await createIneligiblePurchaseReversalFixture()
    const initial = (await claimIneligiblePurchaseReversals(
      options,
      [target],
      caseSnapshot(target),
    ))!
    await Promise.all(
      [initial.cancellation!, initial.reversals[0]!].map(operation =>
        failIneligiblePurchaseReversal(operation, new Error('Stripe rejected stale refund amount')),
      ),
    )

    const retried = (await claimIneligiblePurchaseReversals(
      options,
      [
        {
          ...target,
          amountMinorUnits: 600,
          externallySatisfiedMinorUnits: 400,
          providerObservedAmountMinorUnits: 600,
        },
      ],
      caseSnapshot(target),
    ))!.reversals[0]

    expect(retried).toMatchObject({ target: { amountMinorUnits: 600 } })
    await expect(
      getTestIneligiblePurchaseReversal(options.subscriptionId, options.providerEnvironment),
    ).resolves.toMatchObject({
      amount_minor_units: '600',
      qualifying_amount_minor_units: '1000',
    })
  })

  it('converges an ordinary retry when Stripe has fully refunded a response-loss operation', async () => {
    const { options, target } = await createIneligiblePurchaseReversalFixture()
    const initial = (await claimIneligiblePurchaseReversals(
      options,
      [target],
      caseSnapshot(target),
    ))!
    await Promise.all(
      [initial.cancellation!, initial.reversals[0]!].map(operation =>
        failIneligiblePurchaseReversal(operation, new Error('provider response was lost')),
      ),
    )

    const replay = (await claimIneligiblePurchaseReversals(
      options,
      [
        {
          ...target,
          amountMinorUnits: 0,
          externallySatisfiedMinorUnits: 1_000,
          providerObservedAmountMinorUnits: 0,
        },
      ],
      caseSnapshot(target),
    ))!.reversals[0]

    expect(replay).toMatchObject({ target: { amountMinorUnits: 0 } })
    await expect(
      getTestIneligiblePurchaseReversal(options.subscriptionId, options.providerEnvironment),
    ).resolves.toMatchObject({ amount_minor_units: '0', qualifying_amount_minor_units: '1000' })
  })

  it('reconciles a failed resume to an externally partially refunded positive remainder', async () => {
    const { options, target } = await createIneligiblePurchaseReversalFixture()
    const initial = (await claimIneligiblePurchaseReversals(
      options,
      [target],
      caseSnapshot(target),
    ))!
    await Promise.all(
      [initial.cancellation!, initial.reversals[0]!].map(operation =>
        failIneligiblePurchaseReversal(operation, new Error('Stripe refund is pending')),
      ),
    )

    const resumed = await claimPersistedIneligiblePurchaseReversalCase(options, [
      {
        ...target,
        amountMinorUnits: 600,
        externallySatisfiedMinorUnits: 400,
        providerObservedAmountMinorUnits: 600,
      },
    ])

    expect(resumed?.reversals).toEqual([
      expect.objectContaining({ target: expect.objectContaining({ amountMinorUnits: 600 }) }),
    ])
    await expect(
      getTestIneligiblePurchaseReversal(options.subscriptionId, options.providerEnvironment),
    ).resolves.toMatchObject({ amount_minor_units: '600', qualifying_amount_minor_units: '1000' })
  })

  it('rejects a resume whose persisted reversal target cannot be reconstructed', async () => {
    const { options, target } = await createIneligiblePurchaseReversalFixture()
    const initial = (await claimIneligiblePurchaseReversals(
      options,
      [target],
      caseSnapshot(target),
    ))!
    await Promise.all(
      [initial.cancellation!, initial.reversals[0]!].map(operation =>
        failIneligiblePurchaseReversal(operation, new Error('interrupted before response')),
      ),
    )

    await expect(claimPersistedIneligiblePurchaseReversalCase(options, [])).rejects.toThrow(
      'Could not reconstruct Stripe reversal target',
    )
  })

  it('requires a retrieval operation before it reuses a recorded provider refund', async () => {
    const { options, target } = await createIneligiblePurchaseReversalFixture()
    const reversal = (await claimIneligiblePurchaseReversals(
      options,
      [target],
      caseSnapshot(target),
    ))!.reversals[0]!
    const createRefund = vi.fn<IneligiblePurchaseReversalRefundOperations['createRefund']>()

    await expect(
      createOrRetrieveIneligiblePurchaseReversalRefund(
        { ...reversal, providerRefundId: `re_recorded_${randomUUID()}` },
        { createRefund },
      ),
    ).rejects.toThrow('requires a refund retrieval operation')
    expect(createRefund).not.toHaveBeenCalled()
  })

  it('retries a failed recorded provider refund with a derived idempotency key', async () => {
    const { options, target } = await createIneligiblePurchaseReversalFixture()
    const reversal = (await claimIneligiblePurchaseReversals(
      options,
      [target],
      caseSnapshot(target),
    ))!.reversals[0]!
    const previousRefundId = `re_failed_${randomUUID()}`
    const createRefund = vi
      .fn<IneligiblePurchaseReversalRefundOperations['createRefund']>()
      .mockResolvedValue({
        amount: target.amountMinorUnits,
        currency: target.currency,
        id: `re_retried_${randomUUID()}`,
        status: 'succeeded',
      } as never)
    const retrieveRefund = vi
      .fn<NonNullable<IneligiblePurchaseReversalRefundOperations['retrieveRefund']>>()
      .mockResolvedValue({ id: previousRefundId, status: 'failed' } as never)

    const refund = await createOrRetrieveIneligiblePurchaseReversalRefund(
      { ...reversal, providerRefundId: previousRefundId },
      { createRefund, retrieveRefund },
    )

    expect(retrieveRefund).toHaveBeenCalledWith(previousRefundId)
    expect(createRefund).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: createIneligiblePurchaseReversalRetryIdempotencyKey(previousRefundId),
      }),
    )
    await expect(
      getTestIneligiblePurchaseReversal(options.subscriptionId, options.providerEnvironment),
    ).resolves.toMatchObject({ provider_refund_id: refund.id })
  })

  it('rejects a missing refundable amount before it queries the operation ledger', async () => {
    await expect(
      reconcileFailedIneligiblePurchaseReversal(
        {
          failed: true,
          hasReceipt: false,
          id: `operation_missing_amount_${randomUUID()}`,
          remainingRefundableMinorUnits: null,
        },
        100,
        {
          providerRefundObservedSucceeded: false,
          query: undefined as never,
        },
      ),
    ).rejects.toThrow('is missing its refundable amount')
  })
})

async function createIneligiblePurchaseReversalFixture() {
  const user = await createTestUser()
  const currentSku = await createTestSku({ plan: 'plus' })
  await createMembership({
    userId: user.id,
    plan: 'plus',
    skuId: currentSku.id,
    stripeSubscriptionId: `sub_current_${randomUUID()}`,
    providerEnvironment: 'production',
  })
  const incomingSku = await createTestSku({ plan: 'pro' })
  const subscriptionId = `sub_ineligible_${randomUUID()}`
  const originatingInvoiceId = `in_ineligible_${randomUUID()}`
  return {
    options: {
      customerId: `cus_ineligible_${randomUUID()}`,
      effectiveAt: undefined,
      expiresAt: undefined,
      incomingPlan: 'pro' as const,
      incomingStatus: 'active' as const,
      originatingInvoiceId,
      providerEnvironment: 'production' as const,
      sku: incomingSku,
      stripePriceId: incomingSku.stripe_price_id,
      subscriptionId,
      userId: user.id,
    },
    target: {
      amountMinorUnits: 1_000,
      chargeId: `ch_ineligible_${randomUUID()}`,
      currency: 'usd',
      invoiceId: originatingInvoiceId,
      paymentIntentId: null,
      qualifyingAmountMinorUnits: 1_000,
    },
  }
}

function caseSnapshot(target: { currency: string; qualifyingAmountMinorUnits: number }) {
  return {
    currency: target.currency,
    qualifyingAmountMinorUnits: target.qualifyingAmountMinorUnits,
  }
}
