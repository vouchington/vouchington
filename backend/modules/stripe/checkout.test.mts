import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import * as stripeClientModule from '@modules/stripe/client'
import { createCheckoutSession, createOneTimeCheckoutSession } from './checkout.mts'

describe('stripe checkout module', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates subscription checkout sessions with the expected Stripe payload', async () => {
    const create = vi.fn<VitestLooseMock>().mockResolvedValue({ id: 'cs_sub' })
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue({
      checkout: { sessions: { create } },
    } as never)

    await expect(
      createCheckoutSession({
        customerId: 'cus_123',
        priceId: 'price_123',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
        metadata: { membership_purchase_intent_id: 'intent_123' },
      }),
    ).resolves.toEqual({ id: 'cs_sub' })
    expect(create).toHaveBeenCalledWith({
      customer: 'cus_123',
      mode: 'subscription',
      line_items: [{ price: 'price_123', quantity: 1 }],
      success_url: 'https://example.com/success',
      cancel_url: 'https://example.com/cancel',
      metadata: { membership_purchase_intent_id: 'intent_123' },
      subscription_data: { metadata: { membership_purchase_intent_id: 'intent_123' } },
    })
  })

  it('creates one-time checkout sessions with inline price data and metadata', async () => {
    const create = vi.fn<VitestLooseMock>().mockResolvedValue({ id: 'cs_one_time' })
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue({
      checkout: { sessions: { create } },
    } as never)

    await expect(
      createOneTimeCheckoutSession({
        customerId: 'cus_456',
        priceAmountMinorUnits: 2500,
        currency: 'usd',
        productName: 'Verification',
        successUrl: 'https://example.com/verified',
        cancelUrl: 'https://example.com/retry',
        metadata: { userId: 'user_123' },
      }),
    ).resolves.toEqual({ id: 'cs_one_time' })
    expect(create).toHaveBeenCalledWith({
      customer: 'cus_456',
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: 2500,
            product_data: { name: 'Verification' },
          },
          quantity: 1,
        },
      ],
      success_url: 'https://example.com/verified',
      cancel_url: 'https://example.com/retry',
      metadata: { userId: 'user_123' },
    })
  })

  it('passes idempotency keys to both checkout session variants', async () => {
    const create = vi.fn<VitestLooseMock>().mockResolvedValue({ id: 'cs_idempotent' })
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue({
      checkout: { sessions: { create } },
    } as never)

    await createCheckoutSession({
      customerId: 'cus_subscription',
      priceId: 'price_123',
      successUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel',
      metadata: { membership_purchase_intent_id: 'intent_456' },
      idempotencyKey: 'checkout-subscription-key',
    })
    await createOneTimeCheckoutSession({
      customerId: 'cus_payment',
      priceAmountMinorUnits: 2500,
      currency: 'usd',
      productName: 'Verification',
      successUrl: 'https://example.com/verified',
      cancelUrl: 'https://example.com/retry',
      metadata: { userId: 'user_123' },
      idempotencyKey: 'checkout-payment-key',
    })

    expect(create.mock.calls[0]?.[1]).toEqual({ idempotencyKey: 'checkout-subscription-key' })
    expect(create.mock.calls[1]?.[1]).toEqual({ idempotencyKey: 'checkout-payment-key' })
  })
})
