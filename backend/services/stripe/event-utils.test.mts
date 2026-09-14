import { describe, expect, it } from 'vitest'
import {
  getStripeObjectBoolean,
  getStripeObjectId,
  getStripeObjectNumber,
  getStripeObjectString,
  mapStripeSubscriptionStatus,
} from './event-utils.mts'

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

describe('getStripeObjectString', () => {
  it('returns string value', () => {
    expect(getStripeObjectString('hello')).toBe('hello')
  })

  it('returns null for empty string', () => {
    expect(getStripeObjectString('')).toBeNull()
  })

  it('returns null for number', () => {
    expect(getStripeObjectString(42)).toBeNull()
  })

  it('returns null for boolean', () => {
    expect(getStripeObjectString(true)).toBeNull()
  })

  it('returns null for null', () => {
    expect(getStripeObjectString(null)).toBeNull()
  })

  it('returns null for undefined', () => {
    expect(getStripeObjectString(undefined)).toBeNull()
  })
})

describe('getStripeObjectId', () => {
  it('returns a compact object ID', () => {
    expect(getStripeObjectId('in_compact')).toBe('in_compact')
  })

  it('returns an expanded object ID', () => {
    expect(getStripeObjectId({ id: 'in_expanded' })).toBe('in_expanded')
  })

  it('rejects values without an object ID', () => {
    expect(getStripeObjectId({})).toBeNull()
    expect(getStripeObjectId([])).toBeNull()
  })
})

describe('getStripeObjectNumber', () => {
  it('returns number value', () => {
    expect(getStripeObjectNumber(42)).toBe(42)
  })

  it('returns zero', () => {
    expect(getStripeObjectNumber(0)).toBe(0)
  })

  it('returns null for string', () => {
    expect(getStripeObjectNumber('42')).toBeNull()
  })

  it('returns null for boolean', () => {
    expect(getStripeObjectNumber(true)).toBeNull()
  })

  it('returns null for null', () => {
    expect(getStripeObjectNumber(null)).toBeNull()
  })

  it('returns null for undefined', () => {
    expect(getStripeObjectNumber(undefined)).toBeNull()
  })
})

describe('getStripeObjectBoolean', () => {
  it('returns true', () => {
    expect(getStripeObjectBoolean(true)).toBe(true)
  })

  it('returns false', () => {
    expect(getStripeObjectBoolean(false)).toBe(false)
  })

  it('returns null for string', () => {
    expect(getStripeObjectBoolean('true')).toBeNull()
  })

  it('returns null for number', () => {
    expect(getStripeObjectBoolean(1)).toBeNull()
  })

  it('returns null for null', () => {
    expect(getStripeObjectBoolean(null)).toBeNull()
  })

  it('returns null for undefined', () => {
    expect(getStripeObjectBoolean(undefined)).toBeNull()
  })
})
