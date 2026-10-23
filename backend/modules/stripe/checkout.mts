import type Stripe from 'stripe'
import {
  buildSubscriptionCheckoutParams,
  buildOneTimeCheckoutParams,
  idempotencyOptions,
} from '@vouchington/stripe'
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
  return stripe.checkout.sessions.create(
    buildSubscriptionCheckoutParams({ customerId, priceId, successUrl, cancelUrl, metadata }),
    idempotencyOptions(idempotencyKey),
  )
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
  return stripe.checkout.sessions.create(
    buildOneTimeCheckoutParams({
      customerId,
      priceAmountMinorUnits,
      currency,
      productName,
      successUrl,
      cancelUrl,
      metadata,
    }),
    idempotencyOptions(idempotencyKey),
  )
}
