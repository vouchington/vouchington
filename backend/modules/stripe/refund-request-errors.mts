import Stripe from 'stripe'

export type StripeRefundRequestRejection = 'authentication' | 'rate_limited' | 'invalid_parameters'

// Stripe documents these as pre-execution failures. Other 4xx, network errors and 5xx stay unknown.
// https://docs.stripe.com/error-low-level#content-errors
// https://docs.stripe.com/error-codes
export function classifyStripeRefundRequestError(
  err: unknown,
): StripeRefundRequestRejection | null {
  if (err instanceof Stripe.errors.StripeAuthenticationError && err.statusCode === 401)
    return 'authentication'
  if (
    err instanceof Stripe.errors.StripeRateLimitError &&
    err.statusCode === 429 &&
    err.code !== 'lock_timeout'
  )
    return 'rate_limited'
  if (
    err instanceof Stripe.errors.StripeInvalidRequestError &&
    err.statusCode === 400 &&
    (err.code === 'parameter_invalid_empty' ||
      err.code === 'parameter_invalid_integer' ||
      err.code === 'parameter_invalid_string_blank' ||
      err.code === 'parameter_invalid_string_empty' ||
      err.code === 'parameter_missing' ||
      err.code === 'parameter_unknown' ||
      err.code === 'parameters_exclusive')
  )
    return 'invalid_parameters'
  return null
}

const confirmedRejections = new WeakMap<object, StripeRefundRequestRejection>()

export function confirmStripeRefundRequestRejection(
  err: unknown,
  providerRequestCount: number,
): void {
  if (providerRequestCount !== 1 || typeof err !== 'object' || err === null) return
  const rejection = classifyStripeRefundRequestError(err)
  if (rejection) confirmedRejections.set(err, rejection)
}

export function getStripeRefundRequestRejection(err: unknown): StripeRefundRequestRejection | null {
  return typeof err === 'object' && err !== null ? (confirmedRejections.get(err) ?? null) : null
}
