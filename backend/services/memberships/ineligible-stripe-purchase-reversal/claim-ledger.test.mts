import {
  assertReversalClaimLeavesProviderContextUnlockedForTest,
  claimTestIneligiblePurchaseReversalOperations,
  reconcileTestRefundBalance,
} from '@voucha/test-helpers/membership-reversal-case-fixtures'
import { randomUUID } from 'node:crypto'
import onError from '@modules/on-error'
import { sentryCaptureExceptionMock } from '../../../test-helpers/vitest.setup.sentry-mock.mts'
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
  failIneligiblePurchaseReversals,
  markIneligiblePurchaseReversalCompleted,
  recordIneligiblePurchaseReversalProviderRefund,
} from '../ineligible-stripe-purchase-reversal-execution.mts'
import { claimPersistedIneligiblePurchaseReversalCase } from './claim-ledger.mts'

describe('persisted purchase reversal case lookup', () => {
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
    const incomingSku = await createTestSku({
      plan: 'plus',
      provider_application_id: `reversal-claim-${randomUUID()}`,
    })
    const subscriptionId = `sub_family_proration_${randomUUID()}`
    const options = {
      effectiveAt: periodStartedAt,
      expiresAt: periodEndsAt,
      originatingInvoiceId: `in_family_proration_${randomUUID()}`,
      providerApplicationId: incomingSku.provider_application_id,
      providerEnvironment: 'production' as const,
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
    const snapshot = {
      currency: target.currency,
      qualifyingAmountMinorUnits: 1_000,
      refundCapMinorUnits: 500,
      winningSourceKind: 'family' as const,
      periodStartedAt,
      periodEndsAt,
      collisionAt,
    }
    const initial = (await claimTestIneligiblePurchaseReversalOperations(
      options,
      [target],
      snapshot,
    ))!
    await assertReversalClaimLeavesProviderContextUnlockedForTest({
      originatingInvoiceId: options.originatingInvoiceId,
      providerApplicationId: incomingSku.provider_application_id,
      providerEnvironment: options.providerEnvironment,
      subscriptionId,
    })
    await Promise.all(
      [initial.cancellation!, initial.reversals[0]!].map(operation =>
        failIneligiblePurchaseReversals([operation], new Error('retry after provider timeout')),
      ),
    )

    const retried = (await claimTestIneligiblePurchaseReversalOperations(
      options,
      [target],
      snapshot,
    ))!.reversals[0]!

    expect(retried.target.amountMinorUnits).toBe(500)
    await expect(
      getTestIneligiblePurchaseReversal(subscriptionId, 'production'),
    ).resolves.toMatchObject({ amount_minor_units: '500' })
  })

  it('returns an existing completed receipt without reclaiming its execution lease', async () => {
    const { options, snapshot, target } = await createCompletedReceiptTestCase()
    const initial = (await claimTestIneligiblePurchaseReversalOperations(
      options,
      [target],
      snapshot,
    ))!
    await markIneligiblePurchaseReversalCompleted(initial.cancellation!)
    await completeIneligiblePurchaseReversal(initial.reversals[0]!, {
      amountMinorUnits: 900,
      providerRefundId: `re_completed_${randomUUID()}`,
    })

    await expect(
      claimTestIneligiblePurchaseReversalOperations(options, [target], snapshot),
    ).resolves.toEqual(
      expect.objectContaining({
        reversals: [
          expect.objectContaining({
            completed: true,
            leaseToken: null,
            hasReceipt: true,
            id: initial.reversals[0]!.id,
            target: expect.objectContaining({ amountMinorUnits: 900 }),
          }),
        ],
      }),
    )
  })
  it('rolls back completion when the saved provider refund exceeds the reconciled balance', async () => {
    const { options, target, snapshot } = await createCompletedReceiptTestCase()
    const initial = await claimTestIneligiblePurchaseReversalOperations(options, [target], snapshot)
    const first = initial.reversals[0]!
    const { amountMinorUnits } = first.target
    const providerRefundId = `re_conflicted_${randomUUID()}`
    await markIneligiblePurchaseReversalCompleted(initial.cancellation!)
    await recordIneligiblePurchaseReversalProviderRefund(first, providerRefundId)
    await failIneligiblePurchaseReversals([first], new Error('provider timeout'))
    await expect(reconcileTestRefundBalance({ id: first.id, amountMinorUnits })).resolves.toBe(
      amountMinorUnits - 1,
    )
    const claim = await claimPersistedIneligiblePurchaseReversalCase(options, [target])
    const reversal = claim!.reversals[0]!

    const failure = await completeIneligiblePurchaseReversal(reversal, {
      amountMinorUnits,
      providerRefundId,
    }).catch((err: unknown) => err)
    if (!(failure instanceof Error)) throw new Error('Expected refund completion to reject')
    expect(failure).not.toHaveProperty('status')
    expect(failure).not.toHaveProperty('statusCode')
    onError(failure)
    expect(sentryCaptureExceptionMock).toHaveBeenCalledWith(failure, expect.any(Object))
    await expect(
      getTestIneligiblePurchaseReversal(options.subscriptionId, options.providerEnvironment),
    ).resolves.toMatchObject({
      amount_minor_units: String(amountMinorUnits - 1),
      receipt_amount_minor_units: null,
      completed_at: null,
      provider_refund_id: providerRefundId,
    })
  })

  it('keeps a completed receipt when a pending reconciliation has an older balance', async () => {
    const { options, reversal } = await reclaimFailedReceiptTestCase()
    const { amountMinorUnits } = reversal.target
    const providerRefundId = `re_completion_won_${randomUUID()}`

    await expect(
      reconcileTestRefundBalance({ id: reversal.id, amountMinorUnits }, () =>
        completeIneligiblePurchaseReversal(reversal, { amountMinorUnits, providerRefundId }),
      ),
    ).resolves.toBe(amountMinorUnits)
    await expect(
      getTestIneligiblePurchaseReversal(options.subscriptionId, options.providerEnvironment),
    ).resolves.toMatchObject({
      amount_minor_units: String(amountMinorUnits),
      receipt_amount_minor_units: String(amountMinorUnits),
      completed_at: expect.any(Date),
      provider_refund_id: providerRefundId,
    })
  })
})

async function createCompletedReceiptTestCase() {
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
    effectiveAt: undefined,
    expiresAt: undefined,
    originatingInvoiceId: `in_completed_${randomUUID()}`,
    providerEnvironment: 'production' as const,
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
  return { options, snapshot, target }
}

async function reclaimFailedReceiptTestCase() {
  const { options, target, snapshot } = await createCompletedReceiptTestCase()
  const initial = await claimTestIneligiblePurchaseReversalOperations(options, [target], snapshot)
  await markIneligiblePurchaseReversalCompleted(initial.cancellation!)
  await failIneligiblePurchaseReversals([initial.reversals[0]!], new Error('provider timeout'))
  const claim = await claimPersistedIneligiblePurchaseReversalCase(options, [target])
  const reversal = claim!.reversals[0]!
  return { options, reversal }
}
