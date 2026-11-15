import Stripe from 'stripe'
import { describe, expect, it } from 'vitest'
import { classifyStripeRefundRequestError } from './refund-request-errors.mts'

describe('refund request outcome classification', () => {
  it('recognizes only documented pre-execution authentication, rate-limit and parameter failures', () => {
    expect(
      classifyStripeRefundRequestError(
        new Stripe.errors.StripeAuthenticationError({ statusCode: 401 }),
      ),
    ).toBe('authentication')
    expect(
      classifyStripeRefundRequestError(new Stripe.errors.StripeRateLimitError({ statusCode: 429 })),
    ).toBe('rate_limited')
    expect(
      classifyStripeRefundRequestError(
        new Stripe.errors.StripeInvalidRequestError({ statusCode: 400, code: 'parameter_missing' }),
      ),
    ).toBe('invalid_parameters')
    for (const err of [
      new Error('network connection lost'),
      new Stripe.errors.StripeAPIError({ statusCode: 500 }),
      new Stripe.errors.StripeInvalidRequestError({
        statusCode: 400,
        code: 'charge_already_refunded',
      }),
      new Stripe.errors.StripeInvalidRequestError({
        statusCode: 409,
        code: 'idempotency_key_in_use',
      }),
      new Stripe.errors.StripeRateLimitError({ statusCode: 429, code: 'lock_timeout' }),
    ])
      expect(classifyStripeRefundRequestError(err)).toBeNull()
  })
})
