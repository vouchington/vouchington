import { describe, expect, it } from 'vitest'
import { getTrustTier, getTrustLabel } from './trust-tier.mts'

describe('getTrustTier', () => {
  it('returns unrated when no votes', () => {
    expect(getTrustTier(0, 0, 0)).toBe('unrated')
    expect(getTrustTier(5, 0, 0)).toBe('unrated')
  })

  it('returns trusted when scoreNet >= 3 and countUp >= 5', () => {
    expect(getTrustTier(3, 5, 2)).toBe('trusted')
    expect(getTrustTier(10, 10, 0)).toBe('trusted')
    expect(getTrustTier(5, 5, 0)).toBe('trusted')
  })

  it('does NOT return trusted if countUp < 5 even with high scoreNet', () => {
    expect(getTrustTier(3, 4, 1)).toBe('neutral')
    expect(getTrustTier(10, 4, 0)).toBe('neutral')
  })

  it('does NOT return trusted if scoreNet < 3 even with many upvotes', () => {
    expect(getTrustTier(2, 5, 3)).toBe('neutral')
    expect(getTrustTier(0, 5, 5)).toBe('neutral')
  })

  it('returns distrusted when scoreNet <= -3', () => {
    expect(getTrustTier(-3, 1, 4)).toBe('distrusted')
    expect(getTrustTier(-10, 0, 10)).toBe('distrusted')
  })

  it('returns neutral for borderline cases', () => {
    expect(getTrustTier(1, 3, 2)).toBe('neutral')
    expect(getTrustTier(-2, 1, 3)).toBe('neutral')
    expect(getTrustTier(0, 1, 1)).toBe('neutral')
  })
})

describe('getTrustLabel', () => {
  it('returns correct labels', () => {
    expect(getTrustLabel('trusted')).toBe('Trusted')
    expect(getTrustLabel('neutral')).toBe('Neutral')
    expect(getTrustLabel('distrusted')).toBe('Distrusted')
    expect(getTrustLabel('unrated')).toBe('Unrated')
  })
})
