import { getStripeProviderEnvironment } from '@vouchington/stripe'

export const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? ''
export const STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY ?? ''

export const STRIPE_PROVIDER_ENVIRONMENT = getStripeProviderEnvironment(
  STRIPE_SECRET_KEY,
  STRIPE_PUBLISHABLE_KEY,
)
