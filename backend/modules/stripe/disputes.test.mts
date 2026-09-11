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
      getStripeDisputeSettlementForPayment({
        chargeId: 'ch_disputed',
        currency: 'usd',
        paymentIntentId: null,
      }),
    ).resolves.toEqual({ lostDisputeAmountMinorUnits: 0, refundDeferred: true })
    expect(list).toHaveBeenCalledWith({ charge: 'ch_disputed', limit: 100 })
  })

  it('does not defer or satisfy a refund for a won dispute', async () => {
    const list = vi
      .fn<VitestLooseMock>()
      .mockResolvedValue(getStripeDisputePage([{ status: 'won' }]))
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue({
      disputes: { list },
    } as never)

    await expect(
      getStripeDisputeSettlementForPayment({
        chargeId: 'ch_closed',
        currency: 'usd',
        paymentIntentId: null,
      }),
    ).resolves.toEqual({ lostDisputeAmountMinorUnits: 0, refundDeferred: false })
  })

  it('counts a lost dispute as externally satisfied without deferring the refund', async () => {
    const list = vi
      .fn<VitestLooseMock>()
      .mockResolvedValue(getStripeDisputePage([{ amount: 700, currency: 'usd', status: 'lost' }]))
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue({
      disputes: { list },
    } as never)

    await expect(
      getStripeDisputeSettlementForPayment({
        chargeId: 'ch_lost',
        currency: 'usd',
        paymentIntentId: null,
      }),
    ).resolves.toEqual({ lostDisputeAmountMinorUnits: 700, refundDeferred: false })
  })

  it('does not treat warning-closed disputes as payments or open disputes', async () => {
    const list = vi
      .fn<VitestLooseMock>()
      .mockResolvedValue(getStripeDisputePage([{ amount: 700, status: 'warning_closed' }]))
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue({
      disputes: { list },
    } as never)

    await expect(
      getStripeDisputeSettlementForPayment({
        chargeId: 'ch_warning_closed',
        currency: 'usd',
        paymentIntentId: null,
      }),
    ).resolves.toEqual({ lostDisputeAmountMinorUnits: 0, refundDeferred: false })
  })

  it('treats a prevented dispute as terminal and non-satisfying', async () => {
    const list = vi
      .fn<VitestLooseMock>()
      .mockResolvedValue(getStripeDisputePage([{ amount: 700, status: 'prevented' }]))
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue({
      disputes: { list },
    } as never)

    await expect(
      getStripeDisputeSettlementForPayment({
        chargeId: 'ch_prevented',
        currency: 'usd',
        paymentIntentId: null,
      }),
    ).resolves.toEqual({ lostDisputeAmountMinorUnits: 0, refundDeferred: false })
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
      getStripeDisputeSettlementForPayment({
        chargeId: 'ch_mixed',
        currency: 'usd',
        paymentIntentId: null,
      }),
    ).resolves.toEqual({ lostDisputeAmountMinorUnits: 400, refundDeferred: true })
    expect(list).toHaveBeenNthCalledWith(1, { charge: 'ch_mixed', limit: 100 })
    expect(list).toHaveBeenNthCalledWith(2, {
      charge: 'ch_mixed',
      limit: 100,
      starting_after: 'dp_lost',
    })
  })

  it.each(['warning_needs_response', 'warning_under_review'] as const)(
    'defers a refund for a %s dispute',
    async status => {
      const list = vi.fn<VitestLooseMock>().mockResolvedValue(getStripeDisputePage([{ status }]))
      vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue({
        disputes: { list },
      } as never)

      await expect(
        getStripeDisputeSettlementForPayment({
          chargeId: 'ch_warning_open',
          currency: 'usd',
          paymentIntentId: null,
        }),
      ).resolves.toEqual({ lostDisputeAmountMinorUnits: 0, refundDeferred: true })
    },
  )

  it('rejects an empty continuation page and caps dispute pagination', async () => {
    const list = vi.fn<VitestLooseMock>().mockResolvedValueOnce(getStripeDisputePage([], true))
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue({
      disputes: { list },
    } as never)

    await expect(
      getStripeDisputeSettlementForPayment({
        chargeId: 'ch_empty_continuation',
        currency: 'usd',
        paymentIntentId: null,
      }),
    ).rejects.toThrow('Stripe returned an empty dispute page for charge ch_empty_continuation')

    list.mockClear()
    list.mockResolvedValue(getStripeDisputePage([{ id: 'dp_repeated', status: 'won' }], true))
    await expect(
      getStripeDisputeSettlementForPayment({
        chargeId: 'ch_page_cap',
        currency: 'usd',
        paymentIntentId: null,
      }),
    ).rejects.toThrow('Stripe charge ch_page_cap exceeded the dispute page limit')
    expect(list).toHaveBeenCalledTimes(10)
  })

  it('rejects a lost dispute with another currency or an unknown status', async () => {
    const list = vi
      .fn<VitestLooseMock>()
      .mockResolvedValue(getStripeDisputePage([{ amount: 400, currency: 'eur', status: 'lost' }]))
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue({
      disputes: { list },
    } as never)

    await expect(
      getStripeDisputeSettlementForPayment({
        chargeId: 'ch_wrong_currency',
        currency: 'usd',
        paymentIntentId: null,
      }),
    ).rejects.toThrow('Stripe dispute currency eur did not match usd')

    list.mockResolvedValue(getStripeDisputePage([{ status: 'future_status' }]))
    await expect(
      getStripeDisputeSettlementForPayment({
        chargeId: 'ch_unknown_status',
        currency: 'usd',
        paymentIntentId: null,
      }),
    ).rejects.toThrow('Unsupported Stripe dispute status: future_status')
  })

  it('rejects a dispute lookup without a provider payment reference', async () => {
    await expect(
      getStripeDisputeSettlementForPayment({
        chargeId: null,
        currency: 'usd',
        paymentIntentId: null,
      }),
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
      getStripeDisputeSettlementForPayment({
        chargeId: null,
        currency: 'usd',
        paymentIntentId: 'pi_disputed',
      }),
    ).resolves.toEqual({ lostDisputeAmountMinorUnits: 0, refundDeferred: true })
    expect(retrieve).toHaveBeenCalledWith('pi_disputed', { expand: ['latest_charge'] })
    expect(list).toHaveBeenCalledWith({ charge: 'ch_payment_intent_dispute', limit: 100 })
  })
})
