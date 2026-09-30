import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createRefundScanCase } from '../../../test-helpers/services/memberships/refund-scan-case.mts'
import { inspectStripeRefundPage } from './refund-scan-observations.mts'
import { createStripeRefundScanCallBudget, getDurableStripeRefundHistory } from './refund-scan.mts'

describe('durable Stripe refund scan ledger invariants', () => {
  it('rejects invalid scan budgets and ambiguous payment targets before provider I/O', async () => {
    expect(() => createStripeRefundScanCallBudget(-1)).toThrow(
      'call budget must be a non-negative safe integer',
    )
    const fixture = await createRefundScanCase()
    await expect(
      getDurableStripeRefundHistory({
        reversalCaseId: fixture.reversalCaseId,
        target: { ...fixture.target, paymentIntentId: `pi_refund_scan_${randomUUID()}` },
        callBudget: createStripeRefundScanCallBudget(),
        listRefundsForPaymentPage: async () => {
          throw new Error('provider should not be called')
        },
      }),
    ).rejects.toThrow('requires exactly one payment identifier')
  })

  it('rejects malformed provider observations before persisting a page', () => {
    expect(() =>
      inspectStripeRefundPage(
        {
          refunds: [{ amount: -1, currency: 'usd', id: 're_invalid_amount', status: 'succeeded' }],
          hasMore: false,
          nextCursor: undefined,
        },
        'usd',
      ),
    ).toThrow('amount must be a non-negative safe integer')
    expect(() =>
      inspectStripeRefundPage(
        {
          refunds: [{ amount: 1, currency: 'eur', id: 're_invalid_currency', status: 'succeeded' }],
          hasMore: false,
          nextCursor: undefined,
        },
        'usd',
      ),
    ).toThrow('currency eur did not match usd')
    expect(() =>
      inspectStripeRefundPage(
        {
          refunds: [
            { amount: 1, currency: 'usd', id: 're_duplicate', status: 'succeeded' },
            { amount: 1, currency: 'usd', id: 're_duplicate', status: 'succeeded' },
          ],
          hasMore: false,
          nextCursor: undefined,
        },
        'usd',
      ),
    ).toThrow('repeated a succeeded refund ID')
  })

  it('rejects a provider rewrite of an immutable succeeded refund observation', async () => {
    const fixture = await createRefundScanCase()
    const page = (amount: number) => ({
      refunds: [{ amount, currency: 'usd', id: fixture.firstRefundId, status: 'succeeded' }],
      hasMore: false,
      nextCursor: undefined,
    })
    await getDurableStripeRefundHistory({
      reversalCaseId: fixture.reversalCaseId,
      target: fixture.target,
      callBudget: createStripeRefundScanCallBudget(2),
      listRefundsForPaymentPage: async () => page(500),
    })

    await expect(
      getDurableStripeRefundHistory({
        reversalCaseId: fixture.reversalCaseId,
        target: fixture.target,
        callBudget: createStripeRefundScanCallBudget(1),
        listRefundsForPaymentPage: async () => page(600),
      }),
    ).rejects.toThrow('conflicts with its immutable persisted value')
  })

  it('rejects a persisted refund total outside JavaScript safe-integer range', async () => {
    const fixture = await createRefundScanCase()
    await expect(
      getDurableStripeRefundHistory({
        reversalCaseId: fixture.reversalCaseId,
        target: fixture.target,
        callBudget: createStripeRefundScanCallBudget(2),
        listRefundsForPaymentPage: async () => ({
          refunds: [
            {
              amount: Number.MAX_SAFE_INTEGER,
              currency: 'usd',
              id: fixture.firstRefundId,
              status: 'succeeded',
            },
            {
              amount: Number.MAX_SAFE_INTEGER,
              currency: 'usd',
              id: fixture.secondRefundId,
              status: 'succeeded',
            },
          ],
          hasMore: false,
          nextCursor: undefined,
        }),
      }),
    ).rejects.toThrow('Persisted Stripe refund total must be a non-negative safe integer')
  })
})
