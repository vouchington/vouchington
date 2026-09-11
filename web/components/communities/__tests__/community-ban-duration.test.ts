import { describe, expect, it } from 'vitest'
import { durationToExpiresAt } from '../community-ban-duration'

describe('durationToExpiresAt', () => {
  it('returns undefined for a permanent ban', () => {
    expect(durationToExpiresAt('permanent')).toBeUndefined()
  })

  it('returns an ISO date N days in the future', () => {
    const now = new Date('2026-01-01T00:00:00.000Z')
    expect(durationToExpiresAt('1', now)).toBe('2026-01-02T00:00:00.000Z')
    expect(durationToExpiresAt('7', now)).toBe('2026-01-08T00:00:00.000Z')
    expect(durationToExpiresAt('30', now)).toBe('2026-01-31T00:00:00.000Z')
  })
})
