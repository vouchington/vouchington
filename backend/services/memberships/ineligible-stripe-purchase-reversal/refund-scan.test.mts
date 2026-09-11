import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestFamilyMembership, createTestSku, createTestUser } from '@voucha/test-helpers'
import { claimIneligiblePurchaseReversals } from '../ineligible-stripe-purchase-reversal/claim-ledger.mts'
import { getIneligiblePurchaseReversalCase } from './case-read.mts'
import {
  createStripeRefundScanCallBudget,
  getDurableStripeRefundHistory,
  StripeRefundScanContinuationError,
  wasSucceededStripeRefundObserved,
} from './refund-scan.mts'

describe('durable Stripe refund scan', () => {
  it('persists every successful page before accepting a stable first-page verification', async () => {
    const fixture = await createRefundScanCase()
    const calls: Array<string | undefined> = []
    const result = await getDurableStripeRefundHistory({
      reversalCaseId: fixture.reversalCaseId,
      target: fixture.target,
      callBudget: createStripeRefundScanCallBudget(3),
      listRefundsForPaymentPage: async options => {
        calls.push(options.startingAfter)
        if (!options.startingAfter)
          return {
            refunds: [
              { amount: 700, currency: 'usd', id: fixture.firstRefundId, status: 'succeeded' },
            ],
            hasMore: true,
            nextCursor: fixture.firstRefundId,
          }
        return {
          refunds: [
            { amount: 300, currency: 'usd', id: fixture.secondRefundId, status: 'succeeded' },
          ],
          hasMore: false,
          nextCursor: undefined,
        }
      },
    })

    expect(result).toEqual({ alreadyRefundedMinorUnits: 1_000, refundDeferred: false })
    await expect(
      getDurableStripeRefundHistory({
        reversalCaseId: fixture.reversalCaseId,
        target: fixture.target,
        callBudget: createStripeRefundScanCallBudget(1),
        listRefundsForPaymentPage: async options => {
          calls.push(options.startingAfter)
          return {
            refunds: [
              { amount: 700, currency: 'usd', id: fixture.firstRefundId, status: 'succeeded' },
            ],
            hasMore: true,
            nextCursor: fixture.firstRefundId,
          }
        },
      }),
    ).resolves.toEqual({ alreadyRefundedMinorUnits: 1_000, refundDeferred: false })
    expect(calls).toEqual([undefined, fixture.firstRefundId, undefined, undefined])
    await expect(
      wasSucceededStripeRefundObserved({
        reversalCaseId: fixture.reversalCaseId,
        target: fixture.target,
        stripeRefundId: fixture.secondRefundId,
      }),
    ).resolves.toBe(true)
  })

  it('throws continuation before an unstable scan can skip its next provider page', async () => {
    const fixture = await createRefundScanCase()
    const listRefundsForPaymentPage = async (options: { startingAfter?: string }) => {
      if (!options.startingAfter)
        return {
          refunds: [
            { amount: 600, currency: 'usd', id: fixture.firstRefundId, status: 'succeeded' },
          ],
          hasMore: true,
          nextCursor: fixture.firstRefundId,
        }
      return {
        refunds: [
          { amount: 400, currency: 'usd', id: fixture.secondRefundId, status: 'succeeded' },
        ],
        hasMore: false,
        nextCursor: undefined,
      }
    }

    await expect(
      getDurableStripeRefundHistory({
        reversalCaseId: fixture.reversalCaseId,
        target: fixture.target,
        callBudget: createStripeRefundScanCallBudget(1),
        listRefundsForPaymentPage,
      }),
    ).rejects.toBeInstanceOf(StripeRefundScanContinuationError)

    await expect(
      getDurableStripeRefundHistory({
        reversalCaseId: fixture.reversalCaseId,
        target: fixture.target,
        callBudget: createStripeRefundScanCallBudget(2),
        listRefundsForPaymentPage,
      }),
    ).resolves.toEqual({ alreadyRefundedMinorUnits: 1_000, refundDeferred: false })
  })

  it('resumes from the committed cursor after a provider failure', async () => {
    const fixture = await createRefundScanCase()
    const calls: Array<string | undefined> = []
    let failSecondPage = true
    const listRefundsForPaymentPage = async (options: { startingAfter?: string }) => {
      calls.push(options.startingAfter)
      if (!options.startingAfter)
        return {
          refunds: [
            { amount: 600, currency: 'usd', id: fixture.firstRefundId, status: 'succeeded' },
          ],
          hasMore: true,
          nextCursor: fixture.firstRefundId,
        }
      if (failSecondPage) {
        failSecondPage = false
        throw new Error('Stripe unavailable')
      }
      return {
        refunds: [
          { amount: 400, currency: 'usd', id: fixture.secondRefundId, status: 'succeeded' },
        ],
        hasMore: false,
        nextCursor: undefined,
      }
    }

    await expect(
      getDurableStripeRefundHistory({
        reversalCaseId: fixture.reversalCaseId,
        target: fixture.target,
        callBudget: createStripeRefundScanCallBudget(2),
        listRefundsForPaymentPage,
      }),
    ).rejects.toThrow('Stripe unavailable')
    await expect(
      getDurableStripeRefundHistory({
        reversalCaseId: fixture.reversalCaseId,
        target: fixture.target,
        callBudget: createStripeRefundScanCallBudget(2),
        listRefundsForPaymentPage,
      }),
    ).resolves.toEqual({ alreadyRefundedMinorUnits: 1_000, refundDeferred: false })
    expect(calls).toEqual([undefined, fixture.firstRefundId, fixture.firstRefundId, undefined])
  })

  it('does not defer a new terminal head for a pending refund from the prior generation', async () => {
    const fixture = await createRefundScanCase()
    const newHeadRefundId = `re_refund_scan_head_${randomUUID()}`
    let call = 0

    await expect(
      getDurableStripeRefundHistory({
        reversalCaseId: fixture.reversalCaseId,
        target: fixture.target,
        callBudget: createStripeRefundScanCallBudget(3),
        listRefundsForPaymentPage: async () => {
          call += 1
          const refund =
            call === 1
              ? { amount: 500, currency: 'usd', id: fixture.firstRefundId, status: 'pending' }
              : { amount: 400, currency: 'usd', id: newHeadRefundId, status: 'succeeded' }
          return { refunds: [refund], hasMore: false, nextCursor: undefined }
        },
      }),
    ).resolves.toEqual({ alreadyRefundedMinorUnits: 400, refundDeferred: false })
    expect(call).toBe(3)
  })

  it('returns deferred and resets a terminal pending scan for a later rescan', async () => {
    const fixture = await createRefundScanCase()
    const calls: Array<string | undefined> = []
    const listRefundsForPaymentPage = async (options: { startingAfter?: string }) => {
      calls.push(options.startingAfter)
      return {
        refunds: [{ amount: 500, currency: 'usd', id: fixture.firstRefundId, status: 'pending' }],
        hasMore: false,
        nextCursor: undefined,
      }
    }

    await expect(
      getDurableStripeRefundHistory({
        reversalCaseId: fixture.reversalCaseId,
        target: fixture.target,
        callBudget: createStripeRefundScanCallBudget(2),
        listRefundsForPaymentPage,
      }),
    ).resolves.toEqual({ alreadyRefundedMinorUnits: 0, refundDeferred: true })
    await expect(
      getDurableStripeRefundHistory({
        reversalCaseId: fixture.reversalCaseId,
        target: fixture.target,
        callBudget: createStripeRefundScanCallBudget(2),
        listRefundsForPaymentPage,
      }),
    ).resolves.toEqual({ alreadyRefundedMinorUnits: 0, refundDeferred: true })
    expect(calls).toEqual([undefined, undefined, undefined, undefined])
  })

  it('shares one provider-call budget across payment targets', async () => {
    const fixture = await createRefundScanCase()
    const secondTarget = {
      ...fixture.target,
      chargeId: `ch_refund_scan_second_${randomUUID()}`,
    }
    const callBudget = createStripeRefundScanCallBudget(3)
    let calls = 0
    const listRefundsForPaymentPage = async () => {
      calls += 1
      return { refunds: [], hasMore: false, nextCursor: undefined }
    }

    await expect(
      getDurableStripeRefundHistory({
        reversalCaseId: fixture.reversalCaseId,
        target: fixture.target,
        callBudget,
        listRefundsForPaymentPage,
      }),
    ).resolves.toEqual({ alreadyRefundedMinorUnits: 0, refundDeferred: false })
    await expect(
      getDurableStripeRefundHistory({
        reversalCaseId: fixture.reversalCaseId,
        target: secondTarget,
        callBudget,
        listRefundsForPaymentPage,
      }),
    ).rejects.toBeInstanceOf(StripeRefundScanContinuationError)
    expect(calls).toBe(3)
  })
})

async function createRefundScanCase() {
  const user = await createTestUser()
  const familySku = await createTestSku({ plan: 'pro' })
  const incomingSku = await createTestSku({ plan: 'plus' })
  const invoiceId = `in_refund_scan_${randomUUID()}`
  const subscriptionId = `sub_refund_scan_${randomUUID()}`
  await createTestFamilyMembership({
    applicationId: familySku.provider_application_id,
    effectiveAt: new Date(Date.now() - 60_000),
    expiresAt: new Date(Date.now() + 60_000),
    membershipProductId: familySku.id,
    membershipProviderProductId: familySku.membership_provider_product_id,
    userId: user.id,
  })
  const target = {
    chargeId: `ch_refund_scan_${randomUUID()}`,
    currency: 'usd',
    invoiceId,
    paymentIntentId: null,
  }
  await claimIneligiblePurchaseReversals(
    {
      customerId: `cus_refund_scan_${randomUUID()}`,
      effectiveAt: new Date(Date.now() - 30_000),
      expiresAt: new Date(Date.now() + 30_000),
      incomingPlan: 'plus',
      incomingStatus: 'active',
      originatingInvoiceId: invoiceId,
      providerEnvironment: 'test',
      sku: incomingSku,
      stripePriceId: incomingSku.stripe_price_id,
      subscriptionId,
      userId: user.id,
    },
    [{ ...target, amountMinorUnits: 1_000, qualifyingAmountMinorUnits: 1_000 }],
    { currency: 'usd', qualifyingAmountMinorUnits: 1_000 },
  )
  const reversalCase = await getIneligiblePurchaseReversalCase({
    originatingInvoiceId: invoiceId,
    providerEnvironment: 'test',
  })
  if (!reversalCase) throw new Error('Could not create a refund scan reversal case')
  return {
    firstRefundId: `re_refund_scan_first_${randomUUID()}`,
    reversalCaseId: reversalCase.id,
    secondRefundId: `re_refund_scan_second_${randomUUID()}`,
    target,
  }
}
