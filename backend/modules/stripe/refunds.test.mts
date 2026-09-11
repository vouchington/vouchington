import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as stripeClientModule from '@modules/stripe/client'
import {
  createStripeRefund,
  getStripeRefund,
  listStripeRefundsForCharge,
  listStripeRefundsForPaymentPage,
} from './refunds.mts'

describe('stripe refunds module', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates a refund with chargeId', async () => {
    const create = vi.fn<VitestLooseMock>().mockResolvedValue({ id: 're_123' })
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue({
      refunds: { create },
    } as never)

    await expect(
      createStripeRefund({ chargeId: 'ch_123', idempotencyKey: 'key_123' }),
    ).resolves.toEqual({ id: 're_123' })
    expect(create).toHaveBeenCalledWith({ charge: 'ch_123' }, { idempotencyKey: 'key_123' })
  })

  it('creates a refund with paymentIntentId', async () => {
    const create = vi.fn<VitestLooseMock>().mockResolvedValue({ id: 're_pi_123' })
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue({
      refunds: { create },
    } as never)

    await expect(
      createStripeRefund({ paymentIntentId: 'pi_123', idempotencyKey: 'key_pi' }),
    ).resolves.toEqual({ id: 're_pi_123' })
    expect(create).toHaveBeenCalledWith({ payment_intent: 'pi_123' }, { idempotencyKey: 'key_pi' })
  })

  it('creates a refund with optional amountMinorUnits', async () => {
    const create = vi.fn<VitestLooseMock>().mockResolvedValue({ id: 're_456' })
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue({
      refunds: { create },
    } as never)

    await expect(
      createStripeRefund({
        chargeId: 'ch_456',
        amountMinorUnits: 500,
        idempotencyKey: 'key_456',
      }),
    ).resolves.toEqual({ id: 're_456' })
    expect(create).toHaveBeenCalledWith(
      { charge: 'ch_456', amount: 500 },
      { idempotencyKey: 'key_456' },
    )
  })

  it('retrieves a refund by ID', async () => {
    const retrieve = vi.fn<VitestLooseMock>().mockResolvedValue({ id: 're_retrieved' })
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue({
      refunds: { retrieve },
    } as never)

    await expect(getStripeRefund('re_retrieved')).resolves.toEqual({ id: 're_retrieved' })
    expect(retrieve).toHaveBeenCalledWith('re_retrieved')
  })

  it('lists refunds for a charge', async () => {
    const list = vi.fn<VitestLooseMock>().mockResolvedValue({ data: [] })
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue({
      refunds: { list },
    } as never)

    await expect(listStripeRefundsForCharge('ch_789')).resolves.toEqual({ data: [] })
    expect(list).toHaveBeenCalledWith({ charge: 'ch_789' })
  })

  it('lists one bounded refund page for a charge', async () => {
    const list = vi.fn<VitestLooseMock>().mockResolvedValue({
      data: [{ id: 're_newest' }],
      has_more: true,
    })
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue({
      refunds: { list },
    } as never)

    await expect(
      listStripeRefundsForPaymentPage({ chargeId: 'ch_789', paymentIntentId: null }),
    ).resolves.toEqual({
      refunds: [{ id: 're_newest' }],
      hasMore: true,
      nextCursor: 're_newest',
    })
    expect(list).toHaveBeenCalledOnce()
    expect(list).toHaveBeenCalledWith({ charge: 'ch_789', limit: 100 })
  })

  it('lists one bounded refund page for a payment intent after a cursor', async () => {
    const list = vi.fn<VitestLooseMock>().mockResolvedValue({
      data: [{ id: 're_oldest' }],
      has_more: false,
    })
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue({
      refunds: { list },
    } as never)

    await expect(
      listStripeRefundsForPaymentPage({
        chargeId: null,
        paymentIntentId: 'pi_789',
        startingAfter: 're_newest',
      }),
    ).resolves.toEqual({
      refunds: [{ id: 're_oldest' }],
      hasMore: false,
      nextCursor: undefined,
    })
    expect(list).toHaveBeenCalledOnce()
    expect(list).toHaveBeenCalledWith({
      payment_intent: 'pi_789',
      limit: 100,
      starting_after: 're_newest',
    })
  })

  it('requires exactly one Stripe payment identifier', async () => {
    await expect(
      listStripeRefundsForPaymentPage({ chargeId: null, paymentIntentId: null }),
    ).rejects.toThrow('Stripe refund lookup requires a charge or payment intent')
    await expect(
      listStripeRefundsForPaymentPage({ chargeId: 'ch_123', paymentIntentId: 'pi_123' }),
    ).rejects.toThrow('Stripe refund lookup cannot use both charge and payment intent')
  })

  it.each([
    { data: [], title: 'has no refunds' },
    { data: [{ id: '' }], title: 'has an empty last refund ID' },
  ])('rejects a continued refund page that $title', async ({ data }) => {
    const list = vi.fn<VitestLooseMock>().mockResolvedValue({ data, has_more: true })
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue({
      refunds: { list },
    } as never)

    await expect(
      listStripeRefundsForPaymentPage({ chargeId: 'ch_789', paymentIntentId: null }),
    ).rejects.toThrow('Stripe returned has_more without a refund cursor')
    expect(list).toHaveBeenCalledOnce()
  })

  it('rejects a continued refund page whose cursor does not advance', async () => {
    const list = vi.fn<VitestLooseMock>().mockResolvedValue({
      data: [{ id: 're_newest' }],
      has_more: true,
    })
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue({
      refunds: { list },
    } as never)

    await expect(
      listStripeRefundsForPaymentPage({
        chargeId: 'ch_789',
        paymentIntentId: null,
        startingAfter: 're_newest',
      }),
    ).rejects.toThrow('Stripe returned has_more without advancing the refund cursor')
    expect(list).toHaveBeenCalledOnce()
  })
})
