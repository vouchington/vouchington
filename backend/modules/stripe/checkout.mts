import type Stripe from 'stripe'
import { getStripeClient } from './client.mts'

/* no-mistakes: integration=stripe */
export function createCheckoutSession({
  customerId,
  priceId,
  successUrl,
  cancelUrl,
  metadata,
  idempotencyKey,
}: {
  customerId: string
  priceId: string
  successUrl: string
  cancelUrl: string
  metadata: Record<string, string>
  idempotencyKey?: string
}): Promise<Stripe.Response<Stripe.Checkout.Session>> {
  const stripe = getStripeClient()
  const params: Stripe.Checkout.SessionCreateParams = {
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata,
    subscription_data: { metadata },
  }
  if (!idempotencyKey) return stripe.checkout.sessions.create(params)
  return stripe.checkout.sessions.create(params, { idempotencyKey })
}

/* no-mistakes: integration=stripe */
export function createOneTimeCheckoutSession({
  customerId,
  priceAmountMinorUnits,
  currency,
  productName,
  successUrl,
  cancelUrl,
  metadata,
  idempotencyKey,
}: {
  customerId: string
  priceAmountMinorUnits: number
  currency: string
  productName: string
  successUrl: string
  cancelUrl: string
  metadata: Record<string, string>
  idempotencyKey?: string
}): Promise<Stripe.Response<Stripe.Checkout.Session>> {
  const stripe = getStripeClient()
  const params: Stripe.Checkout.SessionCreateParams = {
    customer: customerId,
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency,
          unit_amount: priceAmountMinorUnits,
          product_data: { name: productName },
        },
        quantity: 1,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata,
  }
  if (!idempotencyKey) return stripe.checkout.sessions.create(params)
  return stripe.checkout.sessions.create(params, { idempotencyKey })
}
