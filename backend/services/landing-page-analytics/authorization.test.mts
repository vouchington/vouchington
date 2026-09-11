import { describe, expect, it } from 'vitest'
import { createTestUserDirect } from '@voucha/test-helpers'
import { currentUserCanViewLandingPageAnalytics } from './authorization.mts'

type Membership = NonNullable<Parameters<typeof currentUserCanViewLandingPageAnalytics>[1]>

function membership(status: Membership['status']): Membership {
  return { plan: 'plus', status, expires_at: null }
}

describe('currentUserCanViewLandingPageAnalytics', () => {
  it('returns false for null user', () => {
    expect(currentUserCanViewLandingPageAnalytics(null, null)).toBe(false)
  })

  it('returns true for active Plus members', async () => {
    const user = await createTestUserDirect()
    expect(currentUserCanViewLandingPageAnalytics(user!, membership('active'))).toBe(true)
  })

  it('returns true for past-due Pro members', async () => {
    const user = await createTestUserDirect()
    expect(
      currentUserCanViewLandingPageAnalytics(user!, {
        plan: 'pro',
        status: 'past_due',
        expires_at: null,
      }),
    ).toBe(true)
  })

  it('returns false without an eligible membership', async () => {
    const user = await createTestUserDirect()
    expect(currentUserCanViewLandingPageAnalytics(user!, null)).toBe(false)
    expect(currentUserCanViewLandingPageAnalytics(user!, membership('paused'))).toBe(false)
  })

  it('returns false for an elapsed finite membership', async () => {
    const user = await createTestUserDirect()
    expect(
      currentUserCanViewLandingPageAnalytics(user!, {
        ...membership('active'),
        expires_at: new Date(Date.now() - 1_000),
      }),
    ).toBe(false)
  })

  it('returns true for an elapsed Stripe period', async () => {
    const user = await createTestUserDirect()
    expect(
      currentUserCanViewLandingPageAnalytics(user!, {
        ...membership('active'),
        stripe_subscription_id: 'sub_lapsed',
        expires_at: new Date(Date.now() - 1_000),
      }),
    ).toBe(true)
  })
})
