import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestFamilyMembership, createTestSku, createTestUser } from '@voucha/test-helpers'
import { claimIneligiblePurchaseReversals } from '../ineligible-stripe-purchase-reversal/claim-ledger.mts'
import { getRefundableReversalTargets } from '../ineligible-stripe-purchase-reversal-targets.mts'
import { getIneligiblePurchaseReversalCase } from './case-read.mts'
import {
  completeStripeRefundScanCycle,
  getOrCreateStripeRefundScan,
  getOrCreateStripeRefundScanCycle,
} from './refund-scan-cycle-ledger.mts'
import { applyStripeRefundScanPage } from './refund-scan-ledger.mts'
import {
  createStripeRefundScanCallBudget,
  getDurableStripeRefundHistory,
  StripeRefundScanContinuationError,
  withStripeRefundScanCycle,
} from './refund-scan.mts'

describe('durable Stripe refund scan hardening', () => {
  it('allows concurrent workers to complete the same verified cycle', async () => {
    const fixture = await createRefundScanCase()
    const cycle = await getOrCreateStripeRefundScanCycle(fixture.reversalCaseId)

    await expect(
      Promise.all([completeStripeRefundScanCycle(cycle), completeStripeRefundScanCycle(cycle)]),
    ).resolves.toEqual([undefined, undefined])
  })

  it('refuses to complete a cycle with an unverified registered target', async () => {
    const fixture = await createRefundScanCase()
    const cycle = await getOrCreateStripeRefundScanCycle(fixture.reversalCaseId)
    await getOrCreateStripeRefundScan(cycle, fixture.target)

    await expect(completeStripeRefundScanCycle(cycle)).rejects.toThrow(
      'Stripe refund scan cycle has an incomplete registered target',
    )
  })

  it('rejects a scan cycle owned by another reversal case', async () => {
    const fixture = await createRefundScanCase()

    await expect(
      getDurableStripeRefundHistory({
        callBudget: createStripeRefundScanCallBudget(),
        listRefundsForPaymentPage: async () => ({
          refunds: [],
          hasMore: false,
          nextCursor: undefined,
        }),
        reversalCaseId: fixture.reversalCaseId,
        scanCycle: { generation: 1, reversalCaseId: randomUUID() },
        target: fixture.target,
      }),
    ).rejects.toThrow('Stripe refund scan cycle does not belong to the reversal case')
  })

  it('rejects a page committed for a stale cycle generation', async () => {
    const fixture = await createRefundScanCase()
    const cycle = await getOrCreateStripeRefundScanCycle(fixture.reversalCaseId)
    const scan = await getOrCreateStripeRefundScan(cycle, fixture.target)

    await expect(
      applyStripeRefundScanPage({
        cycle: { ...cycle, generation: cycle.generation + 1 },
        expected: scan,
        mode: 'first-page',
        page: { refunds: [], hasMore: false, nextCursor: undefined },
        target: fixture.target,
      }),
    ).resolves.toBe('stale')
  })

  it('freshly scans a pending target when the next verification cycle sees it succeed', async () => {
    const fixture = await createRefundScanCase()
    const reconcile = (status: 'pending' | 'succeeded') =>
      withStripeRefundScanCycle(fixture.reversalCaseId, scanCycle =>
        getDurableStripeRefundHistory({
          callBudget: createStripeRefundScanCallBudget(2),
          listRefundsForPaymentPage: async () => ({
            refunds: [{ amount: 500, currency: 'usd', id: fixture.firstRefundId, status }],
            hasMore: false,
            nextCursor: undefined,
          }),
          reversalCaseId: fixture.reversalCaseId,
          scanCycle,
          target: fixture.target,
        }),
      )

    await expect(reconcile('pending')).resolves.toEqual({
      alreadyRefundedMinorUnits: 0,
      refundDeferred: true,
    })
    await expect(reconcile('succeeded')).resolves.toEqual({
      alreadyRefundedMinorUnits: 500,
      refundDeferred: false,
    })
  })

  it('finishes more than ten lazily registered targets across retries, then re-verifies them in a new cycle', async () => {
    const fixture = await createRefundScanCase()
    const invoices = [
      {
        created: 1_893_456_000,
        currency: 'usd',
        id: fixture.target.invoiceId,
        payments: {
          data: Array.from({ length: 11 }, (_, index) => ({
            amount_paid: 100,
            payment: { type: 'charge' as const, charge: `ch_refund_scan_many_${index}` },
          })),
        },
        status: 'paid' as const,
      },
    ]
    const calls: string[] = []
    const reconcile = (budget: number) =>
      withStripeRefundScanCycle(fixture.reversalCaseId, async scanCycle => {
        const callBudget = createStripeRefundScanCallBudget(budget)
        return getRefundableReversalTargets(
          invoices,
          target =>
            getDurableStripeRefundHistory({
              callBudget,
              listRefundsForPaymentPage: async () => {
                calls.push(target.chargeId!)
                return { refunds: [], hasMore: false, nextCursor: undefined }
              },
              reversalCaseId: fixture.reversalCaseId,
              scanCycle,
              target,
            }),
          async () => ({ lostDisputeAmountMinorUnits: 0, refundDeferred: false }),
        )
      })

    await expect(reconcile(10)).rejects.toBeInstanceOf(StripeRefundScanContinuationError)
    await expect(reconcile(10)).rejects.toBeInstanceOf(StripeRefundScanContinuationError)
    await expect(reconcile(10)).resolves.toHaveLength(11)
    expect(new Set(calls)).toHaveLength(11)
    expect(calls).toHaveLength(22)
    await expect(reconcile(22)).resolves.toHaveLength(11)
    expect(calls).toHaveLength(33)
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
    target,
  }
}
