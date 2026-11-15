import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createTestSku, createTestUser } from '@voucha/test-helpers'
import { createTestRetainedMembershipIdentity } from '@voucha/test-helpers/entities/retained-identities'
import { createTestStripeRefundRejection } from '@voucha/test-helpers/stripe-refund-rejection'
import { getRefundAttemptSnapshotForTest } from '@voucha/test-helpers/entities/membership-refund-reconciliation-state'
import { claimTestIneligiblePurchaseReversalOperations } from '@voucha/test-helpers/membership-reversal-case-fixtures'
import { createMembership } from './create-membership.mts'
import { createOrRetrieveIneligiblePurchaseReversalRefund } from './ineligible-stripe-purchase-reversal-provider.mts'
import { failIneligiblePurchaseReversals } from './ineligible-stripe-purchase-reversal-execution.mts'
import { getIneligiblePurchaseReversalCase } from './ineligible-stripe-purchase-reversal/case-read.mts'
import { getLatestRefundReconciliationAttempt } from './refund-reconciliation/ledger.mts'
import {
  listRefundableChargesForSubscription,
  type MembershipStripeOperations,
} from './refund-stripe-operations.mts'
import { recordMembershipRefundEvent } from './refunds/index.mts'

describe('automatic refund requests after an external partial refund', () => {
  it.each([
    { outcome: 'confirmed rejection', rejected: true, expectedAmount: 600 },
    { outcome: 'unknown execution', rejected: false, expectedAmount: 1000 },
  ])('preserves request identity after $outcome', async ({ rejected, expectedAmount }) => {
    const user = await createTestUser()
    const currentSku = await createTestSku({ plan: 'plus' })
    await createMembership({
      userId: user.id,
      plan: 'plus',
      skuId: currentSku.id,
      stripeSubscriptionId: `sub-current-${randomUUID()}`,
      providerEnvironment: 'production',
      providerApplicationId: currentSku.provider_application_id,
    })
    const sku = await createTestSku({ plan: 'pro' })
    const options = {
      userId: user.id,
      originatingInvoiceId: `in-rejected-balance-${randomUUID()}`,
      providerApplicationId: sku.provider_application_id,
      providerEnvironment: 'production' as const,
      stripePriceId: sku.stripe_price_id,
      subscriptionId: `sub-rejected-balance-${randomUUID()}`,
    }
    const target = {
      amountMinorUnits: 1000,
      qualifyingAmountMinorUnits: 1000,
      chargeId: `ch-rejected-balance-${randomUUID()}`,
      paymentIntentId: null,
      currency: 'usd',
      invoiceId: options.originatingInvoiceId,
    }
    const snapshot = { currency: 'usd', qualifyingAmountMinorUnits: 1000 }
    const initial = await claimTestIneligiblePurchaseReversalOperations(options, [target], snapshot)
    const failure = rejected
      ? await createTestStripeRefundRejection()
      : new Error('Unknown provider execution')
    const createRefund = vi
      .fn<Parameters<typeof createOrRetrieveIneligiblePurchaseReversalRefund>[1]['createRefund']>()
      .mockRejectedValueOnce(failure)
      .mockImplementation(
        async payload =>
          ({
            id: `re-rejected-balance-${randomUUID()}`,
            amount: payload.amountMinorUnits,
            currency: 'usd',
            status: 'pending',
          }) as never,
      )
    await expect(
      createOrRetrieveIneligiblePurchaseReversalRefund(initial.reversals[0]!, { createRefund }),
    ).rejects.toBe(failure)
    const original = await getLatestRefundReconciliationAttempt(initial.reversals[0]!.id)
    if (!original) throw new Error('Expected the original durable refund request')
    const originalSnapshot = await getRefundAttemptSnapshotForTest(original.id)
    await failIneligiblePurchaseReversals(
      [...initial.reversals, ...(initial.cancellation ? [initial.cancellation] : [])],
      failure,
    )

    const reversalCase = await getIneligiblePurchaseReversalCase(options)
    if (!reversalCase) throw new Error('Expected the durable automatic reversal case')
    await recordMembershipRefundEvent({
      membershipId: await createTestRetainedMembershipIdentity(),
      membershipSourceId: reversalCase.membershipSourceId,
      userId: user.id,
      stripeRefundId: `re-dashboard-${randomUUID()}`,
      stripeChargeId: target.chargeId,
      stripePaymentIntentId: null,
      amount: { amount: 400, currency: 'usd' },
      stripeEventId: `evt-dashboard-${randomUUID()}`,
      providerApplicationId: options.providerApplicationId,
      providerEnvironment: 'production',
    })
    const listSubscriptionInvoices = vi
      .fn<MembershipStripeOperations['listSubscriptionInvoices']>()
      .mockResolvedValue([
        {
          status: 'paid',
          id: target.invoiceId,
          amountPaid: 1000,
          currency: 'usd',
          created: 1_700_000_000,
          description: null,
          payments: [
            {
              amountPaid: 1000,
              payment: { type: 'charge', chargeId: target.chargeId, paymentIntentId: null },
            },
          ],
        },
      ])
    const [charge] = await listRefundableChargesForSubscription(options.subscriptionId, {
      listSubscriptionInvoices,
    })
    expect(charge?.amount_refunded.amount).toBe(400)
    const resumed = await claimTestIneligiblePurchaseReversalOperations(
      options,
      [
        {
          ...target,
          amountMinorUnits: 600,
          providerObservedAmountMinorUnits: 600,
          externallySatisfiedMinorUnits: charge!.amount_refunded.amount,
        },
      ],
      snapshot,
    )
    expect(resumed.reversals[0]).toMatchObject({
      id: initial.reversals[0]!.id,
      target: { amountMinorUnits: 600 },
    })
    await createOrRetrieveIneligiblePurchaseReversalRefund(resumed.reversals[0]!, { createRefund })
    expect(createRefund).toHaveBeenCalledTimes(2)
    expect(createRefund.mock.calls.map(([payload]) => payload.amountMinorUnits)).toEqual([
      1000,
      expectedAmount,
    ])
    const latest = await getLatestRefundReconciliationAttempt(initial.reversals[0]!.id)
    expect(latest).toMatchObject({
      amount: { amount: expectedAmount, currency: 'usd' },
      providerRequestOriginalAttemptId: null,
    })
    expect(createRefund.mock.calls[1]![0].idempotencyKey).toBe(latest!.providerIdempotencyKey)
    expect(latest!.providerIdempotencyKey === original.providerIdempotencyKey).toBe(!rejected)
    expect(latest!.id === original.id).toBe(!rejected)
    await expect(getRefundAttemptSnapshotForTest(original.id)).resolves.toEqual(originalSnapshot)
  })
})
