import { describe, expect, it } from 'vitest'
import {
  getMembershipChangeType,
  getMembershipLifecycleSnapshot,
} from './membership-change-helpers.mts'

function opts(overrides: {
  previousPlan?: 'plus' | 'pro'
  nextPlan?: 'plus' | 'pro'
  previousStatus?: 'active' | 'cancelled' | 'expired' | 'past_due' | 'paused'
  nextStatus?: 'active' | 'cancelled' | 'expired' | 'past_due' | 'paused'
  previousSkuId?: string
  nextSkuId?: string
}) {
  return {
    previousPlan: overrides.previousPlan ?? 'plus',
    nextPlan: overrides.nextPlan ?? 'plus',
    previousStatus: overrides.previousStatus ?? 'active',
    nextStatus: overrides.nextStatus ?? 'active',
    previousSkuId: overrides.previousSkuId ?? 'sku_a',
    nextSkuId: overrides.nextSkuId ?? 'sku_a',
  }
}

describe('getMembershipChangeType - plan changes', () => {
  it('upgrade from plus to pro', () => {
    expect(getMembershipChangeType(opts({ previousPlan: 'plus', nextPlan: 'pro' }))).toBe('upgrade')
  })

  it('downgrade from pro to plus', () => {
    expect(getMembershipChangeType(opts({ previousPlan: 'pro', nextPlan: 'plus' }))).toBe(
      'downgrade',
    )
  })
})

describe('getMembershipChangeType - status changes', () => {
  it('cancellation when next status is cancelled', () => {
    expect(
      getMembershipChangeType(opts({ previousStatus: 'active', nextStatus: 'cancelled' })),
    ).toBe('cancellation')
  })

  it('pause when next status is paused', () => {
    expect(getMembershipChangeType(opts({ previousStatus: 'active', nextStatus: 'paused' }))).toBe(
      'pause',
    )
  })

  it('reactivation from cancelled to active', () => {
    expect(
      getMembershipChangeType(opts({ previousStatus: 'cancelled', nextStatus: 'active' })),
    ).toBe('reactivation')
  })

  it('reactivation from paused to active', () => {
    expect(getMembershipChangeType(opts({ previousStatus: 'paused', nextStatus: 'active' }))).toBe(
      'reactivation',
    )
  })

  it('expiration when next status is expired', () => {
    expect(getMembershipChangeType(opts({ previousStatus: 'active', nextStatus: 'expired' }))).toBe(
      'expiration',
    )
  })

  it('renewal for other status transitions', () => {
    expect(
      getMembershipChangeType(opts({ previousStatus: 'past_due', nextStatus: 'active' })),
    ).toBe('renewal')
  })
})

describe('getMembershipChangeType - sku migration', () => {
  it('returns sku_migration when plan and status are the same but sku changes', () => {
    expect(getMembershipChangeType(opts({ previousSkuId: 'sku_a', nextSkuId: 'sku_b' }))).toBe(
      'sku_migration',
    )
  })
})

describe('getMembershipChangeType - no change', () => {
  it('returns null when nothing changed', () => {
    expect(getMembershipChangeType(opts({}))).toBeNull()
  })

  it('returns null when same plan, status, and sku', () => {
    expect(
      getMembershipChangeType(
        opts({
          previousPlan: 'pro',
          nextPlan: 'pro',
          previousStatus: 'active',
          nextStatus: 'active',
          previousSkuId: 'sku_x',
          nextSkuId: 'sku_x',
        }),
      ),
    ).toBeNull()
  })
})

describe('getMembershipLifecycleSnapshot', () => {
  it('preserves an existing lifecycle entry timestamp for history snapshots', () => {
    const pastDueAt = new Date('2026-01-01T00:00:00Z')

    const snapshot = getMembershipLifecycleSnapshot('past_due', false, {
      cancelled_at: null,
      expired_at: null,
      past_due_at: pastDueAt,
      paused_at: null,
    })

    expect(snapshot.pastDueAt).toBe(pastDueAt)
  })
})
