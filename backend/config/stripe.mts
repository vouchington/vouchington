export const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? ''
export const STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY ?? ''

export type StripeProviderEnvironment = 'test' | 'production'

export function getStripeProviderEnvironment(
  secretKey: string,
  publishableKey: string,
): StripeProviderEnvironment {
  const environments = new Set(
    [secretKey, publishableKey]
      .map(getStripeKeyEnvironment)
      .filter((environment): environment is StripeProviderEnvironment => environment !== null),
  )
  if (environments.size > 1) throw new Error('Stripe keys use different environments')
  return environments.values().next().value ?? 'production'
}

export const STRIPE_PROVIDER_ENVIRONMENT = getStripeProviderEnvironment(
  STRIPE_SECRET_KEY,
  STRIPE_PUBLISHABLE_KEY,
)

function getStripeKeyEnvironment(key: string): StripeProviderEnvironment | null {
  if (/^(?:pk|rk|sk)_test_/.test(key)) return 'test'
  if (/^(?:pk|rk|sk)_live_/.test(key)) return 'production'
  return null
}
