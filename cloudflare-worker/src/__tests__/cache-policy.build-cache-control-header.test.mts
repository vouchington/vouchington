import { describe, expect, it } from 'vitest'
import { buildCacheControlHeader } from '../cache-policy.mts'

describe('buildCacheControlHeader', () => {
  it('builds the anonymous cache policy', () => {
    expect(buildCacheControlHeader(30)).toBe(
      'public, max-age=30, stale-while-revalidate=60, stale-if-error=86400',
    )
  })

  it('builds the long-lived static cache policy', () => {
    expect(buildCacheControlHeader(86_400)).toBe(
      'public, max-age=86400, stale-while-revalidate=172800, stale-if-error=86400',
    )
  })
})
