import { describe, expect, it } from 'vitest'
import { shouldPreserveOriginNoReferrer } from './security-headers.mts'

describe('shouldPreserveOriginNoReferrer', () => {
  it.each(['facebook', 'x', 'github', 'google', 'linkedin', 'microsoft'])(
    'returns true for the %s OAuth broker callback',
    provider => {
      expect(
        shouldPreserveOriginNoReferrer(
          new URL(`https://voucha.ai/auth/callback/${provider}/broker?code=secret&state=secret`),
        ),
      ).toBe(true)
    },
  )

  it.each([
    '/auth/callback/github/brokered',
    '/auth/callback/github/broker/extra',
    '/auth/callback/github',
    '/auth/callback/google/brokered',
    '/auth/callback/google/broker/extra',
  ])('returns false for callback near miss %s', pathname => {
    expect(shouldPreserveOriginNoReferrer(new URL(`https://voucha.ai${pathname}`))).toBe(false)
  })

  it('preserves the origin policy for keyed RSS only', () => {
    expect(
      shouldPreserveOriginNoReferrer(new URL('https://voucha.ai/rss/posts?apikey=fil_xxx')),
    ).toBe(true)
    expect(shouldPreserveOriginNoReferrer(new URL('https://voucha.ai/rss/posts'))).toBe(false)
    expect(shouldPreserveOriginNoReferrer(new URL('https://voucha.ai/rss/posts?apikey='))).toBe(
      false,
    )
    expect(
      shouldPreserveOriginNoReferrer(new URL('https://voucha.ai/api/v1/posts?apikey=fil_xxx')),
    ).toBe(false)
  })
})
