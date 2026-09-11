import { describe, expect, it } from 'vitest'
import {
  getStripeObjectBoolean,
  getStripeObjectId,
  getStripeObjectNumber,
  getStripeObjectString,
  mapStripeWebhookStatus,
} from './webhook-utils.mts'

describe('mapStripeWebhookStatus', () => {
  it('maps active to active', () => {
    expect(mapStripeWebhookStatus('active')).toBe('active')
  })

  it('maps trialing to active', () => {
    expect(mapStripeWebhookStatus('trialing')).toBe('active')
  })

  it('maps past_due to past_due', () => {
    expect(mapStripeWebhookStatus('past_due')).toBe('past_due')
  })

  it('maps paused to paused', () => {
    expect(mapStripeWebhookStatus('paused')).toBe('paused')
  })

  it('maps canceled to cancelled', () => {
    expect(mapStripeWebhookStatus('canceled')).toBe('cancelled')
  })

  it('maps unpaid to cancelled', () => {
    expect(mapStripeWebhookStatus('unpaid')).toBe('cancelled')
  })

  it('maps incomplete to expired', () => {
    expect(mapStripeWebhookStatus('incomplete')).toBe('expired')
  })

  it('maps incomplete_expired to expired', () => {
    expect(mapStripeWebhookStatus('incomplete_expired')).toBe('expired')
  })

  it('throws on unknown status', () => {
    expect(() => mapStripeWebhookStatus('unknown_status')).toThrow(
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
