import type Stripe from 'stripe'
import { getStripeClient } from './client.mts'

type StripeCustomerDeps = {
  stripe?: Stripe
}

function getStripe(deps?: StripeCustomerDeps): Stripe {
  return deps?.stripe ?? getStripeClient()
}

/* no-mistakes: integration=stripe */
export function getStripeCustomer(
  id: string,
  deps?: StripeCustomerDeps,
): Promise<Stripe.Response<Stripe.Customer | Stripe.DeletedCustomer>> {
  const stripe = getStripe(deps)
  return stripe.customers.retrieve(id)
}

/* no-mistakes: integration=stripe */
export async function getOrCreateStripeCustomer(
  userId: string,
  email?: string,
  deps?: StripeCustomerDeps,
  idempotencyKey?: string,
): Promise<Stripe.Customer> {
  const stripe = getStripe(deps)

  const existing = await stripe.customers.search({
    query: `metadata["userId"]:"${userId}"`,
  })

  if (existing.data.length > 0) return existing.data[0]

  const params = { email, metadata: { userId } }
  if (!idempotencyKey) return stripe.customers.create(params)
  return stripe.customers.create(params, { idempotencyKey })
}

/* no-mistakes: integration=stripe */
export function sanitizeStripeCustomer(
  stripeCustomerId: string,
  deps?: StripeCustomerDeps,
  idempotencyKey?: string,
): Promise<Stripe.Response<Stripe.Customer>> {
  const stripe = getStripe(deps)
  const params = { email: '', name: '', metadata: { redacted: 'true' } }
  if (!idempotencyKey) return stripe.customers.update(stripeCustomerId, params)
  return stripe.customers.update(stripeCustomerId, params, { idempotencyKey })
}
