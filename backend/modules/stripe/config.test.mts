import { describe, expect, it } from 'vitest'
import { getStripeProviderEnvironment } from '@voucha/config'

describe('getStripeProviderEnvironment', () => {
  it.each([
    [stripeKey('sk', 'test'), stripeKey('pk', 'test'), 'test'],
    [stripeKey('rk', 'test'), '', 'test'],
    [stripeKey('sk', 'live'), stripeKey('pk', 'live'), 'production'],
    ['', '', 'production'],
  ] as const)(
    'maps configured Stripe keys to their provider environment',
    (secret, publicKey, expected) => {
      expect(getStripeProviderEnvironment(secret, publicKey)).toBe(expected)
    },
  )

  it('rejects mismatched Stripe key environments', () => {
    expect(() =>
      getStripeProviderEnvironment(stripeKey('sk', 'test'), stripeKey('pk', 'live')),
    ).toThrow('Stripe keys use different environments')
  })
})

function stripeKey(prefix: 'sk' | 'pk' | 'rk', environment: 'test' | 'live'): string {
  return `${prefix}_${environment}_fixture`
}
