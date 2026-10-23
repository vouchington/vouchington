import { describe, expect, it } from 'vitest'
import { mapStripeSubscriptionStatus } from './event-utils.mts'

describe('mapStripeSubscriptionStatus', () => {
  it('maps active to active', () => {
    expect(mapStripeSubscriptionStatus('active')).toBe('active')
  })

  it('maps trialing to active', () => {
    expect(mapStripeSubscriptionStatus('trialing')).toBe('active')
  })

  it('maps past_due to past_due', () => {
    expect(mapStripeSubscriptionStatus('past_due')).toBe('past_due')
  })

  it('maps paused to paused', () => {
    expect(mapStripeSubscriptionStatus('paused')).toBe('paused')
  })

  it('maps canceled to cancelled', () => {
    expect(mapStripeSubscriptionStatus('canceled')).toBe('cancelled')
  })

  it('maps unpaid to cancelled', () => {
    expect(mapStripeSubscriptionStatus('unpaid')).toBe('cancelled')
  })

  it('maps incomplete to expired', () => {
    expect(mapStripeSubscriptionStatus('incomplete')).toBe('expired')
  })

  it('maps incomplete_expired to expired', () => {
    expect(mapStripeSubscriptionStatus('incomplete_expired')).toBe('expired')
  })

  it('throws on unknown status', () => {
    expect(() => mapStripeSubscriptionStatus('unknown_status')).toThrow(
      'Unknown Stripe subscription status: unknown_status',
    )
  })
})
