import { stripeLookupMaxPagesForTest } from '@voucha/test-helpers/stripe-pagination-limits'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as stripeClientModule from '@modules/stripe/client'
import { getStripeDisputeSettlementForPayment } from './disputes.mts'

function getStripeDisputePage(data: readonly unknown[], hasMore = false) {
  return { data, has_more: hasMore }
}

describe('Stripe disputes module', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('recognizes an open dispute on a charge', async () => {
    const list = vi
      .fn<VitestLooseMock>()
      .mockResolvedValue(getStripeDisputePage([{ status: 'needs_response' }]))
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue({
      disputes: { list },
    } as never)

    await expect(
      getStripeDisputeSettlementForPayment(
        {
          chargeId: 'ch_disputed',
          currency: 'usd',
          paymentIntentId: null,
        },
        stripeLookupMaxPagesForTest,
      ),
    ).resolves.toEqual({ lostDisputeAmountMinorUnits: 0, refundDeferred: true })
    expect(list).toHaveBeenCalledWith({ charge: 'ch_disputed', limit: 100 })
  })

  it('fully consumes every dispute page and keeps a mixed open and lost charge deferred', async () => {
    const list = vi
      .fn<VitestLooseMock>()
      .mockResolvedValueOnce(
        getStripeDisputePage(
          [{ amount: 400, currency: 'usd', id: 'dp_lost', status: 'lost' }],
          true,
        ),
      )
      .mockResolvedValueOnce(getStripeDisputePage([{ status: 'under_review' }]))
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue({
      disputes: { list },
    } as never)

    await expect(
      getStripeDisputeSettlementForPayment(
        {
          chargeId: 'ch_mixed',
          currency: 'usd',
          paymentIntentId: null,
        },
        stripeLookupMaxPagesForTest,
      ),
    ).resolves.toEqual({ lostDisputeAmountMinorUnits: 400, refundDeferred: true })
    expect(list).toHaveBeenNthCalledWith(1, { charge: 'ch_mixed', limit: 100 })
    expect(list).toHaveBeenNthCalledWith(2, {
      charge: 'ch_mixed',
      limit: 100,
      starting_after: 'dp_lost',
    })
  })

  it('forwards the dispute page cap', async () => {
    const list = vi
      .fn<VitestLooseMock>()
      .mockImplementation(async () =>
        getStripeDisputePage([{ id: `dp_${list.mock.calls.length}`, status: 'won' }], true),
      )
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue({
      disputes: { list },
    } as never)

    await expect(
      getStripeDisputeSettlementForPayment(
        {
          chargeId: 'ch_page_cap',
          currency: 'usd',
          paymentIntentId: null,
        },
        stripeLookupMaxPagesForTest,
      ),
    ).rejects.toThrow('Stripe dispute listing exceeded the page limit (10)')
    expect(list).toHaveBeenCalledTimes(10)
  })

  it('rejects a dispute lookup without a provider payment reference', async () => {
    await expect(
      getStripeDisputeSettlementForPayment(
        {
          chargeId: null,
          currency: 'usd',
          paymentIntentId: null,
        },
        stripeLookupMaxPagesForTest,
      ),
    ).rejects.toThrow('requires a charge or payment intent')
  })

  it('inspects a payment intent latest charge when no charge allocation is present', async () => {
    const retrieve = vi.fn<VitestLooseMock>().mockResolvedValue({
      latest_charge: { id: 'ch_payment_intent_dispute' },
    })
    const list = vi
      .fn<VitestLooseMock>()
      .mockResolvedValue(getStripeDisputePage([{ status: 'under_review' }]))
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue({
      disputes: { list },
      paymentIntents: { retrieve },
    } as never)

    await expect(
      getStripeDisputeSettlementForPayment(
        {
          chargeId: null,
          currency: 'usd',
          paymentIntentId: 'pi_disputed',
        },
        stripeLookupMaxPagesForTest,
      ),
    ).resolves.toEqual({ lostDisputeAmountMinorUnits: 0, refundDeferred: true })
    expect(retrieve).toHaveBeenCalledWith('pi_disputed', { expand: ['latest_charge'] })
    expect(list).toHaveBeenCalledWith({ charge: 'ch_payment_intent_dispute', limit: 100 })
  })
})
