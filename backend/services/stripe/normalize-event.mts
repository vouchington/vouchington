import type Stripe from 'stripe'
import { getStripeObjectId, getStripeObjectString } from './event-utils.mts'

export function normalizeStripeEvent(event: Stripe.Event): {
  stripeCreatedAt: Date
  customerId: string | null
  subscriptionId: string | null
  invoiceId: string | null
  checkoutSessionId: string | null
} {
  const object = event.data.object as unknown as Record<string, unknown>
  const objectId = getStripeObjectString(object.id)
  const objectType = getStripeObjectString(object.object)

  return {
    stripeCreatedAt: new Date(event.created * 1000),
    customerId: objectType === 'customer' ? objectId : getStripeObjectString(object.customer),
    subscriptionId:
      objectType === 'subscription' ? objectId : getStripeObjectString(object.subscription),
    invoiceId: objectType === 'invoice' ? objectId : getStripeObjectId(object.invoice),
    checkoutSessionId: objectType === 'checkout.session' ? objectId : null,
  }
}
