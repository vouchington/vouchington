import { describe, expect, it, vi } from 'vitest'
import { getRefundableReversalTargets } from './ineligible-stripe-purchase-reversal-targets.mts'

describe('getRefundableReversalTargets concurrency', () => {
  it('bounds independent Stripe refund lookups across invoice payments', async () => {
    let active = 0
    let maxActive = 0
    let observeConcurrency: (() => void) | undefined
    const concurrencyObserved = new Promise<void>(resolve => {
      observeConcurrency = resolve
    })
    let releaseLookups: (() => void) | undefined
    const lookupGate = new Promise<void>(resolve => {
      releaseLookups = resolve
    })
    const getStripeRefundHistoryForPayment = vi.fn<
      (options: {
        chargeId: string | null
        currency: string
        invoiceId: string
        paymentIntentId: string | null
      }) => Promise<{ alreadyRefundedMinorUnits: number; refundDeferred: boolean }>
    >(async () => {
      active += 1
      maxActive = Math.max(maxActive, active)
      if (maxActive === 3) observeConcurrency?.()
      await lookupGate
      active -= 1
      return { alreadyRefundedMinorUnits: 0, refundDeferred: false }
    })
    const invoice = {
      created: 1_893_456_000,
      currency: 'usd',
      id: 'in_bounded_refund_lookups',
      payments: {
        data: Array.from({ length: 6 }, (_, index) => ({
          amount_paid: 100,
          payment: { charge: `ch_bounded_${index}`, type: 'charge' },
        })),
      },
      status: 'paid',
    }

    const targets = getRefundableReversalTargets(
      [invoice],
      getStripeRefundHistoryForPayment,
      async () => ({ lostDisputeAmountMinorUnits: 0, refundDeferred: false }),
    )

    await concurrencyObserved
    expect(maxActive).toBe(3)
    releaseLookups?.()
    await expect(targets).resolves.toHaveLength(6)
    expect(maxActive).toBe(3)
  })

  it('marks a reversal target deferred when its charge has an open dispute', async () => {
    const getStripeDisputeSettlementForPayment = vi
      .fn<
        (options: {
          chargeId: string | null
          paymentIntentId: string | null
        }) => Promise<{ lostDisputeAmountMinorUnits: number; refundDeferred: boolean }>
      >()
      .mockResolvedValue({ lostDisputeAmountMinorUnits: 0, refundDeferred: true })

    await expect(
      getRefundableReversalTargets(
        [
          {
            created: 1_893_456_000,
            currency: 'usd',
            id: 'in_open_dispute',
            payments: {
              data: [
                {
                  amount_paid: 1_000,
                  payment: { type: 'charge', charge: 'ch_open_dispute' },
                },
              ],
            },
            status: 'paid',
          },
        ],
        async () => ({ alreadyRefundedMinorUnits: 0, refundDeferred: false }),
        getStripeDisputeSettlementForPayment,
      ),
    ).resolves.toEqual([
      {
        amountMinorUnits: 1_000,
        chargeId: 'ch_open_dispute',
        currency: 'usd',
        externallySatisfiedMinorUnits: 0,
        invoiceId: 'in_open_dispute',
        paymentIntentId: null,
        providerObservedAmountMinorUnits: 1_000,
        qualifyingAmountMinorUnits: 1_000,
        refundDeferred: true,
      },
    ])
  })
})
